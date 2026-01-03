// desktop/renderer/modules/unitsStore.js
export const Units = (() => {
  // Map: wsId -> { id, label, role }
  const peers = new Map();

  function unitsEl() { return document.getElementById("unitsList"); }

  function bestName(p) {
    if (!p) return "peer";
    const label = String(p.label || "").trim();
    if (label) return label;
    return String(p.id || "peer").slice(0, 10);
  }

  function unitRowHtml(p) {
    const name = bestName(p);
    const role = String(p.role || "unit");
    const tint = (role === "commander") ? "rgba(255,196,0,.85)" : "rgba(0,255,156,.75)";
    return `
      <div class="rowItem">
        <div class="left">
          <div class="avatar"></div>
          <div class="name">
            <b>${name}</b>
            <span>${role}</span>
          </div>
        </div>
        <div style="font-family: ui-monospace, Menlo, Consolas, monospace; color:${tint};">${role.toUpperCase()}</div>
      </div>
    `;
  }

  function renderUnits() {
    const el = unitsEl();
    if (!el) return;

    const list = Array.from(peers.values()).sort((a, b) => bestName(a).localeCompare(bestName(b)));
    if (list.length === 0) {
      el.innerHTML = `<div class="hint">No peers yet. Jalankan instance lain.</div>`;
      return;
    }
    el.innerHTML = list.map(unitRowHtml).join("");
  }

  function upsertPeer(obj) {
    if (!obj || !obj.id) return;
    peers.set(String(obj.id), { id: String(obj.id), label: String(obj.label || ""), role: String(obj.role || "unit") });
  }

  function removePeer(id) {
    peers.delete(String(id));
  }

  function setPeers(arr) {
    peers.clear();
    for (const it of (arr || [])) {
      if (typeof it === "string") {
        upsertPeer({ id: it, label: "", role: "unit" });
      } else {
        upsertPeer(it);
      }
    }
    renderUnits();
  }

  function peerById(id) {
    return peers.get(String(id)) || null;
  }

  function displayNameById(id) {
    const p = peerById(id);
    if (!p) return String(id).slice(0, 10);
    return bestName(p);
  }

  function listForSelect(selfId) {
    const out = [];
    for (const p of peers.values()) {
      if (String(p.id) === String(selfId || "")) continue;
      out.push(p);
    }
    out.sort((a, b) => bestName(a).localeCompare(bestName(b)));
    return out;
  }

  return { renderUnits, setPeers, upsertPeer, removePeer, peerById, displayNameById, listForSelect };
})();
