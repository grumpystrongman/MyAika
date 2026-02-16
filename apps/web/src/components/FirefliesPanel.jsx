import { useEffect, useRef, useState } from "react";
import { forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide } from "d3-force";

function parseSummary(summaryJson) {
  if (!summaryJson) return "";
  try {
    const summary = typeof summaryJson === "string" ? JSON.parse(summaryJson) : summaryJson;
    if (!summary) return "";
    if (summary.tldr) return summary.tldr;
    if (Array.isArray(summary.overview) && summary.overview.length) return summary.overview.join(" ");
    return summary.summary || "";
  } catch {
    return "";
  }
}

function KnowledgeGraph({ graph, width = 520, height = 320, selectedId = "", onSelect }) {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef({ mode: "", node: null, lastX: 0, lastY: 0 });
  const [hovered, setHovered] = useState(null);

  const formatLabel = (nodeId = "") => {
    const raw = String(nodeId || "");
    if (!raw) return { display: "", full: "", type: "topic" };
    if (raw.startsWith("#")) {
      const label = raw.slice(1);
      const short = label.length > 18 ? `${label.slice(0, 18)}…` : label;
      return { display: `#${short}`, full: `#${label}`, type: "topic" };
    }
    if (raw.includes("@")) {
      const name = raw.split("@")[0];
      const short = name.length > 18 ? `${name.slice(0, 18)}…` : name;
      return { display: short, full: raw, type: "participant" };
    }
    const short = raw.length > 18 ? `${raw.slice(0, 18)}…` : raw;
    return { display: short, full: raw, type: "participant" };
  };

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { x, y, k } = transformRef.current;
    const nodes = nodesRef.current;
    const links = linksRef.current;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    links.forEach(link => {
      ctx.lineWidth = Math.max(0.4, Math.min(2, (link.weight || 1) * 0.4)) / k;
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.stroke();
    });

    nodes.forEach(node => {
      const isSelected = selectedId && node.id === selectedId;
      const isHovered = hovered && node.id === hovered.id;
      const radius = node.radius || 6;
      const label = formatLabel(node.id);
      ctx.beginPath();
      ctx.fillStyle = isSelected ? "#f97316" : isHovered ? "#38bdf8" : "#0ea5e9";
      ctx.globalAlpha = isSelected ? 0.95 : 0.85;
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (isHovered || isSelected) {
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = isSelected ? "#fb923c" : "#7dd3fc";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const fontSize = Math.max(9, 11 / k);
      ctx.font = `${fontSize}px 'IBM Plex Mono', monospace`;
      ctx.textAlign = "center";
      if (label.display) {
        const metrics = ctx.measureText(label.display);
        const textWidth = metrics.width;
        const padX = 4 / k;
        const padY = 2 / k;
        const labelX = node.x;
        const labelY = node.y - radius - 6 / k;
        const boxW = textWidth + padX * 2;
        const boxH = fontSize + padY * 2;
        const boxX = labelX - boxW / 2;
        const boxY = labelY - boxH;
        node._labelBox = { x: boxX, y: boxY, w: boxW, h: boxH };
        ctx.fillStyle = "rgba(15,23,42,0.7)";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(label.display, labelX, labelY - padY / 2);
      } else {
        node._labelBox = null;
      }
    });

    ctx.restore();
  };

  useEffect(() => {
    const nodes = (graph?.nodes || []).map(node => ({
      ...node,
      radius: 6 + Math.min(14, Math.sqrt(node.count || 1) * 2)
    }));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const links = (graph?.links || [])
      .map(link => ({
        source: nodeById.get(link.source),
        target: nodeById.get(link.target),
        weight: link.weight || 1
      }))
      .filter(link => link.source && link.target);

    nodesRef.current = nodes;
    linksRef.current = links;
    transformRef.current = { x: width * 0.1, y: height * 0.1, k: 1 };

    if (simRef.current) {
      simRef.current.stop();
    }
    if (!nodes.length) {
      drawGraph();
      return () => {};
    }
    const sim = forceSimulation(nodes)
      .force("link", forceLink(links).id(node => node.id).distance(link => 60 - Math.min(link.weight * 3, 30)).strength(link => Math.min(0.6, 0.1 + link.weight / 10)))
      .force("charge", forceManyBody().strength(-160))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide().radius(node => (node.radius || 6) + 10))
      .on("tick", drawGraph);

    simRef.current = sim;
    drawGraph();
    return () => {
      sim.stop();
    };
  }, [graph, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getPointer(evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function toWorld(point) {
      const { x, y, k } = transformRef.current;
      return { x: (point.x - x) / k, y: (point.y - y) / k };
    }

    function findNode(point) {
      const nodes = nodesRef.current;
      for (const node of nodes) {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        const r = (node.radius || 6) + 8;
        if (dx * dx + dy * dy <= r * r) {
          return node;
        }
        const box = node._labelBox;
        if (box && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) {
          return node;
        }
      }
      return null;
    }

    function handleDown(evt) {
      const pt = getPointer(evt);
      const world = toWorld(pt);
      const node = findNode(world);
      dragRef.current.lastX = pt.x;
      dragRef.current.lastY = pt.y;
      if (node) {
        dragRef.current.mode = "node";
        dragRef.current.node = node;
        node.fx = node.x;
        node.fy = node.y;
        if (simRef.current) simRef.current.alphaTarget(0.3).restart();
      } else {
        dragRef.current.mode = "pan";
      }
    }

    function handleMove(evt) {
      const pt = getPointer(evt);
      const mode = dragRef.current.mode;
      if (mode === "node" && dragRef.current.node) {
        const world = toWorld(pt);
        dragRef.current.node.fx = world.x;
        dragRef.current.node.fy = world.y;
        drawGraph();
        return;
      }
      if (mode === "pan") {
        const dx = pt.x - dragRef.current.lastX;
        const dy = pt.y - dragRef.current.lastY;
        transformRef.current.x += dx;
        transformRef.current.y += dy;
        dragRef.current.lastX = pt.x;
        dragRef.current.lastY = pt.y;
        drawGraph();
        return;
      }
      const world = toWorld(pt);
      const node = findNode(world);
      setHovered(node);
      canvas.style.cursor = node ? "pointer" : "grab";
    }

    function handleUp() {
      if (dragRef.current.mode === "node" && dragRef.current.node) {
        dragRef.current.node.fx = null;
        dragRef.current.node.fy = null;
        if (simRef.current) simRef.current.alphaTarget(0);
      }
      dragRef.current.mode = "";
      dragRef.current.node = null;
    }

    function handleClick(evt) {
      const pt = getPointer(evt);
      const world = toWorld(pt);
      const node = findNode(world);
      if (node && onSelect) {
        onSelect(node.id);
      }
    }

    function handleWheel(evt) {
      evt.preventDefault();
      const delta = evt.deltaY > 0 ? 0.9 : 1.1;
      const { x, y, k } = transformRef.current;
      const pt = getPointer(evt);
      const world = { x: (pt.x - x) / k, y: (pt.y - y) / k };
      const nextK = Math.min(2.8, Math.max(0.4, k * delta));
      transformRef.current.k = nextK;
      transformRef.current.x = pt.x - world.x * nextK;
      transformRef.current.y = pt.y - world.y * nextK;
      drawGraph();
    }

    canvas.addEventListener("mousedown", handleDown);
    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseup", handleUp);
    canvas.addEventListener("mouseleave", handleUp);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("mousedown", handleDown);
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseup", handleUp);
      canvas.removeEventListener("mouseleave", handleUp);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [onSelect]);

  useEffect(() => {
    drawGraph();
  }, [selectedId, hovered]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", borderRadius: 12, background: "#0f172a" }} />
      <div style={{ fontSize: 11, color: "#94a3b8" }}>
        {hovered ? `Hover: ${hovered.id} (${hovered.count || 0})` : "Drag to move, scroll to zoom, click a node for details."}
      </div>
    </div>
  );
}

export default function FirefliesPanel({ serverUrl }) {
  const [status, setStatus] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [recordingEntries, setRecordingEntries] = useState([]);
  const [memoryEntries, setMemoryEntries] = useState([]);
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [syncLimit, setSyncLimit] = useState(0);
  const [forceSync, setForceSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncResult, setSyncResult] = useState(null);
  const [syncInfo, setSyncInfo] = useState(null);
  const lastRunningRef = useRef(false);
  const [graphData, setGraphData] = useState(null);
  const [graphStatus, setGraphStatus] = useState("");
  const [selectedNode, setSelectedNode] = useState("");
  const [meetingFilter, setMeetingFilter] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [nodeDetailsStatus, setNodeDetailsStatus] = useState("");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState([]);
  const [asking, setAsking] = useState(false);

  async function loadStatus() {
    const resp = await fetch(`${serverUrl}/api/rag/status`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "rag_status_failed");
    setStatus(data);
  }

  async function loadMeetings(type, setter, search = "", participant = "") {
    const query = new URLSearchParams({ type, limit: "12" });
    if (search) query.set("search", search);
    if (participant) query.set("participant", participant);
    const resp = await fetch(`${serverUrl}/api/rag/meetings?${query.toString()}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "rag_meetings_failed");
    setter(Array.isArray(data.meetings) ? data.meetings : []);
  }

  async function loadGraph() {
    setGraphStatus("Loading knowledge map...");
    const resp = await fetch(`${serverUrl}/api/fireflies/graph?limit=500`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "fireflies_graph_failed");
    setGraphData(data);
    setGraphStatus("");
  }

  async function loadSyncInfo() {
    const resp = await fetch(`${serverUrl}/api/fireflies/sync/status`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "sync_status_failed");
    setSyncInfo(data);
  }

  async function refreshAll() {
    setError("");
    setLoading(true);
    try {
      const tasks = [
        loadStatus(),
        loadSyncInfo(),
        loadGraph(),
        meetingFilter?.type === "participant"
          ? loadMeetings("fireflies", setMeetings, "", meetingFilter.label)
          : meetingFilter?.type === "topic"
            ? loadMeetings("fireflies", setMeetings, meetingFilter.label, "")
            : loadMeetings("fireflies", setMeetings),
        loadMeetings("recordings", setRecordingEntries),
        loadMeetings("memory", setMemoryEntries),
        loadMeetings("feedback", setFeedbackEntries, "thumbs_up")
      ];
      const results = await Promise.allSettled(tasks);
      const firstError = results.find(result => result.status === "rejected");
      if (firstError) {
        setError(firstError.reason?.message || "fireflies_panel_failed");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serverUrl) return;
    try {
      const raw = localStorage.getItem("fireflies_ui_state");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.meetingFilter) setMeetingFilter(saved.meetingFilter);
        if (saved?.selectedNode) setSelectedNode(saved.selectedNode);
      }
    } catch {
      // ignore
    } finally {
      setPrefsLoaded(true);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (!serverUrl || !prefsLoaded) return;
    refreshAll();
    if (selectedNode) {
      loadNodeDetails(selectedNode);
    }
  }, [serverUrl, prefsLoaded, meetingFilter?.type, meetingFilter?.label]);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      const payload = {
        selectedNode,
        meetingFilter
      };
      localStorage.setItem("fireflies_ui_state", JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [selectedNode, meetingFilter, prefsLoaded]);

  useEffect(() => {
    if (!serverUrl) return;
    let mounted = true;
    const poll = async () => {
      try {
        const resp = await fetch(`${serverUrl}/api/fireflies/sync/status`);
        const data = await resp.json();
        if (!mounted) return;
        setSyncInfo(data);
        const wasRunning = lastRunningRef.current;
        const isRunning = Boolean(data?.running);
        if (wasRunning && !isRunning) {
          setSyncStatus("Sync complete.");
          await refreshAll();
        }
        lastRunningRef.current = isRunning;
      } catch {
        // ignore polling errors
      }
    };
    poll();
    const id = setInterval(poll, 12000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [serverUrl]);

  const handleSync = async () => {
    setSyncStatus("Syncing Fireflies transcripts...");
    setSyncResult(null);
    try {
      const useAsync = Number(syncLimit) === 0;
      const resp = await fetch(`${serverUrl}/api/fireflies/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: Number(syncLimit), force: Boolean(forceSync), async: useAsync })
      });
      const raw = await resp.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = { error: "non_json_response", detail: raw || "" };
      }
      if (!resp.ok) {
        const retryNote = data?.retryAt ? ` (retry after ${data.retryAt})` : "";
        const detail = data?.detail ? `: ${String(data.detail).slice(0, 160)}` : "";
        throw new Error(`${data?.error || "sync_failed"}${retryNote}${detail}`);
      }
      setSyncResult(data);
      if (data?.status === "started") {
        setSyncStatus("Sync started in background. Check status for progress.");
        lastRunningRef.current = true;
      } else {
        setSyncStatus("Sync complete.");
      }
      await refreshAll();
    } catch (err) {
      setSyncStatus(`Sync failed: ${err?.message || "sync_failed"}`);
    }
  };

  const handleSelectNode = async (nodeId) => {
    if (!nodeId) return;
    setSelectedNode(nodeId);
    if (nodeId.startsWith("#")) {
      const term = nodeId.slice(1);
      setMeetingFilter({ type: "topic", label: term });
      await loadMeetings("fireflies", setMeetings, term, "");
    } else {
      setMeetingFilter({ type: "participant", label: nodeId });
      await loadMeetings("fireflies", setMeetings, "", nodeId);
    }
    await loadNodeDetails(nodeId);
  };

  const clearMeetingFilter = async () => {
    setMeetingFilter(null);
    setSelectedNode("");
    setNodeDetails(null);
    await loadMeetings("fireflies", setMeetings);
  };

  async function loadNodeDetails(nodeId) {
    if (!nodeId) return;
    setNodeDetailsStatus("Loading details...");
    try {
      const resp = await fetch(`${serverUrl}/api/fireflies/node?node=${encodeURIComponent(nodeId)}&limitMeetings=8&limitSnippets=6`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "node_details_failed");
      setNodeDetails(data);
      setNodeDetailsStatus("");
    } catch (err) {
      setNodeDetails(null);
      setNodeDetailsStatus(err?.message || "node_details_failed");
    }
  }

  const handleAsk = async () => {
    const trimmed = String(question || "").trim();
    if (!trimmed) return;
    setAsking(true);
    setAnswer("");
    setCitations([]);
    try {
      const resp = await fetch(`${serverUrl}/api/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "ask_failed");
      setAnswer(data?.answer || "");
      setCitations(Array.isArray(data?.citations) ? data.citations : []);
    } catch (err) {
      setAnswer(`Error: ${err?.message || "ask_failed"}`);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Fireflies RAG</div>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Status</div>
        {status ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Meetings: {status.firefliesMeetings} · Recordings: {status.recordingMeetings || 0} · Memory: {status.memoryMeetings} · Feedback: {status.feedbackMeetings} · Chunks: {status.totalChunks}
            {status.vectorStore?.vecEnabled === false ? " · sqlite-vec: fallback" : " · sqlite-vec: on"}
            {syncInfo?.running ? ` · Sync: running${syncInfo.startedAt ? ` (since ${syncInfo.startedAt})` : ""}` : ""}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#6b7280" }}>{loading ? "Loading..." : "No status yet."}</div>
        )}
        {syncInfo?.lastResult && !syncInfo?.running && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
            Last sync: {syncInfo.lastResult.finishedAt || "unknown"} · Synced {syncInfo.lastResult.syncedMeetings || 0} · Skipped {syncInfo.lastResult.skippedMeetings || 0}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Sync Fireflies</div>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280" }}>Limit (0 = all)</label>
          <input
            type="number"
            value={syncLimit}
            onChange={(e) => setSyncLimit(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db", marginTop: 6 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
            <input type="checkbox" checked={forceSync} onChange={(e) => setForceSync(e.target.checked)} />
            Force re-sync
          </label>
          <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
            Existing meetings are skipped unless Force re-sync is enabled.
          </div>
          <button onClick={handleSync} style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8 }}>
            Sync Fireflies
          </button>
          {syncStatus && <div style={{ marginTop: 8, fontSize: 12, color: "#374151" }}>{syncStatus}</div>}
          {syncResult && (
            <pre style={{ marginTop: 8, fontSize: 11, background: "#f9fafb", padding: 8, borderRadius: 8, overflowX: "auto" }}>
              {JSON.stringify(syncResult, null, 2)}
            </pre>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Ask Fireflies RAG</div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="Summarize my last week of recordings."
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
          <button
            onClick={handleAsk}
            disabled={asking}
            style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8 }}
          >
            {asking ? "Asking..." : "Ask"}
          </button>
          {answer && (
            <div style={{ marginTop: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>{answer}</div>
          )}
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>Fireflies Knowledge Map</div>
          <div style={{ display: "flex", gap: 8 }}>
            {meetingFilter && (
              <button onClick={clearMeetingFilter} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}>
                Clear Filter
              </button>
            )}
            <button onClick={loadGraph} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}>
              Refresh
            </button>
          </div>
        </div>
        {graphStatus && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{graphStatus}</div>}
        {!graphData?.nodes?.length ? (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>No Fireflies graph data yet.</div>
        ) : (
          <KnowledgeGraph graph={graphData} selectedId={selectedNode} onSelect={handleSelectNode} />
        )}
        <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
          Nodes represent participants and #topics extracted from meeting titles. Click a node to see details.
        </div>
        {meetingFilter && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#475569" }}>
            Filtered by {meetingFilter.type}: <strong>{meetingFilter.label}</strong>
          </div>
        )}
        {graphData && (
          <div style={{ display: "grid", gap: 8, marginTop: 10, fontSize: 11, color: "#64748b" }}>
            {graphData.topParticipants?.length ? (
              <div>Top participants: {graphData.topParticipants.map(item => `${item.name} (${item.count})`).join(", ")}</div>
            ) : null}
            {graphData.topTopics?.length ? (
              <div>Top topics: {graphData.topTopics.map(item => `${item.tag} (${item.count})`).join(", ")}</div>
            ) : null}
          </div>
        )}
      </div>

      {selectedNode && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 60,
          padding: 16
        }}>
          <div style={{
            width: "min(720px, 92vw)",
            maxHeight: "80vh",
            overflow: "auto",
            background: "#ffffff",
            borderRadius: 14,
            padding: 16,
            border: "1px solid #e2e8f0",
            boxShadow: "0 24px 60px rgba(15,23,42,0.25)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {selectedNode.startsWith("#") ? `Topic: ${selectedNode.slice(1)}` : `Participant: ${selectedNode}`}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {meetingFilter && (
                  <button onClick={clearMeetingFilter} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}>
                    Clear Filter
                  </button>
                )}
                <button onClick={() => setSelectedNode("")} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}>
                  Close
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
              Occurs in {graphData?.nodes?.find(node => node.id === selectedNode)?.count || 0} meeting(s).
            </div>
            {nodeDetailsStatus && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{nodeDetailsStatus}</div>
            )}
            {nodeDetails?.summary && (
              <div style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>
                {nodeDetails.summary}
              </div>
            )}
            {nodeDetails?.snippets?.length ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Top snippets</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {nodeDetails.snippets.map(snippet => (
                    <div key={snippet.chunk_id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>
                        {snippet.meeting_title || "Meeting"} · {snippet.occurred_at || ""}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{snippet.chunk_id}</div>
                      <div style={{ marginTop: 6, fontSize: 12 }}>{snippet.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 8 }}>
              {(nodeDetails?.meetings || meetings).slice(0, 8).map(item => {
                const summary = parseSummary(item.summary_json);
                return (
                  <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{item.title || "Meeting"}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{item.occurred_at || "Unknown date"}</div>
                    {summary && <div style={{ marginTop: 6, fontSize: 12 }}>{summary}</div>}
                  </div>
                );
              })}
              {(nodeDetails?.meetings || meetings).length === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No meetings match this filter yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Recent Meeting Summaries</div>
        {meetings.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No meetings indexed yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {meetings.map(item => {
              const summary = parseSummary(item.summary_json);
              return (
                <div key={item.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 600 }}>{item.title || "Meeting"}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{item.occurred_at || "Unknown date"}</div>
                  {summary && <div style={{ marginTop: 6, fontSize: 12 }}>{summary}</div>}
                  {item.source_url && (
                    <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>
                      Open transcript
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Local Recordings</div>
        {recordingEntries.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No recordings indexed yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {recordingEntries.map(item => {
              const summary = parseSummary(item.summary_json);
              return (
                <div key={item.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 600 }}>{item.title || "Recording"}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{item.occurred_at || "Unknown date"}</div>
                  {summary && <div style={{ marginTop: 6, fontSize: 12 }}>{summary}</div>}
                  {item.source_url && (
                    <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>
                      Open audio
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Memory indexed into RAG</div>
          {memoryEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No memory entries yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {memoryEntries.map(entry => (
                <div key={entry.id} style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{entry.title || "Memory"}</div>
                  <div style={{ color: "#6b7280" }}>{entry.occurred_at || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Thumbs‑up feedback indexed</div>
          {feedbackEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No feedback entries yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {feedbackEntries.map(entry => (
                <div key={entry.id} style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{entry.title || "Feedback"}</div>
                  <div style={{ color: "#6b7280" }}>{entry.occurred_at || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {citations.length > 0 && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Citations</div>
          <div style={{ display: "grid", gap: 8 }}>
            {citations.map((cite, idx) => (
              <details key={`${cite.chunk_id}-${idx}`} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  {cite.meeting_title || "Meeting"} ({cite.occurred_at || "Unknown date"})
                </summary>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{cite.chunk_id}</div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: 12 }}>{cite.snippet}</div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
