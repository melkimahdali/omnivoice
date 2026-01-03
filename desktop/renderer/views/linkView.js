// desktop/renderer/views/linkView.js
export default {
  title: "LINK / CALL",
  html: `
    <div class="pad">
      <div class="grid2">
        <div class="card">
          <div class="hint">Device I/O</div>

          <div class="formRow">
            <div class="label">Mic</div>
            <div><select id="micSelect"></select></div>
          </div>

          <div class="formRow">
            <div class="label">Output</div>
            <div><select id="outSelect"></select></div>
          </div>

          <div class="formRow">
            <div class="label">Volume</div>
            <div class="volRow">
              <input id="volSlider" type="range" min="0" max="200" value="100" />
              <div class="volVal"><span id="volLabel">100%</span></div>
            </div>
          </div>

          <div class="actions">
            <button id="btnCall" class="primary" type="button">Call (klik di 1 window saja)</button>
            <button id="btnHang" class="danger" type="button">Hang</button>
          </div>

          <div class="hint" style="margin-top:10px;">
            Signaling: <span style="font-family: ui-monospace, Menlo, Consolas, monospace;">ws://127.0.0.1:8787/ws?room=local</span>
          </div>
        </div>

        <div class="card">
          <div class="hint">Operational Tips</div>
          <div style="margin-top:10px; color: rgba(235,245,255,.75); line-height:1.55;">
            1) Jalankan 2 instance (profile=1 dan profile=2).<br/>
            2) Hotkey instance 2 harus beda agar tidak conflict.<br/>
            3) PTT ON hanya meng-enable track mic, tidak mengubah WS/RTC engine.<br/>
            4) Router view tidak memutus koneksi.
          </div>
        </div>
      </div>
    </div>
  `,
  onShow() {
    // link view saat ini hanya device selector (mic/output) yang dipakai engine
    // Call/Hang masih legacy test harness (akan kita wiring jika kamu minta)
  }
};
