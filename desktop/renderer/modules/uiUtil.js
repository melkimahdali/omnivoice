// desktop/renderer/modules/uiUtil.js
// UI helpers kecil biar engine & router tidak gemuk.
// ESM module.

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function log(...args) {
  // log ringkas + aman
  try { console.log("[OV]", ...args); } catch {}
}

export function setBadge(el, ok, text) {
  if (!el) return;
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("warn", !ok);
  el.innerHTML = `<span class="pillDot"></span>${text}`;
}

export function setBodyCompactMode() {
  // Compact mode untuk window sempit
  // Kamu bisa sesuaikan threshold tanpa merusak layout.
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;

  const compact = (w < 900) || (h < 620);
  document.body.classList.toggle("compact", compact);
}
