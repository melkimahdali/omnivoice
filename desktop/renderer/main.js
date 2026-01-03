// desktop/renderer/main.js
import { Engine } from "./modules/engine.js";

// views (side-effect registration ke window.OmniViews)
import "./views/mapView.js";
import "./views/linkView.js";
import "./views/channelsView.js";
import "./views/unitsView.js";
import "./views/settingsView.js";
import "./views/loginOverlayView.js";

// router & access gate
import { Router } from "./modules/router.js";
import { AccessGate } from "./modules/accessGate.js";

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[OmniVoice] Booting renderer…");

  // init core engine (WS + RTC + media)
  await Engine.init();

  // init access gate
  AccessGate.init();

  // init router AFTER views are registered
  Router.init();

  console.log("[OmniVoice] Renderer READY");
});
