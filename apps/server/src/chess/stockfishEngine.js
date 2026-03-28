import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const ENGINE_SCRIPT = process.env.WIZARD_CHESS_ENGINE_PATH
  || require.resolve("stockfish/bin/stockfish-18-lite-single.js");

const PRESETS = {
  casual: {
    id: "casual",
    skill: 4,
    moveTimeMs: 350,
    multiPv: 3,
    softenWeights: [0.55, 0.3, 0.15]
  },
  clever: {
    id: "clever",
    skill: 8,
    moveTimeMs: 550,
    multiPv: 3,
    softenWeights: [0.72, 0.21, 0.07]
  },
  sharp: {
    id: "sharp",
    skill: 13,
    moveTimeMs: 900,
    multiPv: 2,
    softenWeights: null
  },
  merciless: {
    id: "merciless",
    skill: 18,
    moveTimeMs: 1350,
    multiPv: 1,
    softenWeights: null
  },
  theatrical_genius: {
    id: "theatrical_genius",
    skill: 20,
    moveTimeMs: 1200,
    multiPv: 3,
    softenWeights: [0.8, 0.15, 0.05]
  }
};

function normalizePreset(preset) {
  const key = String(preset || "clever")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return PRESETS[key] || PRESETS.clever;
}

function parseFenSideToMove(fen = "") {
  const parts = String(fen || "").trim().split(/\s+/);
  return parts[1] === "b" ? "b" : "w";
}

function cpFromScore(scoreType, scoreValue) {
  if (scoreType === "cp") return Number(scoreValue);
  if (scoreType === "mate") {
    const v = Number(scoreValue);
    if (!Number.isFinite(v)) return 0;
    if (v > 0) return 100000 - v;
    if (v < 0) return -100000 - v;
    return 0;
  }
  return 0;
}

function parseInfoLine(line = "") {
  if (!line.startsWith("info ")) return null;
  const multiPvMatch = line.match(/\bmultipv\s+(\d+)/i);
  const moveMatch = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);
  const depthMatch = line.match(/\bdepth\s+(\d+)/i);
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/i);
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/i);
  if (!moveMatch) return null;

  const scoreType = mateMatch ? "mate" : cpMatch ? "cp" : "";
  const scoreValue = mateMatch ? Number(mateMatch[1]) : cpMatch ? Number(cpMatch[1]) : 0;

  return {
    multiPv: Number(multiPvMatch?.[1] || 1),
    depth: Number(depthMatch?.[1] || 0),
    move: moveMatch[1],
    scoreType,
    scoreValue,
    scoreCp: cpFromScore(scoreType, scoreValue)
  };
}

function pickSoftenedMove(bestMove, candidates, weights) {
  if (!bestMove || !Array.isArray(candidates) || !candidates.length || !Array.isArray(weights)) {
    return bestMove;
  }
  const usable = candidates.slice(0, weights.length).filter(Boolean);
  if (!usable.length) return bestMove;
  const total = weights.slice(0, usable.length).reduce((sum, value) => sum + Number(value || 0), 0);
  if (total <= 0) return bestMove;
  let roll = Math.random() * total;
  for (let i = 0; i < usable.length; i += 1) {
    roll -= Number(weights[i] || 0);
    if (roll <= 0) return usable[i].move || bestMove;
  }
  return usable[0].move || bestMove;
}

function buildGoCommand(config, overrideMoveTimeMs = 0) {
  const moveTime = Number(overrideMoveTimeMs) > 0 ? Number(overrideMoveTimeMs) : config.moveTimeMs;
  return `go movetime ${Math.max(120, Math.min(5000, Math.floor(moveTime)))}`;
}

export function listWizardChessPresets() {
  return Object.values(PRESETS).map(item => ({
    id: item.id,
    skill: item.skill,
    moveTimeMs: item.moveTimeMs
  }));
}

