// worker-signaling/src/roomHub.ts
type Client = {
  id: string;
  ws: WebSocket;
  label: string; // stable UI label, e.g. unit-1 / commander
  role: string;  // unit / commander
};

function uid(): string {
  const a = crypto.getRandomValues(new Uint8Array(16));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeParse(raw: unknown): any | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asStringArray(v: any): string[] {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}

function sanitizeLabel(s: any): string {
  const raw = String(s || "").trim().toLowerCase();
  const safe = raw.replace(/[^a-z0-9\-_]/g, "").slice(0, 24);
  return safe || "unit";
}

function sanitizeRole(s: any): string {
  const raw = String(s || "").trim().toLowerCase();
  if (raw === "commander") return "commander";
  return "unit";
}

export class RoomHub implements DurableObject {
  private clients = new Map<string, Client>();

  constructor(private state: DurableObjectState, private env: unknown) {}

  async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get("Upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const room = req.headers.get("x-ov-room") || "local";

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const id = uid();
    server.accept();

    // Snapshot peers BEFORE insert (send objects with label/role)
    const peersBefore = [...this.clients.values()].map((c) => ({
      id: c.id,
      label: c.label,
      role: c.role
    }));

    // Register with defaults; client will "identify" after hello
    this.clients.set(id, { id, ws: server, label: "unit", role: "unit" });

    const sendTo = (toId: string, payload: string) => {
      const c = this.clients.get(toId);
      if (!c) return;
      try { c.ws.send(payload); } catch {}
    };

    const sendToMany = (toIds: string[], payload: string, exceptId?: string) => {
      for (const tid of toIds) {
        if (!tid) continue;
        if (exceptId && tid === exceptId) continue;
        sendTo(tid, payload);
      }
    };

    const broadcast = (payload: string, exceptId?: string) => {
      const list = [...this.clients.entries()];
      for (const [otherId, c] of list) {
        if (otherId === exceptId) continue;
        try { c.ws.send(payload); } catch {}
      }
    };

    // hello + presence sync
    server.send(JSON.stringify({ t: "hello", id, room }));
    server.send(JSON.stringify({ t: "peers", room, peers: peersBefore }));

    // Defer peer_join one tick
    queueMicrotask(() => {
      broadcast(JSON.stringify({ t: "peer_join", id, room }), id);
    });

    console.log(`[RoomHub] room=${room} join id=${id} clients=${this.clients.size}`);

    server.addEventListener("message", (ev: MessageEvent) => {
      const msg = safeParse(ev.data);
      if (!msg) return;

      // Keepalive
      if (msg.t === "ping") {
        try { server.send(JSON.stringify({ t: "pong", ts: Date.now(), room })); } catch {}
        return;
      }

      // Identify: update label/role and broadcast peer_update
      if (msg.t === "identify") {
        const c = this.clients.get(id);
        if (!c) return;

        c.label = sanitizeLabel(msg.label);
        c.role = sanitizeRole(msg.role);

        queueMicrotask(() => {
          broadcast(JSON.stringify({
            t: "peer_update",
            id,
            room,
            label: c.label,
            role: c.role
          }));
        });

        return;
      }

      const toIds = asStringArray(msg.to);

      if (msg.t === "hang") {
        const payload = JSON.stringify({ t: "hang", room, _from: id });
        queueMicrotask(() => {
          if (toIds.length > 0) sendToMany(toIds, payload, id);
          else broadcast(payload, id);
        });
        return;
      }

      const payload = JSON.stringify({ ...msg, _from: id, room });
      queueMicrotask(() => {
        if (toIds.length > 0) sendToMany(toIds, payload, id);
        else broadcast(payload, id);
      });
    });

    const cleanup = () => {
      this.clients.delete(id);
      queueMicrotask(() => {
        broadcast(JSON.stringify({ t: "peer_left", id, room }), id);
      });
      console.log(`[RoomHub] room=${room} left id=${id} clients=${this.clients.size}`);
    };

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }
}
