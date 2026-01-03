// desktop/renderer/views/unitsView.js
export default {
  title: "UNITS (DIRECT CALL)",
  html: `
    <div class="pad">
      <div class="card">
        <div class="hint">Direct Call (2 party). Unit-to-unit: AUTO CONNECT saat target kosong.</div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <select id="directTarget" style="min-width:220px; padding:10px; border-radius:12px; background:#0b1020; color:#e9eefc; border:1px solid rgba(255,255,255,.10);">
            <option value="">(loading peers)</option>
          </select>
          <button id="btnInvite" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(0,255,156,.35); background:rgba(0,255,156,.12); color:#dfffea; cursor:pointer;">
            Connect
          </button>
          <button id="btnEndDirect" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,77,77,.35); background:rgba(255,77,77,.12); color:#ffe2e2; cursor:pointer;">
            End
          </button>
        </div>

        <div id="directStatus" class="hint" style="margin-top:10px;">Status: WAITING TO PEER</div>

        <div id="incomingInviteBox" style="display:none; margin-top:12px; padding:12px; border-radius:14px; border:1px solid rgba(255,196,0,.25); background:rgba(255,196,0,.07);">
          <div id="incomingInviteText" style="color:#ffe9a8; font-weight:700;">Incoming invite</div>
          <div class="hint" style="margin-top:6px;">Jika kamu sedang busy, Accept akan switch ke peer baru.</div>
          <div style="margin-top:10px; display:flex; gap:10px;">
            <button id="btnAcceptInvite" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(0,255,156,.35); background:rgba(0,255,156,.12); color:#dfffea; cursor:pointer;">
              Accept (Switch)
            </button>
            <button id="btnRejectInvite" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,77,77,.35); background:rgba(255,77,77,.12); color:#ffe2e2; cursor:pointer;">
              Reject
            </button>
          </div>
        </div>

        <button id="btnRequestSpeak" style="display:none; margin-top:12px; padding:10px 14px; border-radius:12px; border:1px solid rgba(255,196,0,.35); background:rgba(255,196,0,.12); color:#fff2c6; cursor:pointer;">
          🟡 Request izin bicara (Commander)
        </button>

        <hr style="margin:14px 0; opacity:.15;" />

        <div class="hint">Units Online (presence dari worker):</div>
        <div id="unitsList" class="list" style="margin-top:10px;"></div>
      </div>
    </div>
  `,
  onShow() {
    window.OmniApp && window.OmniApp.bindUnitsUi && window.OmniApp.bindUnitsUi();
  }
};
