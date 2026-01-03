// desktop/renderer/modules/accessGate.js
export function createAccessGate(router) {
  let isUnlocked = false;

  function apply() {
    const accessBadge = document.getElementById("accessBadge");
    const overlay = document.getElementById("loginOverlay");
    if (accessBadge) accessBadge.textContent = isUnlocked ? "UNLOCKED" : "LOCKED";

    const lockIds = ["navChannels", "navUnits", "navSettings"];
    for (const id of lockIds) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.disabled = !isUnlocked;
    }

    if (overlay) overlay.classList.toggle("show", !isUnlocked);
  }

  function setupOverlay() {
    const userBox = document.getElementById("loginUser");
    const passBox = document.getElementById("loginPass");
    const btnLogin = document.getElementById("btnLogin");
    const btnLogout = document.getElementById("btnLogout");
    const errBox = document.getElementById("loginErr");
    const statusText = document.getElementById("loginStatusText");

    function showErr(text) {
      if (!errBox) return;
      errBox.textContent = text;
      errBox.classList.add("show");
    }

    function clearErr() {
      if (!errBox) return;
      errBox.classList.remove("show");
    }

    function tryUnlock() {
      clearErr();
      const u = (userBox && userBox.value || "").trim();
      const p = (passBox && passBox.value || "").trim();

      if (!u) return showErr("USER REQUIRED");
      if (p !== "omnivoice") return showErr("UNAUTHORIZED");

      isUnlocked = true;
      if (statusText) statusText.textContent = "UNLOCKED";
      apply();
    }

    function lockNow() {
      isUnlocked = false;
      if (statusText) statusText.textContent = "LOCKED";
      apply();
      router && router.showView && router.showView("map");
    }

    if (btnLogin) btnLogin.onclick = tryUnlock;
    if (btnLogout) btnLogout.onclick = lockNow;

    if (passBox) {
      passBox.addEventListener("keydown", (e) => {
        if (e.key === "Enter") tryUnlock();
      });
    }
  }

  function init() {
    isUnlocked = false;
    setupOverlay();
    apply();
  }

  return { init };
}