export async function computeWizardChessEngineMove({
  fen,
  preset = "clever",
  moveTimeMs = 0,
  purpose = "move",
  timeoutMs = 20000
} = {}) {
  const cleanedFen = String(fen || "").trim();
  if (!cleanedFen) {
    const err = new Error("fen_required");
    err.status = 400;
    throw err;
  }

  const config = normalizePreset(preset);
  const sideToMove = parseFenSideToMove(cleanedFen);

  return new Promise((resolve, reject) => {
    const processRef = spawn(process.execPath, [ENGINE_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let settled = false;
    const lines = [];
    const candidatesByIndex = new Map();
    let readyForSearch = false;
    let bestMove = "";
    let bestPonder = "";
    let latestPrimary = null;

    function finalizeWithError(error) {
      if (settled) return;
      settled = true;
      try {
        processRef.stdin.write("quit\n");
      } catch {
        // ignore
      }
      try {
        processRef.kill("SIGTERM");
      } catch {
        // ignore
      }
      reject(error);
    }

    function finalizeSuccess() {
      if (settled) return;
      settled = true;
      const candidates = Array.from(candidatesByIndex.values())
        .sort((a, b) => a.multiPv - b.multiPv)
        .map(item => ({
          move: item.move,
          scoreCp: item.scoreCp,
          scoreType: item.scoreType,
          scoreValue: item.scoreValue,
          depth: item.depth
        }));

      const selectedMove = purpose === "hint"
        ? bestMove
        : pickSoftenedMove(bestMove, candidates, config.softenWeights);

      const primary = latestPrimary || candidates[0] || null;
      const scoreCpSideToMove = primary ? Number(primary.scoreCp || 0) : 0;
      const scoreWhiteCp = sideToMove === "w" ? scoreCpSideToMove : -scoreCpSideToMove;

      try {
        processRef.stdin.write("quit\n");
      } catch {
        // ignore
      }
      try {
        processRef.kill("SIGTERM");
      } catch {
        // ignore
      }

      resolve({
        ok: true,
        move: selectedMove || bestMove,
        bestMove,
        ponder: bestPonder || "",
        preset: config.id,
        purpose: purpose === "hint" ? "hint" : "move",
        softened: Boolean(config.softenWeights && selectedMove && selectedMove !== bestMove),
        evaluation: primary
          ? {
            sideToMove,
            scoreType: primary.scoreType || "cp",
            scoreValue: Number(primary.scoreValue || 0),
            scoreCpSideToMove,
            scoreWhiteCp
          }
          : {
            sideToMove,
            scoreType: "cp",
            scoreValue: 0,
            scoreCpSideToMove: 0,
            scoreWhiteCp: 0
          },
        candidates,
        engine: {
          script: ENGINE_SCRIPT,
          skill: config.skill,
          moveTimeMs: Number(moveTimeMs) > 0 ? Number(moveTimeMs) : config.moveTimeMs
        }
      });
    }

    const timeoutHandle = setTimeout(() => {
      const err = new Error("wizard_chess_engine_timeout");
      err.status = 504;
      finalizeWithError(err);
    }, Math.max(3000, Number(timeoutMs) || 20000));

    processRef.on("error", err => {
      clearTimeout(timeoutHandle);
      const wrapped = new Error(err?.message || "wizard_chess_engine_spawn_failed");
      wrapped.status = 500;
      finalizeWithError(wrapped);
    });

    processRef.stderr.on("data", chunk => {
      lines.push(String(chunk || ""));
    });

    processRef.stdout.on("data", chunk => {
      const text = String(chunk || "");
      const rawLines = text.split(/\r?\n/).map(item => item.trim()).filter(Boolean);

      for (const line of rawLines) {
        lines.push(line);
        if (line === "uciok") {
          processRef.stdin.write(`setoption name Skill Level value ${config.skill}\n`);
          processRef.stdin.write(`setoption name MultiPV value ${config.multiPv}\n`);
          processRef.stdin.write("setoption name Threads value 1\n");
          processRef.stdin.write("setoption name Hash value 24\n");
          processRef.stdin.write("isready\n");
          continue;
        }

        if (line === "readyok" && !readyForSearch) {
          readyForSearch = true;
          processRef.stdin.write("ucinewgame\n");
          processRef.stdin.write(`position fen ${cleanedFen}\n`);
          processRef.stdin.write(`${buildGoCommand(config, moveTimeMs)}\n`);
          continue;
        }

        const info = parseInfoLine(line);
        if (info) {
          const current = candidatesByIndex.get(info.multiPv);
          if (!current || info.depth >= current.depth) {
            candidatesByIndex.set(info.multiPv, info);
          }
          if (info.multiPv === 1) {
            latestPrimary = info;
          }
          continue;
        }

        const bestMoveMatch = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/i);
        if (bestMoveMatch) {
          bestMove = bestMoveMatch[1] === "(none)" ? "" : bestMoveMatch[1];
          bestPonder = bestMoveMatch[2] || "";
          clearTimeout(timeoutHandle);
          if (!bestMove) {
            const err = new Error("wizard_chess_no_move");
            err.status = 422;
            finalizeWithError(err);
            return;
          }
          finalizeSuccess();
          return;
        }
      }
    });

    processRef.on("close", code => {
      if (settled) return;
      clearTimeout(timeoutHandle);
      const err = new Error(`wizard_chess_engine_closed:${code}`);
      err.status = 500;
      err.detail = lines.slice(-30);
      finalizeWithError(err);
    });

    processRef.stdin.write("uci\n");
  });
}
