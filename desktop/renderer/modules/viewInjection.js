// desktop/renderer/modules/viewInjection.js
export function injectViews(Views) {
  const hostViews = document.querySelectorAll(".view[data-view]");
  hostViews.forEach((sec) => {
    const name = sec.getAttribute("data-view");
    const cfg = Views && Views[name] ? Views[name] : null;
    sec.innerHTML = cfg ? cfg.html : `<div class="pad"><div class="card">Missing view: ${name}</div></div>`;
  });

  const overlay = document.getElementById("loginOverlay");
  if (overlay && Views && Views.loginOverlay) {
    overlay.innerHTML = Views.loginOverlay.html;
  }
}
