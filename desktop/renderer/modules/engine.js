// desktop/renderer/modules/engine.js
import { log, setBadge } from "./uiUtil.js";
import { Units } from "./unitsStore.js";

export const Engine = (() => {
  let ws;
  let selfId;

  // identity from main process
  let role = "unit"; // unit | commander
  let displayName = "unit";

  // badges
  let wsBadge, rtcBadge, pttBadge, hk, hkok, profileEl;

  // audio
  let localStream;
  let localTrack;
  let selectedMicId = null;
  let selectedOutId = null;

  // link view ui (device + volume + quick call/hang)
  let micSelectEl = null;
  let outSelectEl = null;
  let volSliderEl = null;
  let volLabelEl = null;
  let btnCallEl = null;
  let btnHangEl = null;
  let currentVolume = 1.0; // 0..2

  // reconnect
  let pingTimer = null;
  let wsReconnectTimer = null;
  let wsReconnectAttempt = 0;

  // unit direct/forced state
  const UnitSession = {
    mode: "none",        // none | direct | forced
    peerId: null,
    incomingFrom: null,
    forcedBy: null,
    speakAllowed: false,
    speakPending: false,
    commandTalking: false
  };

  // commander direct inbox (manual accept always)
  const CmdDirectInbox = new Map(); // fromWsId -> { ts }
  const CmdForce = {
    targets: new Set(),
    forcedTargets: new Set(),
    requests: new Map(),
    pttOverride: false
  };

  // UI units view
  let directTargetSel, btnInvite, btnEndDirect, directStatus;
  let incomingInviteBox, incomingInviteText, btnAcceptInvite, btnRejectInvite;
  let btnRequestSpeak;

  // UI channels view (commander)
  let cmdOnlyBox, nonCmdBox, cmdPeersList, btnForceConnect, btnForceDisconnect, cmdRequests, cmdOverrideState, cmdDirectInboxEl;

  // rtc objects (unit)
  let unitPc = null;
  let unitMakingOffer = false;
  let unitIgnoreOffer = false;
  let unitIsPolite = true;
  const unitPendingCandidates = [];

  // commander multi-peer
  const peerConns = new Map(); // peerId -> PeerConn

  function nowMs() { return Date.now(); }

  function setRtc(text, ok = false) { setBadge(rtcBadge, ok, text); }

  function unitRemoteAudioEl() { return document.getElementById("remoteAudio"); }

  function decidePolite(a, b) {
    if (!a || !b) return true;
    return String(a) < String(b);
  }

  function wsSend(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  function startPingLoop() {
    stopPingLoop();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ t: "ping", ts: nowMs() })); } catch {}
      }
    }, 15000);
  }

  function stopPingLoop() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  function stopWsReconnect() {
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  }

  function scheduleWsReconnect() {
    stopWsReconnect();
    wsReconnectAttempt = Math.min(wsReconnectAttempt + 1, 10);
    const delay = Math.min(250 * Math.pow(2, wsReconnectAttempt), 8000);
    wsReconnectTimer = setTimeout(() => setupWs(), delay);
  }

  function getRoomWsUrl() {
    return "ws://127.0.0.1:8787/ws?room=local";
  }

  // -------------------------
  // Link View bindings (devices + volume + quick call/hang)
  // -------------------------
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function applyRemoteVolume() {
    // unit audio
    const a = unitRemoteAudioEl();
    if (a) a.volume = currentVolume;

    // commander audio (hidden per peer)
    document.querySelectorAll("audio[data-ov-remote='1']").forEach((el) => {
      try { el.volume = currentVolume; } catch {}
    });
  }

  function setVolumeFromSliderValue(v) {
    const num = Number(v);
    const pct = clamp(isFinite(num) ? num : 100, 0, 200);
    currentVolume = pct / 100.0;
    if (volLabelEl) volLabelEl.textContent = `${pct}%`;
    applyRemoteVolume();
  }

  function getDirectTargetFromUnitsSelect() {
    const sel = document.getElementById("directTarget");
    if (!sel) return "";
    return String(sel.value || "").trim();
  }

  async function quickCallFromLink() {
    if (role === "commander") {
      const targets = Array.from(CmdForce.targets);
      if (targets.length === 0) return alert("Commander: pilih unit target dulu di Channels (Command Center).");
      if (targets.length > 50) return alert("Commander: Max 50 target.");

      CmdForce.forcedTargets = new Set(targets);
      for (const tid of targets) wsSend({ t: "command_force_connect", to: tid });

      setRtc("RTC: COMMAND FORCING", false);
      return;
    }

    // unit
    if (UnitSession.mode !== "none") {
      if (UnitSession.mode === "forced") return alert("Unit sedang forced. Tidak bisa call direct.");
      return alert("Unit sedang direct. End dulu sebelum call lagi.");
    }

    const target = getDirectTargetFromUnitsSelect();
    if (!target) return alert("Unit: pilih target dulu di Units (dropdown).");

    UnitSession.mode = "direct";
    UnitSession.peerId = target;
    UnitSession.incomingFrom = null;

    hideIncomingInvite();
    setDirectStatus(`CALLING ${Units.displayNameById(target)}...`);
    setRtc("RTC: AUTO CONNECTING", false);

    if (!wsSend({ t: "direct_invite", to: target })) {
      alert("WS belum terkoneksi.");
      UnitSession.mode = "none";
      UnitSession.peerId = null;
      updateUnitUiFromSession();
    }
  }

  async function quickHangFromLink() {
    if (role === "commander") {
      // disconnect all forced + drop all conns
      for (const tid of Array.from(CmdForce.forcedTargets)) {
        wsSend({ t: "command_force_disconnect", to: tid });
        wsSend({ t: "hang", to: tid });
      }
      cmdDropAll();
      CmdForce.forcedTargets.clear();
      CmdForce.targets.clear();
      refreshChannelsUi();
      setRtc("RTC: IDLE", false);
      return;
    }

    // unit
    if (UnitSession.mode === "forced") return alert("Unit forced: tidak bisa hang. Minta Commander disconnect.");
    if (UnitSession.mode !== "direct") return;

    const peer = UnitSession.peerId;

    UnitSession.mode = "none";
    UnitSession.peerId = null;
    UnitSession.incomingFrom = null;
    hideIncomingInvite();

    if (peer) {
      wsSend({ t: "direct_end", to: peer });
      wsSend({ t: "hang", to: peer });
    }

    await unitHardClose();
    updateUnitUiFromSession();
  }

  async function loadDevices() {
    micSelectEl = document.getElementById("micSelect");
    outSelectEl = document.getElementById("outSelect");
    volSliderEl = document.getElementById("volSlider");
    volLabelEl = document.getElementById("volLabel");
    btnCallEl = document.getElementById("btnCall");
    btnHangEl = document.getElementById("btnHang");

    if (!micSelectEl || !outSelectEl) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    micSelectEl.innerHTML = "";
    outSelectEl.innerHTML = "";

    devices.forEach((d) => {
      if (d.kind === "audioinput") {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || "Microphone";
        micSelectEl.appendChild(opt);
      }
      if (d.kind === "audiooutput") {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || "Speaker";
        outSelectEl.appendChild(opt);
      }
    });

    selectedMicId = micSelectEl.value || null;
    selectedOutId = outSelectEl.value || null;

    // volume init
    if (volSliderEl) {
      // default 100% if empty
      const initV = volSliderEl.value || "100";
      setVolumeFromSliderValue(initV);

      volSliderEl.oninput = () => setVolumeFromSliderValue(volSliderEl.value);
      volSliderEl.onchange = () => setVolumeFromSliderValue(volSliderEl.value);
    } else {
      // ensure still applied
      applyRemoteVolume();
    }

    if (btnCallEl) btnCallEl.onclick = () => quickCallFromLink();
    if (btnHangEl) btnHangEl.onclick = () => quickHangFromLink();

    micSelectEl.onchange = async () => {
      selectedMicId = micSelectEl.value || null;
      await resetMedia();

      // replace track for unit connection
      if (unitPc) {
        const sender = unitPc.getSenders().find(s => s.track && s.track.kind === "audio");
        if (sender) { try { await sender.replaceTrack(localTrack); } catch {} }
      }

      // replace for commander conns
      for (const pcObj of peerConns.values()) {
        try { await pcObj.replaceLocalTrack(localTrack); } catch {}
      }
    };

    outSelectEl.onchange = async () => {
      selectedOutId = outSelectEl.value || null;

      const a = unitRemoteAudioEl();
      if (a && a.setSinkId && selectedOutId) {
        try { await a.setSinkId(selectedOutId); } catch {}
      }

      document.querySelectorAll("audio[data-ov-remote='1']").forEach(async (el) => {
        try { if (el.setSinkId && selectedOutId) await el.setSinkId(selectedOutId); } catch {}
      });
    };
  }

  async function resetMedia() {
    if (localStream) {
      try { localStream.getTracks().forEach((t) => t.stop()); } catch {}
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
    });

    localTrack = localStream.getAudioTracks()[0];
    localTrack.enabled = false;
  }

  // -------------------------
  // Units UI helpers
  // -------------------------
  function setDirectStatus(text) {
    if (directStatus) directStatus.textContent = `Status: ${text}`;
  }

  function showIncomingInvite(fromId, note) {
    if (incomingInviteText) {
      const who = Units.displayNameById(fromId);
      incomingInviteText.textContent = note ? `${who} ingin direct call (${note})` : `${who} ingin direct call`;
    }
    if (incomingInviteBox) incomingInviteBox.style.display = "block";
  }

  function hideIncomingInvite() {
    if (incomingInviteBox) incomingInviteBox.style.display = "none";
  }

  function showRequestSpeakButton(show) {
    if (!btnRequestSpeak) return;
    btnRequestSpeak.style.display = show ? "inline-block" : "none";
  }

  function refreshTargetOptions() {
    if (!directTargetSel) return;
    const list = Units.listForSelect(selfId);
    const prev = directTargetSel.value || "";

    if (list.length === 0) {
      directTargetSel.innerHTML = `<option value="">(no peers)</option>`;
      return;
    }

    directTargetSel.innerHTML = `<option value="">(pilih target)</option>` + list.map(p => {
      const name = String(p.label || "").trim() ? p.label : String(p.id).slice(0, 10);
      return `<option value="${p.id}">${name}</option>`;
    }).join("");

    if (prev && list.some(x => String(x.id) === prev)) directTargetSel.value = prev;
  }

  function updateUnitUiFromSession() {
    if (role === "commander") return;

    const forced = UnitSession.mode === "forced";
    if (directTargetSel) directTargetSel.disabled = forced;
    if (btnInvite) btnInvite.disabled = forced;
    if (btnEndDirect) btnEndDirect.disabled = forced || UnitSession.mode !== "direct";

    showRequestSpeakButton(forced);

    if (forced) {
      const speak = UnitSession.speakAllowed ? "ALLOWED" : (UnitSession.speakPending ? "PENDING" : "LOCKED");
      const talk = UnitSession.commandTalking ? " | COMMAND TALKING" : "";
      setDirectStatus(`FORCED by ${Units.displayNameById(UnitSession.forcedBy || "")} | SPEAK=${speak}${talk}`);
      setRtc("RTC: FORCED LINK", false);
      return;
    }

    if (UnitSession.mode === "direct") {
      setDirectStatus(`DIRECT with ${Units.displayNameById(UnitSession.peerId || "")}`);
      return;
    }

    setDirectStatus("WAITING TO PEER");
    setRtc("RTC: WAITING PEER", false);
  }

  // -------------------------
  // Commander Channels UI helpers
  // -------------------------
  function refreshChannelsUi() {
    cmdOnlyBox = document.getElementById("cmdOnlyBox");
    nonCmdBox = document.getElementById("nonCmdBox");
    cmdPeersList = document.getElementById("cmdPeersList");
    cmdRequests = document.getElementById("cmdRequests");
    cmdOverrideState = document.getElementById("cmdOverrideState");
    cmdDirectInboxEl = document.getElementById("cmdDirectInbox");

    if (cmdOnlyBox) cmdOnlyBox.style.display = (role === "commander") ? "block" : "none";
    if (nonCmdBox) nonCmdBox.style.display = (role !== "commander") ? "block" : "none";

    if (role !== "commander") return;

    // peers list
    if (cmdPeersList) {
      const list = Units.listForSelect(selfId).filter(p => String(p.role || "") !== "commander");
      if (list.length === 0) {
        cmdPeersList.innerHTML = `<div class="hint">No units yet.</div>`;
      } else {
        cmdPeersList.innerHTML = list.map((p) => {
          const name = Units.displayNameById(p.id);
          const checked = CmdForce.targets.has(p.id) ? "checked" : "";
          const forced = CmdForce.forcedTargets.has(p.id);
          return `
            <label class="rowItem" style="cursor:pointer; margin-bottom:8px; user-select:none;">
              <div class="left">
                <div class="avatar"></div>
                <div class="name">
                  <b>${name}</b>
                  <span>${forced ? "FORCED" : "online"}</span>
                </div>
              </div>
              <input type="checkbox" data-cmd-target="${p.id}" ${checked}
                style="transform:scale(1.2); accent-color:#00ff9c;" />
            </label>
          `;
        }).join("");

        cmdPeersList.querySelectorAll("input[data-cmd-target]").forEach((cb) => {
          cb.onchange = () => {
            const tid = cb.getAttribute("data-cmd-target");
            if (!tid) return;
            if (cb.checked) CmdForce.targets.add(tid);
            else CmdForce.targets.delete(tid);
          };
        });
      }
    }

    // request speak list
    if (cmdRequests) {
      const ids = Array.from(CmdForce.requests.keys());
      if (ids.length === 0) {
        cmdRequests.innerHTML = `<div class="hint">No requests.</div>`;
      } else {
        cmdRequests.innerHTML = ids.map((uid) => {
          const name = Units.displayNameById(uid);
          return `
            <div class="rowItem" style="margin-top:8px; border:1px solid rgba(255,196,0,.18); background:rgba(255,196,0,.06);">
              <div class="left">
                <div class="avatar" style="background:rgba(255,196,0,.25);"></div>
                <div class="name">
                  <b>${name}</b>
                  <span>request speak</span>
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button data-allow="${uid}" style="padding:8px 12px; border-radius:12px; border:1px solid rgba(0,255,156,.35); background:rgba(0,255,156,.12); color:#dfffea; cursor:pointer;">Izinkan</button>
                <button data-deny="${uid}" style="padding:8px 12px; border-radius:12px; border:1px solid rgba(255,77,77,.35); background:rgba(255,77,77,.12); color:#ffe2e2; cursor:pointer;">Abaikan</button>
              </div>
            </div>
          `;
        }).join("");

        cmdRequests.querySelectorAll("button[data-allow]").forEach((b) => {
          b.onclick = () => {
            const uid = b.getAttribute("data-allow");
            if (!uid) return;
            CmdForce.requests.delete(uid);
            wsSend({ t: "command_allow_speak", to: uid, allow: true });
            refreshChannelsUi();
          };
        });

        cmdRequests.querySelectorAll("button[data-deny]").forEach((b) => {
          b.onclick = () => {
            const uid = b.getAttribute("data-deny");
            if (!uid) return;
            CmdForce.requests.delete(uid);
            wsSend({ t: "command_allow_speak", to: uid, allow: false });
            refreshChannelsUi();
          };
        });
      }
    }

    // direct inbox (manual accept always)
    if (cmdDirectInboxEl) {
      const ids = Array.from(CmdDirectInbox.keys());
      if (ids.length === 0) {
        cmdDirectInboxEl.innerHTML = `<div class="hint">No direct requests.</div>`;
      } else {
        cmdDirectInboxEl.innerHTML = ids.map((fromId) => {
          const name = Units.displayNameById(fromId);
          return `
            <div class="rowItem" style="margin-top:8px; border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.04);">
              <div class="left">
                <div class="avatar"></div>
                <div class="name">
                  <b>${name}</b>
                  <span>direct request</span>
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button data-cmd-direct-accept="${fromId}" style="padding:8px 12px; border-radius:12px; border:1px solid rgba(0,255,156,.35); background:rgba(0,255,156,.12); color:#dfffea; cursor:pointer;">Accept</button>
                <button data-cmd-direct-reject="${fromId}" style="padding:8px 12px; border-radius:12px; border:1px solid rgba(255,77,77,.35); background:rgba(255,77,77,.12); color:#ffe2e2; cursor:pointer;">Reject</button>
              </div>
            </div>
          `;
        }).join("");

        cmdDirectInboxEl.querySelectorAll("button[data-cmd-direct-accept]").forEach((b) => {
          b.onclick = async () => {
            const fromId = b.getAttribute("data-cmd-direct-accept");
            if (!fromId) return;

            CmdDirectInbox.delete(fromId);
            refreshChannelsUi();

            wsSend({ t: "direct_accept", to: fromId });
            setRtc("RTC: COMMAND ACCEPTING DIRECT", false);
          };
        });

        cmdDirectInboxEl.querySelectorAll("button[data-cmd-direct-reject]").forEach((b) => {
          b.onclick = () => {
            const fromId = b.getAttribute("data-cmd-direct-reject");
            if (!fromId) return;
            CmdDirectInbox.delete(fromId);
            refreshChannelsUi();
            wsSend({ t: "direct_reject", to: fromId });
          };
        });
      }
    }

    if (cmdOverrideState) cmdOverrideState.textContent = CmdForce.pttOverride ? "ON" : "OFF";
  }

  // -------------------------
  // Bind Units view
  // -------------------------
  function bindUnitsUi() {
    directTargetSel = document.getElementById("directTarget");
    btnInvite = document.getElementById("btnInvite");
    btnEndDirect = document.getElementById("btnEndDirect");
    directStatus = document.getElementById("directStatus");

    incomingInviteBox = document.getElementById("incomingInviteBox");
    incomingInviteText = document.getElementById("incomingInviteText");
    btnAcceptInvite = document.getElementById("btnAcceptInvite");
    btnRejectInvite = document.getElementById("btnRejectInvite");

    btnRequestSpeak = document.getElementById("btnRequestSpeak");

    refreshTargetOptions();
    updateUnitUiFromSession();

    if (btnInvite) {
      btnInvite.onclick = async () => {
        if (role === "commander") return alert("Commander tidak direct dari Units. Gunakan Channels (Command Center).");
        if (UnitSession.mode !== "none") return alert("Sedang ada sesi. End dulu / forced tidak bisa direct.");

        const target = directTargetSel ? (directTargetSel.value || "") : "";
        if (!target) return alert("Pilih target dulu.");

        UnitSession.mode = "direct";
        UnitSession.peerId = target;
        UnitSession.incomingFrom = null;

        hideIncomingInvite();
        setDirectStatus(`CALLING ${Units.displayNameById(target)}...`);
        setRtc("RTC: AUTO CONNECTING", false);

        if (!wsSend({ t: "direct_invite", to: target })) {
          alert("WS belum terkoneksi.");
          UnitSession.mode = "none";
          UnitSession.peerId = null;
          updateUnitUiFromSession();
        }
      };
    }

    if (btnEndDirect) {
      btnEndDirect.onclick = async () => {
        if (UnitSession.mode !== "direct") return;
        const peer = UnitSession.peerId;

        UnitSession.mode = "none";
        UnitSession.peerId = null;
        UnitSession.incomingFrom = null;
        hideIncomingInvite();

        if (peer) {
          wsSend({ t: "direct_end", to: peer });
          wsSend({ t: "hang", to: peer });
        }

        await unitHardClose();
        updateUnitUiFromSession();
      };
    }

    if (btnAcceptInvite) {
      btnAcceptInvite.onclick = async () => {
        if (role === "commander") return;

        const from = UnitSession.incomingFrom;
        if (!from) return;

        if (UnitSession.mode === "forced") {
          wsSend({ t: "direct_reject", to: from });
          UnitSession.incomingFrom = null;
          hideIncomingInvite();
          return;
        }

        if (UnitSession.mode === "direct" && UnitSession.peerId) {
          const oldPeer = UnitSession.peerId;
          wsSend({ t: "direct_end", to: oldPeer });
          wsSend({ t: "hang", to: oldPeer });
          await unitHardClose();
        }

        UnitSession.mode = "direct";
        UnitSession.peerId = from;
        UnitSession.incomingFrom = null;

        hideIncomingInvite();
        setDirectStatus(`SWITCH ACCEPTED from ${Units.displayNameById(from)}. Waiting offer...`);
        setRtc("RTC: WAITING OFFER", false);

        wsSend({ t: "direct_accept", to: from });
        updateUnitUiFromSession();
      };
    }

    if (btnRejectInvite) {
      btnRejectInvite.onclick = async () => {
        const from = UnitSession.incomingFrom;
        UnitSession.incomingFrom = null;
        hideIncomingInvite();
        if (from) wsSend({ t: "direct_reject", to: from });
        updateUnitUiFromSession();
      };
    }

    if (btnRequestSpeak) {
      btnRequestSpeak.onclick = () => {
        if (UnitSession.mode !== "forced" || !UnitSession.forcedBy) return;
        if (UnitSession.speakAllowed || UnitSession.speakPending) return;

        UnitSession.speakPending = true;
        updateUnitUiFromSession();
        wsSend({ t: "unit_request_speak", to: UnitSession.forcedBy });
      };
    }
  }

  function refreshUnitsUi() {
    directTargetSel = document.getElementById("directTarget");
    btnInvite = document.getElementById("btnInvite");
    btnEndDirect = document.getElementById("btnEndDirect");
    directStatus = document.getElementById("directStatus");
    btnRequestSpeak = document.getElementById("btnRequestSpeak");

    incomingInviteBox = document.getElementById("incomingInviteBox");
    incomingInviteText = document.getElementById("incomingInviteText");
    btnAcceptInvite = document.getElementById("btnAcceptInvite");
    btnRejectInvite = document.getElementById("btnRejectInvite");

    refreshTargetOptions();
    updateUnitUiFromSession();
  }

  // -------------------------
  // Bind Channels view (commander)
  // -------------------------
  function bindChannelsUi() {
    btnForceConnect = document.getElementById("btnForceConnect");
    btnForceDisconnect = document.getElementById("btnForceDisconnect");

    refreshChannelsUi();

    if (btnForceConnect) {
      btnForceConnect.onclick = async () => {
        if (role !== "commander") return;

        const targets = Array.from(CmdForce.targets);
        if (targets.length === 0) return alert("Pilih target dulu.");
        if (targets.length > 50) return alert("Max 50 target.");

        CmdForce.forcedTargets = new Set(targets);

        for (const tid of targets) {
          wsSend({ t: "command_force_connect", to: tid });
        }

        setRtc("RTC: COMMAND FORCING", false);
      };
    }

    if (btnForceDisconnect) {
      btnForceDisconnect.onclick = async () => {
        if (role !== "commander") return;

        for (const tid of Array.from(CmdForce.forcedTargets)) {
          wsSend({ t: "command_force_disconnect", to: tid });
          wsSend({ t: "hang", to: tid });
        }

        cmdDropAll();
        CmdForce.forcedTargets.clear();
        CmdForce.targets.clear();
        refreshChannelsUi();
        setRtc("RTC: IDLE", false);
      };
    }
  }

  // -------------------------
  // Unit RTC
  // -------------------------
  async function unitEnsurePc() {
    if (!localStream) await resetMedia();
    if (unitPc) return;

    unitPc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 4
    });

    unitPc.addTrack(localTrack, localStream);

    unitPc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const peer = UnitSession.peerId;
      if (!peer) return;
      wsSend({ t: "ice", candidate: e.candidate, to: peer });
    };

    unitPc.ontrack = async (e) => {
      const a = unitRemoteAudioEl();
      if (!a) return;
      a.srcObject = e.streams[0];
      a.volume = currentVolume;
      try { if (a.setSinkId && selectedOutId) await a.setSinkId(selectedOutId); } catch {}
      try { await a.play(); } catch {}
    };

    unitPc.onconnectionstatechange = () => {
      const st = unitPc.connectionState || "unknown";
      if (UnitSession.mode === "forced") setRtc("RTC: FORCED LINK", st === "connected");
      else if (UnitSession.mode === "direct") setRtc(`RTC: ${st.toUpperCase()}`, st === "connected");
      else setRtc("RTC: WAITING PEER", false);
    };
  }

  async function unitFlushCandidates() {
    if (!unitPc || !unitPc.remoteDescription) return;
    while (unitPendingCandidates.length > 0) {
      const c = unitPendingCandidates.shift();
      try { await unitPc.addIceCandidate(c); } catch {}
    }
  }

  async function unitStartOffer(peerId) {
    await unitEnsurePc();
    if (!unitPc) return;

    unitIsPolite = decidePolite(selfId, peerId);

    try {
      unitMakingOffer = true;
      const offer = await unitPc.createOffer();
      await unitPc.setLocalDescription(offer);
      wsSend({ t: "offer", sdp: unitPc.localDescription, to: peerId });
      setRtc("RTC: CALLING", false);
    } catch (e) {
      log("unitStartOffer failed", e);
    } finally {
      unitMakingOffer = false;
    }
  }

  async function unitHandleOffer(from, sdp) {
    await unitEnsurePc();
    if (!unitPc) return;

    unitIsPolite = decidePolite(selfId, from);
    const offerCollision = unitMakingOffer || (unitPc.signalingState !== "stable");
    unitIgnoreOffer = !unitIsPolite && offerCollision;
    if (unitIgnoreOffer) return;

    try {
      await unitPc.setRemoteDescription(sdp);
      await unitFlushCandidates();
      const answer = await unitPc.createAnswer();
      await unitPc.setLocalDescription(answer);
      wsSend({ t: "answer", sdp: unitPc.localDescription, to: from });
      setRtc("RTC: ANSWERING", false);
    } catch (e) {
      log("unitHandleOffer failed", e);
    }
  }

  async function unitHandleAnswer(_from, sdp) {
    if (!unitPc) return;
    try {
      await unitPc.setRemoteDescription(sdp);
      await unitFlushCandidates();
    } catch (e) {
      log("unitHandleAnswer failed", e);
    }
  }

  async function unitHandleIce(_from, cand) {
    if (!unitPc) return;
    try {
      if (unitPc.remoteDescription) await unitPc.addIceCandidate(cand);
      else unitPendingCandidates.push(cand);
    } catch {}
  }

  async function unitHardClose() {
    hideIncomingInvite();
    unitMakingOffer = false;
    unitIgnoreOffer = false;
    unitPendingCandidates.length = 0;

    try {
      const a = unitRemoteAudioEl();
      if (a) { a.pause(); a.srcObject = null; }
    } catch {}

    if (unitPc) {
      try { unitPc.close(); } catch {}
      unitPc = null;
    }
  }

  // -------------------------
  // Commander RTC PeerConn (single definition, no duplicates)
  // -------------------------
  function ensureRemoteAudioElement(peerId) {
    const id = `ov-remote-${peerId}`;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("audio");
      el.id = id;
      el.autoplay = true;
      el.controls = false;
      el.dataset.ovRemote = "1";
      el.style.display = "none";
      document.body.appendChild(el);
    }
    el.volume = currentVolume;
    return el;
  }

  function createPeerConn(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 4
    });

    const obj = {
      peerId,
      pc,
      makingOffer: false,
      ignoreOffer: false,
      isPolite: decidePolite(selfId, peerId),
      pendingCandidates: [],
      sender: null,

      async ensureLocalTrack() {
        if (!localStream) await resetMedia();
        if (!this.sender) {
          localTrack.enabled = false;
          this.sender = pc.addTrack(localTrack, localStream);
        }
      },

      async replaceLocalTrack(track) {
        if (!this.sender) return;
        try { await this.sender.replaceTrack(track); } catch {}
      },

      async flushCandidates() {
        if (!pc.remoteDescription) return;
        while (this.pendingCandidates.length > 0) {
          const c = this.pendingCandidates.shift();
          try { await pc.addIceCandidate(c); } catch {}
        }
      },

      close() {
        try { pc.close(); } catch {}
      }
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      wsSend({ t: "ice", candidate: e.candidate, to: peerId });
    };

    pc.ontrack = async (e) => {
      const audioEl = ensureRemoteAudioElement(peerId);
      audioEl.srcObject = e.streams[0];
      audioEl.volume = currentVolume;
      try { if (audioEl.setSinkId && selectedOutId) await audioEl.setSinkId(selectedOutId); } catch {}
      try { await audioEl.play(); } catch {}
    };

    return obj;
  }

  async function cmdEnsureConn(peerId) {
    if (peerConns.has(peerId)) return peerConns.get(peerId);
    const pcObj = createPeerConn(peerId);
    peerConns.set(peerId, pcObj);
    await pcObj.ensureLocalTrack();
    return pcObj;
  }

  function cmdDropAll() {
    for (const [pid, pcObj] of peerConns.entries()) {
      try { pcObj.close(); } catch {}
      peerConns.delete(pid);
      const a = document.getElementById(`ov-remote-${pid}`);
      if (a) a.remove();
    }
    CmdForce.requests.clear();
  }

  // -------------------------
  // WS
  // -------------------------
  function setupWs() {
    try { if (ws) ws.close(); } catch {}
    ws = null;

    ws = new WebSocket(getRoomWsUrl());

    ws.onopen = () => {
      setBadge(wsBadge, true, "WS: CONNECTED");
      wsReconnectAttempt = 0;
      startPingLoop();

      wsSend({ t: "identify", label: displayName, role });
    };

    ws.onclose = () => {
      setBadge(wsBadge, false, "WS: DISCONNECTED");
      stopPingLoop();
      scheduleWsReconnect();
    };

    ws.onerror = () => {
      setBadge(wsBadge, false, "WS: ERROR");
    };

    ws.onmessage = async (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.t === "hello") {
        selfId = String(msg.id || "");
        return;
      }
      if (msg.t === "pong") return;

      if (msg.t === "peers") {
        const peers = Array.isArray(msg.peers) ? msg.peers : [];
        Units.setPeers(peers);
        refreshTargetOptions();
        refreshChannelsUi();
        return;
      }

      if (msg.t === "peer_update") {
        Units.upsertPeer({ id: msg.id, label: msg.label, role: msg.role });
        Units.renderUnits();
        refreshTargetOptions();
        refreshChannelsUi();
        return;
      }

      if (msg.t === "peer_join") {
        const pid = String(msg.id || "");
        if (pid && pid !== String(selfId || "")) Units.upsertPeer({ id: pid, label: "", role: "unit" });
        Units.renderUnits();
        refreshTargetOptions();
        refreshChannelsUi();
        return;
      }

      if (msg.t === "peer_left") {
        const pid = String(msg.id || "");
        Units.removePeer(pid);
        Units.renderUnits();
        refreshTargetOptions();
        refreshChannelsUi();

        if (role !== "commander") {
          if (UnitSession.peerId && String(UnitSession.peerId) === pid && UnitSession.mode !== "forced") {
            UnitSession.mode = "none";
            UnitSession.peerId = null;
            UnitSession.incomingFrom = null;
            hideIncomingInvite();
            await unitHardClose();
            updateUnitUiFromSession();
          }
        } else {
          if (peerConns.has(pid)) {
            try { peerConns.get(pid).close(); } catch {}
            peerConns.delete(pid);
            const a = document.getElementById(`ov-remote-${pid}`);
            if (a) a.remove();
          }
          CmdForce.targets.delete(pid);
          CmdForce.forcedTargets.delete(pid);
          CmdDirectInbox.delete(pid);
          refreshChannelsUi();
        }
        return;
      }

      // DIRECT CALL
      if (msg.t === "direct_invite") {
        const from = String(msg._from || "");
        if (!from) return;

        if (role === "commander") {
          CmdDirectInbox.set(from, { ts: nowMs() });
          refreshChannelsUi();
          return;
        }

        if (UnitSession.mode === "forced") {
          wsSend({ t: "direct_reject", to: from });
          return;
        }

        if (UnitSession.mode === "none") {
          UnitSession.mode = "direct";
          UnitSession.peerId = from;
          UnitSession.incomingFrom = null;

          hideIncomingInvite();
          setDirectStatus(`AUTO CONNECT from ${Units.displayNameById(from)}...`);
          setRtc("RTC: AUTO ACCEPTED", false);

          await unitEnsurePc();
          wsSend({ t: "direct_accept", to: from });
          updateUnitUiFromSession();
          return;
        }

        if (UnitSession.mode === "direct") {
          UnitSession.incomingFrom = from;
          showIncomingInvite(from, "BUSY (Accept = switch)");
          setDirectStatus(`INCOMING while BUSY from ${Units.displayNameById(from)}`);
          return;
        }

        wsSend({ t: "direct_reject", to: from });
        return;
      }

      if (msg.t === "direct_accept") {
        const from = String(msg._from || "");
        if (!from) return;

        if (role === "commander") return;

        if (UnitSession.mode !== "direct") return;
        if (!UnitSession.peerId || String(UnitSession.peerId) !== from) return;

        await unitEnsurePc();
        await unitStartOffer(from);
        return;
      }

      if (msg.t === "direct_reject") {
        const from = String(msg._from || "");
        if (!from) return;

        if (role === "commander") {
          CmdDirectInbox.delete(from);
          refreshChannelsUi();
          return;
        }

        if (UnitSession.mode === "direct" && UnitSession.peerId && String(UnitSession.peerId) === from) {
          alert("Target menolak / sedang sibuk.");
          UnitSession.mode = "none";
          UnitSession.peerId = null;
          UnitSession.incomingFrom = null;
          await unitHardClose();
          updateUnitUiFromSession();
        }
        return;
      }

      if (msg.t === "direct_end" || msg.t === "hang") {
        const from = String(msg._from || "");
        if (!from) return;

        if (role === "commander") {
          if (peerConns.has(from)) {
            try { peerConns.get(from).close(); } catch {}
            peerConns.delete(from);
            const a = document.getElementById(`ov-remote-${from}`);
            if (a) a.remove();
          }
          CmdForce.forcedTargets.delete(from);
          CmdDirectInbox.delete(from);
          refreshChannelsUi();
          return;
        }

        if (UnitSession.peerId && String(UnitSession.peerId) === from) {
          if (UnitSession.mode === "forced") return;

          await unitHardClose();
          UnitSession.mode = "none";
          UnitSession.peerId = null;
          UnitSession.incomingFrom = null;
          hideIncomingInvite();
          updateUnitUiFromSession();
        }
        return;
      }

      // COMMAND FORCE CONNECT
      if (msg.t === "command_force_connect") {
        const cmdId = String(msg._from || "");
        if (!cmdId) return;

        if (role !== "commander") {
          if (UnitSession.mode === "direct" && UnitSession.peerId) {
            const oldPeer = UnitSession.peerId;
            wsSend({ t: "direct_end", to: oldPeer });
            wsSend({ t: "hang", to: oldPeer });
            await unitHardClose();
          }

          UnitSession.mode = "forced";
          UnitSession.peerId = cmdId;
          UnitSession.forcedBy = cmdId;
          UnitSession.speakAllowed = false;
          UnitSession.speakPending = false;
          UnitSession.commandTalking = false;
          UnitSession.incomingFrom = null;

          hideIncomingInvite();
          await unitEnsurePc();
          updateUnitUiFromSession();
          return;
        }

        return;
      }

      if (msg.t === "command_force_disconnect") {
        const cmdId = String(msg._from || "");
        if (!cmdId) return;

        if (role !== "commander") {
          if (UnitSession.mode !== "forced") return;
          if (UnitSession.forcedBy && String(UnitSession.forcedBy) !== cmdId) return;

          await unitHardClose();
          UnitSession.mode = "none";
          UnitSession.peerId = null;
          UnitSession.forcedBy = null;
          UnitSession.speakAllowed = false;
          UnitSession.speakPending = false;
          UnitSession.commandTalking = false;
          UnitSession.incomingFrom = null;

          updateUnitUiFromSession();
        }
        return;
      }

      if (msg.t === "command_ptt") {
        const cmdId = String(msg._from || "");
        if (!cmdId) return;

        if (role !== "commander") {
          if (UnitSession.mode !== "forced") return;
          if (UnitSession.forcedBy && String(UnitSession.forcedBy) !== cmdId) return;

          UnitSession.commandTalking = !!msg.on;
          updateUnitUiFromSession();

          if (UnitSession.commandTalking && !UnitSession.speakAllowed) {
            if (localTrack) localTrack.enabled = false;
            setBadge(pttBadge, false, "PTT: LOCKED");
          }
        }
        return;
      }

      if (msg.t === "unit_request_speak") {
        if (role !== "commander") return;
        const unitId = String(msg._from || "");
        if (!unitId) return;
        if (!CmdForce.forcedTargets.has(unitId)) return;

        CmdForce.requests.set(unitId, { ts: nowMs() });
        refreshChannelsUi();
        return;
      }

      if (msg.t === "command_allow_speak") {
        if (role === "commander") return;

        const cmdId = String(msg._from || "");
        if (!cmdId) return;
        if (UnitSession.mode !== "forced") return;
        if (UnitSession.forcedBy && String(UnitSession.forcedBy) !== cmdId) return;

        const allow = !!msg.allow;
        UnitSession.speakAllowed = allow;
        UnitSession.speakPending = false;
        updateUnitUiFromSession();
        return;
      }

      // RTC signaling
      if (msg.t === "offer" || msg.t === "answer" || msg.t === "ice") {
        const from = String(msg._from || "");
        if (!from) return;

        if (role === "commander") {
          const pcObj = await cmdEnsureConn(from);

          if (msg.t === "offer") {
            const offerCollision = pcObj.makingOffer || (pcObj.pc.signalingState !== "stable");
            pcObj.ignoreOffer = !pcObj.isPolite && offerCollision;
            if (pcObj.ignoreOffer) return;

            try {
              await pcObj.pc.setRemoteDescription(msg.sdp);
              await pcObj.flushCandidates();
              const answer = await pcObj.pc.createAnswer();
              await pcObj.pc.setLocalDescription(answer);
              wsSend({ t: "answer", sdp: pcObj.pc.localDescription, to: from });
              setRtc("RTC: COMMAND CONNECTED", false);
            } catch (e) {
              log("commander handle offer failed", from, e);
            }
            return;
          }

          if (msg.t === "answer") {
            try {
              await pcObj.pc.setRemoteDescription(msg.sdp);
              await pcObj.flushCandidates();
            } catch (e) {
              log("commander handle answer failed", from, e);
            }
            return;
          }

          if (msg.t === "ice") {
            try {
              if (pcObj.pc.remoteDescription) await pcObj.pc.addIceCandidate(msg.candidate);
              else pcObj.pendingCandidates.push(msg.candidate);
            } catch {}
            return;
          }
        } else {
          if (!UnitSession.peerId || String(UnitSession.peerId) !== from) return;

          await unitEnsurePc();

          if (msg.t === "offer") return unitHandleOffer(from, msg.sdp);
          if (msg.t === "answer") return unitHandleAnswer(from, msg.sdp);
          if (msg.t === "ice") return unitHandleIce(from, msg.candidate);
        }
      }
    };
  }

  // -------------------------
  // Global bridges (hotkey/profile)
  // -------------------------
  function bindGlobals() {
    wsBadge = document.getElementById("ws");
    rtcBadge = document.getElementById("rtc");
    pttBadge = document.getElementById("ptt");
    hk = document.getElementById("hk");
    hkok = document.getElementById("hkok");
    profileEl = document.getElementById("profile");

    setBadge(pttBadge, false, "PTT: OFF");

    if (window.omnivoice && window.omnivoice.onShortcutInfo) {
      window.omnivoice.onShortcutInfo((info) => {
        if (hk) hk.textContent = info.shortcut;
        if (hkok) hkok.textContent = info.ok ? "registered" : "FAILED";

        role = (info.role === "commander") ? "commander" : "unit";
        displayName = String(info.displayName || (role === "commander" ? "commander" : "unit")).trim() || "unit";

        if (profileEl) profileEl.textContent = displayName;

        if (role === "commander") setRtc("RTC: IDLE", false);
        else setRtc("RTC: WAITING PEER", false);
      });
    }

    if (window.omnivoice && window.omnivoice.onPttToggle) {
      window.omnivoice.onPttToggle((on) => {
        if (role === "commander") {
          CmdForce.pttOverride = !!on;
          for (const tid of Array.from(CmdForce.forcedTargets)) {
            wsSend({ t: "command_ptt", to: tid, on: !!on });
          }
          refreshChannelsUi();
        } else {
          const lockedByCommand = (UnitSession.mode === "forced" && UnitSession.commandTalking && !UnitSession.speakAllowed);
          if (lockedByCommand) {
            if (localTrack) localTrack.enabled = false;
            setBadge(pttBadge, false, "PTT: LOCKED");
            return;
          }
        }

        if (localTrack) localTrack.enabled = !!on;
        setBadge(pttBadge, !!on, `PTT: ${on ? "ON" : "OFF"}`);
      });
    }
  }

  // -------------------------
  // Init
  // -------------------------
  async function init() {
    bindGlobals();
    setupWs();
    await loadDevices();
    await resetMedia();

    // apply current volume once media/ui are ready
    applyRemoteVolume();
  }

  return {
    init,
    bindUnitsUi,
    refreshUnitsUi,
    bindChannelsUi,
    refreshChannelsUi,
  };
})();
