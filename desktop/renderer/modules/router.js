// desktop/renderer/modules/router.js
import { log } from "./uiUtil.js";

export function createRouter(Views) {
  const navIds = {
    map: "navMap",
    link: "navLink",
    channels: "navChannels",
    units: "navUnits",
    settings: "navSettings",
  };

  function setNavActiveByView(viewName) {
    const ids = Object.values(navIds);
    const activeId = navIds[viewName] || "";
    for (const id of ids) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.classList.toggle("active", id === activeId);
    }
  }

  function getViewConfig(name) {
    return (Views && Views[name]) ? Views[name] : null;
  }

  function showView(name, { pushHash = true } = {}) {
    const titleEl = document.getElementById("viewTitle");

    const views = document.querySelectorAll(".view");
    views.forEach(v => v.classList.remove("active"));
    const target = document.querySelector(`.view[data-view="${name}"]`);
    if (target) target.classList.add("active");

    setNavActiveByView(name);

    const cfg = getViewConfig(name);
    if (cfg && titleEl) titleEl.textContent = cfg.title || name.toUpperCase();
    if (!cfg && titleEl) titleEl.textContent = String(name || "").toUpperCase();

    if (cfg && typeof cfg.onShow === "function") {
      try { cfg.onShow(); } catch (e) { log("onShow error:", e); }
    }

    if (pushHash) {
      const h = `#${name}`;
      if (location.hash !== h) location.hash = h;
    }
  }

  function viewFromHash() {
    const raw = (location.hash || "").replace("#", "").trim();
    if (!raw) return "map";
    if (raw === "ch") return "channels";
    return raw;
  }

  function bindNavClicks() {
    const mapBtn = document.getElementById(navIds.map);
    const linkBtn = document.getElementById(navIds.link);
    const chBtn = document.getElementById(navIds.channels);
    const unitsBtn = document.getElementById(navIds.units);
    const setBtn = document.getElementById(navIds.settings);

    mapBtn && (mapBtn.onclick = () => showView("map"));
    linkBtn && (linkBtn.onclick = () => showView("link"));
    chBtn && (chBtn.onclick = () => showView("channels"));
    unitsBtn && (unitsBtn.onclick = () => showView("units"));
    setBtn && (setBtn.onclick = () => showView("settings"));
  }

  function start() {
    bindNavClicks();

    window.addEventListener("hashchange", () => {
      const v = viewFromHash();
      showView(v, { pushHash: false });

      if (v === "units") window.OmniApp && window.OmniApp.refreshUnitsUi && window.OmniApp.refreshUnitsUi();
      if (v === "channels") window.OmniApp && window.OmniApp.refreshChannelsUi && window.OmniApp.refreshChannelsUi();
    });

    const v = viewFromHash();
    showView(v, { pushHash: false });
  }

  return { showView, start };
}
