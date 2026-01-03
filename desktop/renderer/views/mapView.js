// desktop/renderer/views/mapView.js
export default {
  title: "TACTICAL MAP",
  html: `
    <div class="mapWrap">
      <div class="mapCanvas"></div>

      <div class="coordsBox" id="coordsBox">
        X: 3483.24&nbsp;&nbsp;Y: 4021.68&nbsp;&nbsp;Z: 0.20<br />
        ROOM: <span style="color: rgba(235,245,255,.82)">local</span>
        <span style="color: rgba(235,245,255,.45)">|</span>
        SIG: <span style="color: rgba(0,255,156,.75)">EXCELLENT</span>
      </div>

      <div class="radar">
        <div class="centerDot"></div>
      </div>
    </div>
  `,
  onShow() {
    // placeholder: nanti tactical map real-time commander
  }
};
