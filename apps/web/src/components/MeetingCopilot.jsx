import { useEffect, useMemo, useRef, useState } from "react";

const STATUS_COLORS = {
  recording: "#dc2626",
  paused: "#d97706",
  processing: "#2563eb",
  ready: "#16a34a",
  failed: "#b91c1c"
};

const RECORDING_CHUNK_MS = 5000;
const UPLOAD_RETRY_ATTEMPTS = 3;
const UPLOAD_RETRY_BASE_MS = 600;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatStamp(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildCommand(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!/(^|\s)(hey\s+aika|aika,?)/i.test(t)) return null;
  if (/\b(start recording|start recording meeting|record meeting|record)\b/i.test(t)) return "start";
  if (/\bstop recording\b/i.test(t)) return "stop";
  if (/\bpause recording\b/i.test(t)) return "pause";
  if (/\bresume recording\b/i.test(t)) return "resume";
  return null;
}

function getRecorderUnavailableReason() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Recording requires HTTPS on iPad/Safari (or localhost).";
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return "Recorder unavailable in this browser.";
  }
  return "";
}

export default function MeetingCopilot({
  serverUrl,
  registerControls,
  onActivateTab,
  onRecordingStateChange,
  onSelectedRecordingChange,
  visible = true,
  commandListening,
  onCommandListeningChange
}) {
  const [recordings, setRecordings] = useState([]);
  const [recordingsError, setRecordingsError] = useState("");
  const [recordingQuery, setRecordingQuery] = useState("");
  const [recordingStatusFilter, setRecordingStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedActions, setSelectedActions] = useState([]);
  const [detailTab, setDetailTab] = useState("summary");
  const [recordingTitle, setRecordingTitle] = useState("Meeting Recording");
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [recordingStopping, setRecordingStopping] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingId, setRecordingId] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [recordingNotice, setRecordingNotice] = useState("");
  const [redactionEnabled, setRedactionEnabled] = useState(true);
  const [commandListeningInternal, setCommandListeningInternal] = useState(false);
  const [commandStatus, setCommandStatus] = useState("Voice commands off");
  const [askMeeting, setAskMeeting] = useState("");
  const [askMeetingAnswer, setAskMeetingAnswer] = useState("");
  const [askMemory, setAskMemory] = useState("");
  const [askMemoryAnswer, setAskMemoryAnswer] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState("");
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [taskEdits, setTaskEdits] = useState([]);
  const [actionResult, setActionResult] = useState("");
  const [exportInfo, setExportInfo] = useState(null);
  const toAbsolute = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${serverUrl}${url}`;
  };

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animationRef = useRef(null);
  const elapsedRef = useRef(null);
  const waveformRef = useRef(null);
  const chunkSeqRef = useRef(0);
  const finalChunksRef = useRef([]);
  const finalMimeTypeRef = useRef("audio/webm");
  const pendingUploadsRef = useRef([]);
  const totalBytesRef = useRef(0);
  const commandRecRef = useRef(null);
  const uploadWarningRef = useRef(false);
  const failedChunkCountRef = useRef(0);

  async function refreshRecordings() {
    try {
      const params = new URLSearchParams();
      if (recordingQuery) params.set("q", recordingQuery);
      if (recordingStatusFilter) params.set("status", recordingStatusFilter);
      const resp = await fetch(`${serverUrl}/api/recordings?${params.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "recordings_failed");
      setRecordings(data.recordings || []);
      if (!selectedId && data.recordings?.length) {
        setSelectedId(data.recordings[0].id);
      }
      setRecordingsError("");
    } catch (err) {
      setRecordingsError(err?.message || "recordings_failed");
    }
  }

  async function loadRecording(id) {
    if (!id) return;
    try {
      const resp = await fetch(`${serverUrl}/api/recordings/${id}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "recording_load_failed");
      setSelected(data.recording);
      setSelectedActions(data.actions || []);
      setTaskEdits(data.recording?.tasks_json || []);
      setExportInfo(null);
    } catch (err) {
      setSelected(null);
    }
  }

  useEffect(() => {
    refreshRecordings();
  }, [recordingStatusFilter]);

  useEffect(() => {
    const id = setTimeout(() => refreshRecordings(), 400);
    return () => clearTimeout(id);
  }, [recordingQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTo = window.localStorage.getItem("aika_meeting_email_to") || "";
    if (savedTo) setEmailTo(savedTo);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (emailTo) window.localStorage.setItem("aika_meeting_email_to", emailTo);
    else window.localStorage.removeItem("aika_meeting_email_to");
  }, [emailTo]);

  useEffect(() => {
    if (!selectedId) return;
    loadRecording(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!registerControls) return;
    registerControls({
      start: (options) => startRecording(options),
      stop: () => stopRecording(),
      pause: () => pauseRecording(),
      resume: () => resumeRecording()
    });
  }, [registerControls, recordingTitle, redactionEnabled]);

  useEffect(() => {
    if (!onSelectedRecordingChange) return;
    const id = recordingId || selectedId || "";
    onSelectedRecordingChange(id);
  }, [onSelectedRecordingChange, recordingId, selectedId]);

  function cleanupAudio() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    animationRef.current = null;
    elapsedRef.current = null;
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    streamRef.current = null;
  }

  function drawWaveform() {
    const canvas = waveformRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    const data = new Uint8Array(analyser.fftSize);
    const render = () => {
      analyser.getByteTimeDomainData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const slice = canvas.width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = data[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      animationRef.current = requestAnimationFrame(render);
    };
    render();
  }

  async function uploadChunkWithRetry({ recordingId, seq, blob, ext }) {
    const url = `${serverUrl}/api/recordings/${recordingId}/chunk?seq=${seq}`;
    for (let attempt = 0; attempt < UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
      const form = new FormData();
      form.append("chunk", blob, `chunk-${seq}.${ext}`);
      try {
        const resp = await fetch(url, { method: "POST", body: form });
        if (resp.ok) return true;
      } catch {
        // swallow and retry
      }
      await sleep(UPLOAD_RETRY_BASE_MS * (attempt + 1));
    }
    failedChunkCountRef.current += 1;
    if (!uploadWarningRef.current) {
      uploadWarningRef.current = true;
      setRecordingNotice("Recording... (network issues detected, retrying uploads)");
    }
    return false;
  }

  async function startRecording(options = {}) {
    try {
      if (recordingActive || recordingStarting) return;
      const incomingTitle = typeof options.title === "string" ? options.title.trim() : "";
      const effectiveTitle = incomingTitle || recordingTitle;
      const effectiveRedaction = typeof options.redactionEnabled === "boolean" ? options.redactionEnabled : redactionEnabled;
      if (incomingTitle && incomingTitle !== recordingTitle) setRecordingTitle(incomingTitle);
      if (typeof options.redactionEnabled === "boolean" && options.redactionEnabled !== redactionEnabled) {
        setRedactionEnabled(options.redactionEnabled);
      }
      setRecordingStarting(true);
      setRecordingError("");
      setRecordingStopping(false);
      setRecordingNotice("Starting recorder...");
      if (onActivateTab) onActivateTab();
      const resp = await fetch(`${serverUrl}/api/recordings/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: effectiveTitle, redactionEnabled: effectiveRedaction })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "recording_start_failed");
      const id = data.recording.id;
      setRecordingId(id);
      setSelectedId(id);
      chunkSeqRef.current = 0;
      finalChunksRef.current = [];
      totalBytesRef.current = 0;
      pendingUploadsRef.current = [];
      uploadWarningRef.current = false;
      failedChunkCountRef.current = 0;
      const unavailableReason = getRecorderUnavailableReason();
      if (unavailableReason) throw new Error(unavailableReason);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      source.connect(analyser);
      drawWaveform();
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
          ? "audio/ogg"
          : "";
      finalMimeTypeRef.current = mimeType || "audio/webm";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.onerror = () => {
        setRecordingError("Recorder error.");
        setRecordingNotice("Recorder error.");
        cleanupAudio();
        stopStream();
        setRecordingActive(false);
        setRecordingStarting(false);
        setRecordingStopping(false);
        setRecordingPaused(false);
        if (onRecordingStateChange) onRecordingStateChange(false);
      };
      recorder.ondataavailable = async (evt) => {
        if (!evt.data || evt.data.size === 0) return;
        totalBytesRef.current += evt.data.size;
        const maxFinalBytes = 25 * 1024 * 1024;
        if (totalBytesRef.current <= maxFinalBytes) {
          finalChunksRef.current.push(evt.data);
        } else if (finalChunksRef.current.length) {
          finalChunksRef.current = [];
        }
        const seq = chunkSeqRef.current++;
        const ext = finalMimeTypeRef.current.includes("ogg") ? "ogg" : "webm";
        const upload = uploadChunkWithRetry({ recordingId: id, seq, blob: evt.data, ext });
        pendingUploadsRef.current.push(upload);
        upload.finally(() => {
          pendingUploadsRef.current = pendingUploadsRef.current.filter(p => p !== upload);
        });
      };
      recorder.onstop = async () => {
        try {
          const pending = pendingUploadsRef.current.slice();
          if (pending.length) {
            await Promise.allSettled(pending);
          }
          const maxFinalBytes = 25 * 1024 * 1024;
          const shouldUploadFinal = finalChunksRef.current.length && totalBytesRef.current <= maxFinalBytes;
          if (shouldUploadFinal) {
            const ext = finalMimeTypeRef.current.includes("ogg") ? "ogg" : "webm";
            const finalBlob = new Blob(finalChunksRef.current, { type: finalMimeTypeRef.current });
            const form = new FormData();
            form.append("audio", finalBlob, `recording.${ext}`);
            await fetch(`${serverUrl}/api/recordings/${id}/final`, { method: "POST", body: form });
          }
        } catch {
        } finally {
          await fetch(`${serverUrl}/api/recordings/${id}/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              durationSec: elapsed,
              expectedChunks: chunkSeqRef.current,
              chunkMs: RECORDING_CHUNK_MS,
              failedChunks: failedChunkCountRef.current
            })
          }).catch(() => {});
        }
        cleanupAudio();
        stopStream();
        setRecordingActive(false);
        setRecordingStarting(false);
        setRecordingStopping(false);
        setRecordingError("");
        if (onRecordingStateChange) onRecordingStateChange(false);
        setRecordingPaused(false);
        setRecordingNotice("Processing transcript and summaries...");
        finalChunksRef.current = [];
        refreshRecordings();
      };
      recorder.start(RECORDING_CHUNK_MS);
      setRecordingActive(true);
      setRecordingStarting(false);
      setRecordingStopping(false);
      if (onRecordingStateChange) onRecordingStateChange(true);
      setRecordingPaused(false);
      setElapsed(0);
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setRecordingNotice("Recording...");
    } catch (err) {
      setRecordingError(err?.message || "recording_start_failed");
      setRecordingNotice("Recorder failed to start.");
      cleanupAudio();
      stopStream();
      setRecordingActive(false);
      setRecordingStarting(false);
      if (onRecordingStateChange) onRecordingStateChange(false);
    }
  }

  function pauseRecording() {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.pause();
    setRecordingPaused(true);
    fetch(`${serverUrl}/api/recordings/${recordingId}/pause`, { method: "POST" }).catch(() => {});
  }

  function resumeRecording() {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.resume();
    setRecordingPaused(false);
    fetch(`${serverUrl}/api/recordings/${recordingId}/resume`, { method: "POST" }).catch(() => {});
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return;
    try {
      mediaRecorderRef.current.requestData();
    } catch {}
    setRecordingStopping(true);
    setRecordingNotice("Finalizing recording...");
    mediaRecorderRef.current.stop();
  }

  const effectiveCommandListening =
    typeof commandListening === "boolean" ? commandListening : commandListeningInternal;

  useEffect(() => {
    if (!effectiveCommandListening) {
      if (commandRecRef.current) {
        commandRecRef.current.stop();
        commandRecRef.current = null;
      }
      setCommandStatus("Voice commands off");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCommandStatus("Voice commands unsupported");
      if (onCommandListeningChange) onCommandListeningChange(false);
      else setCommandListeningInternal(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (evt) => {
      const transcript = evt.results[evt.results.length - 1][0].transcript;
      const cmd = buildCommand(transcript);
      if (!cmd) return;
      if (onActivateTab) onActivateTab();
      if (cmd === "start") startRecording();
      if (cmd === "stop") stopRecording();
      if (cmd === "pause") pauseRecording();
      if (cmd === "resume") resumeRecording();
    };
    rec.onstart = () => setCommandStatus("Listening for voice commands...");
    rec.onerror = () => setCommandStatus("Voice command error");
    rec.onend = () => {
      if (effectiveCommandListening) {
        rec.start();
      }
    };
    commandRecRef.current = rec;
    rec.start();
    return () => {
      rec.stop();
    };
  }, [effectiveCommandListening, recordingTitle, redactionEnabled]);

  async function askThisMeeting() {
    if (!selectedId || !askMeeting.trim()) return;
    const resp = await fetch(`${serverUrl}/api/recordings/${selectedId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: askMeeting })
    });
    const data = await resp.json();
    setAskMeetingAnswer(data.answer || data.error || "No answer");
  }

  async function askAcrossMeetings() {
    if (!askMemory.trim()) return;
    const resp = await fetch(`${serverUrl}/api/memory/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: askMemory })
    });
    const data = await resp.json();
    setAskMemoryAnswer(data.answer || data.error || "No answer");
  }

  async function saveTasks() {
    if (!selectedId) return;
    const resp = await fetch(`${serverUrl}/api/recordings/${selectedId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: taskEdits })
    });
    const data = await resp.json();
    if (resp.ok) setSelected(data.recording);
  }

  async function runAction(actionType, input) {
    if (!selectedId) return;
    const resp = await fetch(`${serverUrl}/api/recordings/${selectedId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionType, input })
    });
    const data = await resp.json();
    setActionResult(JSON.stringify(data.action || data, null, 2));
    loadRecording(selectedId);
  }

  async function deleteRecordingById(id) {
    if (!id) return;
    if (!confirm("Delete this recording and all related files? This cannot be undone.")) return;
    const resp = await fetch(`${serverUrl}/api/recordings/${id}`, { method: "DELETE" });
    const data = await resp.json();
    if (!resp.ok) {
      setRecordingsError(data.error || "recording_delete_failed");
      return;
    }
    setSelectedId("");
    setSelected(null);
    setExportInfo(null);
    refreshRecordings();
  }

  async function exportRecording(id) {
    if (!id) return;
    const resp = await fetch(`${serverUrl}/api/recordings/${id}/export`);
    const data = await resp.json();
    if (!resp.ok) {
      setRecordingsError(data.error || "recording_export_failed");
      return;
    }
    setExportInfo(data);
  }

  async function regenerateSummary() {
    if (!selectedId) return;
    setSummaryRefreshing(true);
    try {
      const resp = await fetch(`${serverUrl}/api/recordings/${selectedId}/resummarize`, {
        method: "POST"
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "resummarize_failed");
      setSelected(data.recording || null);
      refreshRecordings();
    } catch (err) {
      setRecordingsError(err?.message || "resummarize_failed");
    } finally {
      setSummaryRefreshing(false);
    }
  }

  async function emailRecording(id) {
    if (!id || !emailTo.trim()) return;
    setEmailSending(true);
    setEmailResult("");
    try {
      const resp = await fetch(`${serverUrl}/api/recordings/${id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo.trim(),
          subject: emailSubject.trim() || undefined
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "recording_email_failed");
      if (data.transport === "gmail") {
        setEmailResult(`Sent via Gmail to ${data.to.join(", ")}.`);
      } else {
        setEmailResult(`Saved to outbox (Gmail unavailable). Outbox ID: ${data.outboxId}`);
      }
    } catch (err) {
      setEmailResult(err?.message || "recording_email_failed");
    } finally {
      setEmailSending(false);
    }
  }

  const statusChip = (status) => (
    <span style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      background: `${STATUS_COLORS[status] || "#9ca3af"}22`,
      color: STATUS_COLORS[status] || "#6b7280",
      border: `1px solid ${STATUS_COLORS[status] || "#9ca3af"}66`
    }}>{status || "unknown"}</span>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {visible && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={startRecording}
            disabled={recordingActive || recordingStarting}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "#111827",
              color: "#fff",
              opacity: recordingActive || recordingStarting ? 0.7 : 1
            }}
          >
            {recordingStarting ? "Starting..." : recordingActive ? "Recording active" : "Start recording"}
          </button>
          <input value={recordingTitle} onChange={(e) => setRecordingTitle(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--panel-border-strong)", minWidth: 220 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={redactionEnabled} onChange={(e) => setRedactionEnabled(e.target.checked)} />
            Redaction enabled
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={effectiveCommandListening}
              onChange={(e) => {
                const v = e.target.checked;
                if (onCommandListeningChange) onCommandListeningChange(v);
                else setCommandListeningInternal(v);
              }}
            />
            Listening for voice commands (say "hey Aika, start recording")
          </label>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{commandStatus}</div>
        </div>
      )}

      {(recordingActive || recordingStarting || recordingError) && (
        <div style={{ position: "fixed", right: 24, bottom: 24, width: 320, background: "var(--panel-bg)", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", padding: 16, zIndex: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: recordingError ? "#b91c1c" : recordingActive ? "#dc2626" : "#d97706",
                boxShadow: recordingError
                  ? "0 0 12px rgba(185,28,28,0.8)"
                  : recordingActive
                    ? "0 0 12px rgba(220,38,38,0.8)"
                    : "0 0 12px rgba(217,119,6,0.8)"
              }}
            />
            <strong>{recordingError ? "Recorder error" : recordingStopping ? "Finalizing..." : recordingActive ? "Recording..." : "Preparing recorder..."}</strong>
            <div style={{ marginLeft: "auto", fontSize: 12 }}>{formatDuration(elapsed)}</div>
          </div>
          <div style={{ marginTop: 10 }}>
            <canvas ref={waveformRef} width={280} height={60} style={{ width: "100%", background: "var(--panel-bg-soft)", borderRadius: 8 }} />
          </div>
          {recordingError && (
            <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 8 }}>
              {recordingError}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            Recording audio. Please ensure participant consent.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {!recordingPaused ? (
              <button onClick={pauseRecording} style={{ flex: 1, padding: 8, borderRadius: 8 }} disabled={!recordingActive}>
                Pause
              </button>
            ) : (
              <button onClick={resumeRecording} style={{ flex: 1, padding: 8, borderRadius: 8 }}>
                Resume
              </button>
            )}
            <button onClick={stopRecording} style={{ flex: 1, padding: 8, borderRadius: 8, background: "#111827", color: "#fff" }} disabled={!recordingActive || recordingStopping}>
              {recordingStopping ? "Stopping..." : "Stop"}
            </button>
            {recordingError && (
              <button onClick={startRecording} style={{ flex: 1, padding: 8, borderRadius: 8 }}>
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {!visible && !recordingActive && !recordingNotice ? null : (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)", color: "var(--text-primary)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Recordings</div>
          <input placeholder="Search recordings" value={recordingQuery} onChange={(e) => setRecordingQuery(e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", marginBottom: 8 }} />
          <select value={recordingStatusFilter} onChange={(e) => setRecordingStatusFilter(e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", marginBottom: 8 }}>
            <option value="">All statuses</option>
            <option value="recording">Recording</option>
            <option value="paused">Paused</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={refreshRecordings} style={{ width: "100%", padding: 6, borderRadius: 8 }}>Refresh</button>
          {recordingsError && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{recordingsError}</div>}
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {recordings.map(rec => (
              <button key={rec.id} onClick={() => setSelectedId(rec.id)} style={{ textAlign: "left", padding: 8, borderRadius: 10, border: rec.id === selectedId ? "1px solid var(--accent)" : "1px solid var(--panel-border)" }}>
                <div style={{ fontWeight: 600 }}>{rec.title}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{new Date(rec.started_at).toLocaleString()}</div>
                <div style={{ marginTop: 4 }}>{statusChip(rec.status)}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, minHeight: 320, background: "var(--panel-bg)", color: "var(--text-primary)" }}>
          {!selected && <div style={{ color: "#6b7280" }}>Select a recording to view details.</div>}
          {selected && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.title}</div>
                {statusChip(selected.status)}
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {selected.duration ? `${selected.duration}s` : "duration pending"}
                </div>
                <button
                  onClick={() => deleteRecordingById(selected.id)}
                  style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b" }}
                >
                  Delete
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                Recording file:{" "}
                {selected.audioUrl ? (
                  <a href={toAbsolute(selected.audioUrl)} target="_blank" rel="noreferrer">download audio file</a>
                ) : (
                  "pending"
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button onClick={() => exportRecording(selected.id)} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Export meeting notes
                </button>
                <a href={`${serverUrl}/api/recordings/${selected.id}/transcript`} target="_blank" rel="noreferrer">
                  Download transcript.txt
                </a>
                <a href={`${serverUrl}/api/recordings/${selected.id}/notes`} target="_blank" rel="noreferrer">
                  Download meeting_notes.md
                </a>
              </div>
              <div style={{ marginTop: 10, border: "1px solid var(--panel-border)", borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Email this meeting</div>
                <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr auto", gap: 8 }}>
                  <input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="work@email.com"
                    style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                  />
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder={`Meeting Notes: ${selected.title}`}
                    style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                  />
                  <button
                    onClick={() => emailRecording(selected.id)}
                    disabled={!emailTo.trim() || emailSending}
                    style={{ padding: "6px 10px", borderRadius: 8 }}
                  >
                    {emailSending ? "Sending..." : "Email"}
                  </button>
                </div>
                {emailResult && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{emailResult}</div>}
              </div>
              {exportInfo && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Export ready:{" "}
                  <a href={toAbsolute(exportInfo.notesUrl)} target="_blank" rel="noreferrer">notes</a>{" "}
                  |{" "}
                  <a href={toAbsolute(exportInfo.transcriptUrl)} target="_blank" rel="noreferrer">transcript</a>{" "}
                  |{" "}
                  <a href={toAbsolute(exportInfo.audioUrl)} target="_blank" rel="noreferrer">audio</a>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {["summary", "transcript", "tasks", "decisions", "actions", "ask"].map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)} style={{ padding: "6px 10px", borderRadius: 8, border: detailTab === tab ? "1px solid var(--accent)" : "1px solid var(--panel-border)" }}>
                    {tab}
                  </button>
                ))}
              </div>

              {detailTab === "summary" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                    <button onClick={regenerateSummary} disabled={summaryRefreshing || !selected?.transcript_text} style={{ padding: "6px 10px", borderRadius: 8 }}>
                      {summaryRefreshing ? "Refreshing summary..." : "Regenerate summary"}
                    </button>
                  </div>
                  <div style={{ fontWeight: 600 }}>Meeting Info</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Started: {selected.started_at ? new Date(selected.started_at).toLocaleString() : "unknown"}{" "}
                    | Ended: {selected.ended_at ? new Date(selected.ended_at).toLocaleString() : "unknown"}
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 10 }}>TL;DR / Executive Summary</div>
                  <div style={{ fontSize: 13 }}>
                    {selected.summary_json?.tldr
                      || (selected.summary_json?.overview || []).slice(0, 2).join(" ")
                      || (selected.transcript_text || "")
                        .split(/[.!?]/)
                        .map(s => s.trim())
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(". ")
                      || "Summary pending."}
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 10 }}>Attendees</div>
                  <ul>{(selected.summary_json?.attendees || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
                  <div style={{ fontWeight: 600 }}>Overview</div>
                  <ul>{(selected.summary_json?.overview || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
                  <div style={{ fontWeight: 600 }}>Risks</div>
                  <ul>{(selected.summary_json?.risks || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
                  <div style={{ fontWeight: 600 }}>Key Discussion Points/Insights</div>
                  <ul>
                    {(selected.summary_json?.discussionPoints || []).map((item, i) => (
                      <li key={i}><b>{item.topic || "Discussion"}:</b> {item.summary}</li>
                    ))}
                  </ul>
                  <div style={{ fontWeight: 600 }}>Next Steps</div>
                  <ul>{(selected.summary_json?.nextSteps || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
                  {(selected.summary_json?.nextMeeting?.date || selected.summary_json?.nextMeeting?.goal) && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      Next meeting: {selected.summary_json?.nextMeeting?.date || "TBD"} - {selected.summary_json?.nextMeeting?.goal || "TBD"}
                    </div>
                  )}
                  {selected.summary_json?.recommendations?.length > 0 && (
                    <>
                      <div style={{ fontWeight: 600 }}>Recommendations</div>
                      <ul>{selected.summary_json.recommendations.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </>
                  )}
                  {selected.processing_json && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                      Status: {selected.processing_json.stage || "unknown"}
                    </div>
                  )}
                </div>
              )}

              {detailTab === "transcript" && (
                <div style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 14 }}>
                  {selected.transcript_json?.segments?.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {selected.transcript_json.segments.map((seg, idx) => (
                        <div key={idx} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8 }}>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>
                            {formatStamp(seg.start)}-{formatStamp(seg.end)}
                            <div style={{ fontWeight: 600 }}>{seg.speaker}</div>
                          </div>
                          <div>{seg.text}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    selected.transcript_text || "Transcript not available yet."
                  )}
                </div>
              )}

              {detailTab === "tasks" && (
                <div style={{ marginTop: 12 }}>
                  {taskEdits.map((task, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.6fr", gap: 8, marginBottom: 8 }}>
                      <input value={task.task || ""} onChange={(e) => {
                        const next = [...taskEdits];
                        next[idx] = { ...next[idx], task: e.target.value };
                        setTaskEdits(next);
                      }} />
                      <input value={task.owner || ""} onChange={(e) => {
                        const next = [...taskEdits];
                        next[idx] = { ...next[idx], owner: e.target.value };
                        setTaskEdits(next);
                      }} />
                      <input value={task.due || ""} onChange={(e) => {
                        const next = [...taskEdits];
                        next[idx] = { ...next[idx], due: e.target.value };
                        setTaskEdits(next);
                      }} />
                    </div>
                  ))}
                  <button onClick={() => setTaskEdits([...taskEdits, { task: "", owner: "Unassigned", due: "" }])}>Add task</button>
                  <button onClick={saveTasks} style={{ marginLeft: 8 }}>Save tasks</button>
                </div>
              )}

              {detailTab === "decisions" && (
                <div style={{ marginTop: 12 }}>
                  <ul>{(selected.decisions_json || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}

              {detailTab === "actions" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => runAction("schedule_followup")}>Schedule follow-up</button>
                    <button onClick={() => runAction("draft_email")}>Draft recap email</button>
                    <button onClick={() => runAction("create_doc")}>Create recap doc</button>
                    <button onClick={() => runAction("create_task")}>Create task (draft)</button>
                    <button onClick={() => runAction("create_ticket")}>Create ticket (draft)</button>
                  </div>
                  {actionResult && (
                    <pre style={{ marginTop: 10, background: "#0f172a", color: "#e2e8f0", padding: 12, borderRadius: 8 }}>{actionResult}</pre>
                  )}
                  {selectedActions.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 600 }}>Action history</div>
                      <ul>
                        {selectedActions.map(action => (
                          <li key={action.id}>{action.action_type} - {action.status}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {detailTab === "ask" && (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Ask this meeting</div>
                    <textarea value={askMeeting} onChange={(e) => setAskMeeting(e.target.value)} rows={2} style={{ width: "100%" }} />
                    <button onClick={askThisMeeting}>Ask</button>
                    {askMeetingAnswer && <div style={{ marginTop: 8 }}>{askMeetingAnswer}</div>}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Ask across meetings</div>
                    <textarea value={askMemory} onChange={(e) => setAskMemory(e.target.value)} rows={2} style={{ width: "100%" }} />
                    <button onClick={askAcrossMeetings}>Ask</button>
                    {askMemoryAnswer && <div style={{ marginTop: 8 }}>{askMemoryAnswer}</div>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
      {recordingNotice && visible && <div style={{ fontSize: 12, color: "#6b7280" }}>{recordingNotice}</div>}
    </div>
  );
}



