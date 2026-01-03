// desktop/renderer/views/loginOverlayView.js
export default {
  html: `
    <div class="loginCard">
      <div class="loginTitle">
        <b>ACCESS GATE</b>
        <span id="loginStatusText">LOCKED</span>
      </div>

      <div class="hint">
        Login untuk membuka navigasi, channels, units, settings. Hotkey tetap aktif untuk PTT indicator.
      </div>

      <div class="pad" style="padding: 12px 0 0 0;">
        <div class="formRow">
          <div class="label">User</div>
          <div><input id="loginUser" type="text" placeholder="commander / unit-01" /></div>
        </div>
        <div class="formRow">
          <div class="label">Pass</div>
          <div><input id="loginPass" type="password" placeholder="••••••••" /></div>
        </div>

        <div class="actions">
          <button id="btnLogin" class="primary" type="button">Unlock</button>
          <button id="btnLogout" type="button">Lock</button>
        </div>

        <div class="loginErr" id="loginErr">UNAUTHORIZED</div>

        <div class="loginHint">
          Mode dev: password default <b style="color:rgba(235,245,255,.9);">omnivoice</b>.
        </div>
      </div>
    </div>
  `
};
