var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/roomHub.ts
function uid() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(uid, "uid");
function safeParse(raw) {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(safeParse, "safeParse");
function asStringArray(v) {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}
__name(asStringArray, "asStringArray");
function sanitizeLabel(s) {
  const raw = String(s || "").trim().toLowerCase();
  const safe = raw.replace(/[^a-z0-9\-_]/g, "").slice(0, 24);
  return safe || "unit";
}
__name(sanitizeLabel, "sanitizeLabel");
function sanitizeRole(s) {
  const raw = String(s || "").trim().toLowerCase();
  if (raw === "commander") return "commander";
  return "unit";
}
__name(sanitizeRole, "sanitizeRole");
var RoomHub = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  static {
    __name(this, "RoomHub");
  }
  clients = /* @__PURE__ */ new Map();
  async fetch(req) {
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
    const peersBefore = [...this.clients.values()].map((c) => ({
      id: c.id,
      label: c.label,
      role: c.role
    }));
    this.clients.set(id, { id, ws: server, label: "unit", role: "unit" });
    const sendTo = /* @__PURE__ */ __name((toId, payload) => {
      const c = this.clients.get(toId);
      if (!c) return;
      try {
        c.ws.send(payload);
      } catch {
      }
    }, "sendTo");
    const sendToMany = /* @__PURE__ */ __name((toIds, payload, exceptId) => {
      for (const tid of toIds) {
        if (!tid) continue;
        if (exceptId && tid === exceptId) continue;
        sendTo(tid, payload);
      }
    }, "sendToMany");
    const broadcast = /* @__PURE__ */ __name((payload, exceptId) => {
      const list = [...this.clients.entries()];
      for (const [otherId, c] of list) {
        if (otherId === exceptId) continue;
        try {
          c.ws.send(payload);
        } catch {
        }
      }
    }, "broadcast");
    server.send(JSON.stringify({ t: "hello", id, room }));
    server.send(JSON.stringify({ t: "peers", room, peers: peersBefore }));
    queueMicrotask(() => {
      broadcast(JSON.stringify({ t: "peer_join", id, room }), id);
    });
    console.log(`[RoomHub] room=${room} join id=${id} clients=${this.clients.size}`);
    server.addEventListener("message", (ev) => {
      const msg = safeParse(ev.data);
      if (!msg) return;
      if (msg.t === "ping") {
        try {
          server.send(JSON.stringify({ t: "pong", ts: Date.now(), room }));
        } catch {
        }
        return;
      }
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
        const payload2 = JSON.stringify({ t: "hang", room, _from: id });
        queueMicrotask(() => {
          if (toIds.length > 0) sendToMany(toIds, payload2, id);
          else broadcast(payload2, id);
        });
        return;
      }
      const payload = JSON.stringify({ ...msg, _from: id, room });
      queueMicrotask(() => {
        if (toIds.length > 0) sendToMany(toIds, payload, id);
        else broadcast(payload, id);
      });
    });
    const cleanup = /* @__PURE__ */ __name(() => {
      this.clients.delete(id);
      queueMicrotask(() => {
        broadcast(JSON.stringify({ t: "peer_left", id, room }), id);
      });
      console.log(`[RoomHub] room=${room} left id=${id} clients=${this.clients.size}`);
    }, "cleanup");
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);
    return new Response(null, { status: 101, webSocket: client });
  }
};

// src/index.ts
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" }
  });
}
__name(json, "json");
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    if (url.pathname === "/debug/room") {
      const room2 = (url.searchParams.get("room") || "local").trim();
      const id2 = env.ROOM_HUB.idFromName(room2).toString();
      return json({ ok: true, room: room2, durableObjectId: id2 });
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
    const req2 = new Request(req, {
      headers: new Headers(req.headers)
    });
    req2.headers.set("x-ov-room", room);
    return stub.fetch(req2);
  }
};

// C:/Users/bndmalut/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// C:/Users/bndmalut/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-IwaEO9/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// C:/Users/bndmalut/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-IwaEO9/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  RoomHub,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
