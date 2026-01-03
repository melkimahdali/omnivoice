// worker-signaling/src/index.ts
import { RoomHub } from "./roomHub";

export { RoomHub };

export interface Env {
  ROOM_HUB: DurableObjectNamespace;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    // Debug helper: lihat DO id untuk room tertentu
    if (url.pathname === "/debug/room") {
      const room = (url.searchParams.get("room") || "local").trim();
      const id = env.ROOM_HUB.idFromName(room).toString();
      return json({ ok: true, room, durableObjectId: id });
    }

    if (url.pathname !== "/ws") {
      return new Response("Not found", { status: 404 });
    }

    const upgrade = req.headers.get("Upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const room = (url.searchParams.get("room") || "local").trim();
    const id = env.ROOM_HUB.idFromName(room);
    const stub = env.ROOM_HUB.get(id);

    // Sisipkan room ke header (biar RoomHub bisa log)
    const req2 = new Request(req, {
      headers: new Headers(req.headers)
    });
    req2.headers.set("x-ov-room", room);

    return stub.fetch(req2);
  }
};
