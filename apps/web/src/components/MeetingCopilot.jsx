import { useEffect, useMemo, useRef, useState } from "react";

const STATUS_COLORS = {
  recording: "#dc2626",
  paused: "#d97706",
  processing: "#2563eb",
  ready: "#16a34a",
  failed: "#b91c1c"
};

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
  const t = String(text || "").toLowerCase();
  if (!t.includes("hey aika") && !t.includes("aika,")) return null;
  if (t.includes("start recording")) return "start";
  if (t.includes("start recording meeting")) return "start";
  if (t.includes("record") && !t.includes("recording stopped")) return "start";
  if (t.includes("stop recording")) return "stop";
  if (t.includes("pause recording")) return "pause";
  if (t.includes("resume recording")) return "resume";
  return null;
}

export default function MeetingCopilot({
  serverUrl,
  registerControls,
  onActivateTab,
  onRecordingStateChange,
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
  const commandRecRef = useRef(null);

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
    if (!selectedId) return;
    loadRecording(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!registerControls) return;
    registerControls({
      start: startRecording,
      stop: stopRecording
    });
  }, [registerControls, recordingTitle, redactionEnabled]);

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

  async function startRecording() {
    try {
      if (recordingActive) return;
      if (onActivateTab) onActivateTab();
      const resp = await fetch(`${serverUrl}/api/recordings/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: recordingTitle, redactionEnabled })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "recording_start_failed");
      const id = data.recording.id;
      setRecordingId(id);
      chunkSeqRef.current = 0;
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
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = async (evt) => {
        if (!evt.data || evt.data.size === 0) return;
        const seq = chunkSeqRef.current++;
        const form = new FormData();
        form.append("chunk", evt.data, `chunk-${seq}.webm`);
        await fetch(`${serverUrl}/api/recordings/${id}/chunk?seq=${seq}`, {
          method: "POST",
          body: form
        });
      };
      recorder.onstop = async () => {
        await fetch(`${serverUrl}/api/recordings/${id}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSec: elapsed })
        });
        cleanupAudio();
        stopStream();
        setRecordingActive(false);
        if (onRecordingStateChange) onRecordingStateChange(false);
        setRecordingPaused(false);
        setRecordingNotice("Processing transcript and summaries...");
        refreshRecordings();
      };
      recorder.start(1000);
      setRecordingActive(true);
      if (onRecordingStateChange) onRecordingStateChange(true);
      setRecordingPaused(false);
      setElapsed(0);
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setRecordingNotice("Recording...");
    } catch (err) {
      setRecordingNotice(err?.message || "recording_start_failed");
      cleanupAudio();
      stopStream();
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
      setCommandListening(false);
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
          <button onClick={startRecording} style={{ padding: "10px 16px", borderRadius: 10, background: "#111827", color: "#fff" }}>
            Start recording
          </button>
          <input value={recordingTitle} onChange={(e) => setRecordingTitle(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minWidth: 220 }} />
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
            Listening for voice commands (say “hey Aika, start recording”)
          </label>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{commandStatus}</div>
        </div>
      )}

      {recordingActive && (
        <div style={{ position: "fixed", right: 24, bottom: 24, width: 320, background: "#fff", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", padding: 16, zIndex: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: "#dc2626", boxShadow: "0 0 12px rgba(220,38,38,0.8)" }} />
            <strong>Recording...</strong>
            <div style={{ marginLeft: "auto", fontSize: 12 }}>{formatDuration(elapsed)}</div>
          </div>
          <div style={{ marginTop: 10 }}>
            <canvas ref={waveformRef} width={280} height={60} style={{ width: "100%", background: "#f8fafc", borderRadius: 8 }} />
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            Recording audio. Please ensure participant consent.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {!recordingPaused ? (
              <button onClick={pauseRecording} style={{ flex: 1, padding: 8, borderRadius: 8 }}>Pause</button>
            ) : (
              <button onClick={resumeRecording} style={{ flex: 1, padding: 8, borderRadius: 8 }}>Resume</button>
            )}
            <button onClick={stopRecording} style={{ flex: 1, padding: 8, borderRadius: 8, background: "#111827", color: "#fff" }}>Stop</button>
          </div>
        </div>
      )}

      {!visible && !recordingActive && !recordingNotice ? null : (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)", color: "var(--text-primary)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Recordings</div>
          <input placeholder="Search recordings" value={recordingQuery} onChange={(e) => setRecordingQuery(e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #d1d5db", marginBottom: 8 }} />
          <select value={recordingStatusFilter} onChange={(e) => setRecordingStatusFilter(e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #d1d5db", marginBottom: 8 }}>
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
              <button key={rec.id} onClick={() => setSelectedId(rec.id)} style={{ textAlign: "left", padding: 8, borderRadius: 10, border: rec.id === selectedId ? "2px solid #2563eb" : "1px solid #e5e7eb" }}>
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
                  <a href={toAbsolute(selected.audioUrl)} target="_blank" rel="noreferrer">download audio (webm/opus)</a>
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
                  <button key={tab} onClick={() => setDetailTab(tab)} style={{ padding: "6px 10px", borderRadius: 8, border: detailTab === tab ? "2px solid #2563eb" : "1px solid #e5e7eb" }}>
                    {tab}
                  </button>
                ))}
              </div>

              {detailTab === "summary" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600 }}>Meeting Info</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Started: {selected.started_at ? new Date(selected.started_at).toLocaleString() : "unknown"}{" "}
                    | Ended: {selected.ended_at ? new Date(selected.ended_at).toLocaleString() : "unknown"}
                  </div>
                  <div style={{ fontWeight: 600 }}>Overview</div>
                  <ul>{(selected.summary_json?.overview || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
                  <div style={{ fontWeight: 600 }}>Risks</div>
                  <ul>{(selected.summary_json?.risks || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
                  <div style={{ fontWeight: 600 }}>Next Steps</div>
                  <ul>{(selected.summary_json?.nextSteps || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
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
                            {formatStamp(seg.start)}–{formatStamp(seg.end)}
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
