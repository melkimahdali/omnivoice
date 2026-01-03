// desktop/renderer/views/channelsView.js
export default {
  title: "COMMAND CENTER",
  html: `
    <div class="pad">
      <div class="card">
        <div class="hint">Commander: idle + bisa force connect. Unit: lihat info channel.</div>

        <!-- Commander only -->
        <div id="cmdOnlyBox" style="display:none; margin-top:12px;">
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <div style="flex:1; min-width:280px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.04);">
              <div style="font-weight:800; letter-spacing:.4px;">FORCE CONNECT</div>
              <div class="hint" style="margin-top:6px;">Pilih 1–50 unit. Force akan memutus direct call mereka lalu masuk ke koneksi Commander.</div>

              <div id="cmdPeersList" style="margin-top:10px;"></div>

              <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
                <button id="btnForceConnect" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(0,255,156,.35); background:rgba(0,255,156,.12); color:#dfffea; cursor:pointer;">
                  Force Connect
                </button>
                <button id="btnForceDisconnect" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,77,77,.35); background:rgba(255,77,77,.12); color:#ffe2e2; cursor:pointer;">
                  Force Disconnect
                </button>
              </div>

              <div class="hint" style="margin-top:10px;">
                Commander PTT Override: <b id="cmdOverrideState">OFF</b>
              </div>
            </div>

            <div style="flex:1; min-width:280px; padding:12px; border-radius:14px; border:1px solid rgba(255,196,0,.18); background:rgba(255,196,0,.05);">
              <div style="font-weight:800; letter-spacing:.4px;">INCOMING</div>
              <div class="hint" style="margin-top:6px;">Direct request ke Commander tidak auto accept, selalu menunggu keputusan.</div>

              <div style="margin-top:10px;">
                <div style="font-weight:800;">Request Speak (forced)</div>
                <div id="cmdRequests" style="margin-top:6px;"></div>
              </div>

              <div style="margin-top:14px;">
                <div style="font-weight:800;">Direct Calls (incoming)</div>
                <div id="cmdDirectInbox" style="margin-top:6px;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Non-commander -->
        <div id="nonCmdBox" style="display:none; margin-top:12px;">
          <div class="hint">Radio Channel UI placeholder. Commander-only tools ada di atas (locked oleh role).</div>

          <div style="margin-top:12px;">
            <div class="rowItem">
              <div class="left">
                <div class="avatar"></div>
                <div class="name">
                  <b>LOBBY</b>
                  <span>ACTIVE</span>
                </div>
              </div>
              <div style="font-family: ui-monospace, Menlo, Consolas, monospace; color:rgba(0,255,156,.75);">LIVE</div>
            </div>
          </div>

          <div class="hint" style="margin-top:10px;">
            Next: klik channel = switch room (butuh engine room switch yang aman).
          </div>
        </div>
      </div>
    </div>
  `,
  onShow() {
    window.OmniApp && window.OmniApp.bindChannelsUi && window.OmniApp.bindChannelsUi();
  }
};
