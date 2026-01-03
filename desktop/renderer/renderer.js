// desktop/renderer/renderer.js (ESM entry)
import { setBodyCompactMode } from "./modules/uiUtil.js";
import { injectViews } from "./modules/viewInjection.js";
import { createRouter } from "./modules/router.js";
import { createAccessGate } from "./modules/accessGate.js";
import { Units } from "./modules/unitsStore.js";
import { Engine } from "./modules/engine.js";
import { Views } from "./views/index.js";

// Bridge untuk dipanggil dari onShow() view
window.OmniApp = {
  bindUnitsUi: () => Engine.bindUnitsUi(),
  refreshUnitsUi: () => Engine.refreshUnitsUi(),
  bindChannelsUi: () => Engine.bindChannelsUi(),
  refreshChannelsUi: () => Engine.refreshChannelsUi(),
};

window.addEventListener("DOMContentLoaded", async () => {
  injectViews(Views);
  Units.renderUnits();

  const router = createRouter(Views);
  const accessGate = createAccessGate(router);

  accessGate.init();
  router.start();

  setBodyCompactMode();
  window.addEventListener("resize", setBodyCompactMode);

  await Engine.init();
});
