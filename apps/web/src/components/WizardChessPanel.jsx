import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import { gsap } from "gsap";
import WizardArenaScene from "./WizardArenaScene";
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_PERSONALITY_MODE,
  DIFFICULTY_PRESETS,
  PERSONALITY_MODES,
  resolveDifficultyPreset,
  resolvePersonalityMode
} from "../wizardChess/presets";
import { detectOpening } from "../wizardChess/openingBook";
import {
  createDefaultWizardMemory,
  loadWizardMemory,
  recordWizardGameMemory,
  recordWizardMoveMemory,
  saveWizardMemory,
  summarizeWizardHabits
} from "../wizardChess/memory";
import { buildWizardReaction } from "../wizardChess/reactions";
import {
  ARMY_THEMES,
  BOARD_THEMES,
  resolveArmyBattleProfile,
  resolveArmyGlyph,
  resolveArmyTheme,
  resolveBoardTheme
} from "../wizardChess/themes";
import { playWizardSound, warmWizardSoundscape } from "../wizardChess/soundscape";
import { ENCOUNTERS, resolveEncounter } from "../wizardChess/encounters";
import {
  DEFAULT_UNIVERSE_PACK_ID,
  UNIVERSE_PACKS,
  resolveUniversePack,
  resolveUniversePieceLabel,
  resolveUniversePieceSprite
} from "../wizardChess/universePacks";

const UI_PREFS_KEY = "aika_wizard_chess_ui_v2";
const DEFAULT_UI_PREFS = {
  boardTheme: BOARD_THEMES[0].id,
  armyTheme: ARMY_THEMES[0].id,
  universePackId: DEFAULT_UNIVERSE_PACK_ID,
  voiceEnabled: true,
  voiceRate: 1.02,
  voicePitch: 1.06,
  voiceName: "",
  sfxEnabled: true,
  cinematicIntensity: 0.78,
  encounterId: "custom"
};
const ENCOUNTER_PACK_MAP = {
  ember_warlord: "iron_rebels",
  moon_court: "mythic_realms",
  frost_marshal: "frontier_fleet",
  void_archon: "occult_wardens",
  storm_regent: "starward_legions",
  crypt_oracle: "druidic_conclave"
};

function resolveServerUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL || "";
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (/localhost|127\.0\.0\.1/i.test(origin)) return "http://127.0.0.1:8790";
  }
  return "http://127.0.0.1:8790";
}

function loadUiPrefs() {
  if (typeof window === "undefined") return DEFAULT_UI_PREFS;
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_UI_PREFS,
      ...parsed,
      boardTheme: resolveBoardTheme(parsed?.boardTheme).id,
      armyTheme: resolveArmyTheme(parsed?.armyTheme).id,
      universePackId: resolveUniversePack(parsed?.universePackId).id,
      voiceEnabled: parsed?.voiceEnabled !== false,
      voiceRate: Number.isFinite(Number(parsed?.voiceRate)) ? Number(parsed.voiceRate) : DEFAULT_UI_PREFS.voiceRate,
      voicePitch: Number.isFinite(Number(parsed?.voicePitch)) ? Number(parsed.voicePitch) : DEFAULT_UI_PREFS.voicePitch,
      voiceName: typeof parsed?.voiceName === "string" ? parsed.voiceName : DEFAULT_UI_PREFS.voiceName,
      sfxEnabled: parsed?.sfxEnabled !== false,
      cinematicIntensity: Number.isFinite(Number(parsed?.cinematicIntensity))
        ? Math.max(0.2, Math.min(1.2, Number(parsed.cinematicIntensity)))
        : DEFAULT_UI_PREFS.cinematicIntensity,
      encounterId: resolveEncounter(parsed?.encounterId).id
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

function saveUiPrefs(prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage failures
  }
}

function pieceValue(piece = "") {
  const map = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  return map[String(piece || "").toLowerCase()] || 0;
}

function squareToPercent(square = "a1", orientation = "white") {
  const fileIdx = Math.max(0, Math.min(7, String(square || "a1").charCodeAt(0) - 97));
  const rank = Math.max(1, Math.min(8, Number(String(square || "a1").slice(1)) || 1));
  if (orientation === "black") {
    return {
      x: ((7 - fileIdx) + 0.5) * 12.5,
      y: ((rank - 1) + 0.5) * 12.5
    };
  }
  return {
    x: (fileIdx + 0.5) * 12.5,
    y: ((8 - rank) + 0.5) * 12.5
  };
}

function buildPieceSpriteVars(packId = "") {
  const colors = ["white", "black"];
  const pieces = ["p", "n", "b", "r", "q", "k"];
  const vars = {};
  for (const color of colors) {
    const side = color === "white" ? "w" : "b";
    for (const piece of pieces) {
      const sprite = resolveUniversePieceSprite(packId, side, piece);
      vars[`--wizard-piece-${color}-${piece}`] = sprite ? `url('${sprite}')` : "none";
    }
  }
  return vars;
}

function squareName(file, rank) {
  return `${"abcdefgh"[file]}${8 - rank}`;
}

function toDests(chess) {
  const dests = new Map();
  const moves = chess.moves({ verbose: true });
  for (const move of moves) {
    if (!dests.has(move.from)) dests.set(move.from, []);
    dests.get(move.from).push(move.to);
  }
  return dests;
}

function isInCheckCompat(chess) {
  if (!chess) return false;
  if (typeof chess.isCheck === "function") return chess.isCheck();
  if (typeof chess.inCheck === "function") return chess.inCheck();
  return false;
}

function findCheckedKingSquare(chess) {
  if (!isInCheckCompat(chess)) return undefined;
  const board = chess.board();
  const target = chess.turn();
  for (let rank = 0; rank < board.length; rank += 1) {
    for (let file = 0; file < board[rank].length; file += 1) {
      const piece = board[rank][file];
      if (piece?.type === "k" && piece?.color === target) {
        return squareName(file, rank);
      }
    }
  }
  return undefined;
}

function formatClock(ms = 0) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatEval(evaluation = null) {
  if (!evaluation) return "n/a";
  if (evaluation.scoreType === "mate") {
    const value = Number(evaluation.scoreValue || 0);
    if (value > 0) return `M${value}`;
    if (value < 0) return `-M${Math.abs(value)}`;
    return "M0";
  }
  const cp = Number(evaluation.scoreWhiteCp || 0);
  const pawns = (cp / 100).toFixed(2);
  return `${cp >= 0 ? "+" : ""}${pawns}`;
}

function toTurnColor(color) {
  return color === "w" ? "white" : "black";
}

function parseUciMove(uci = "") {
  const move = String(uci || "").trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return null;
  return {
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    promotion: move.length > 4 ? move[4] : undefined
  };
}

function normalizePromotionUci(chess, uci = "") {
  const raw = String(uci || "").trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw)) return raw;
  if (raw.length === 5) return raw;
  const from = raw.slice(0, 2);
  const to = raw.slice(2, 4);
  const piece = chess?.get?.(from);
  if (!piece || piece.type !== "p") return raw;
  const rank = to[1];
  if ((piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1")) {
    return `${raw}q`;
  }
  return raw;
}

function pickPreferredVoice(voices = [], preferredName = "") {
  const englishVoices = voices.filter(item => /en/i.test(String(item?.lang || "")));
  if (preferredName) {
    const exact = englishVoices.find(item => String(item?.name || "") === preferredName);
    if (exact) return exact;
  }
  const preferred = englishVoices.find(item => /zira|aria|samantha|female|luna|nova/i.test(String(item?.name || "").toLowerCase()));
  return preferred || englishVoices[0] || voices[0] || null;
}

function speakLine({
  text = "",
  enabled = true,
  rate = 1.02,
  pitch = 1.06,
  voiceName = "",
  force = false,
  lastSpokenRef,
  lastSpokenAtRef
}) {
  if (!enabled || !text || typeof window === "undefined" || !window.speechSynthesis) return;
  const now = Date.now();
  const key = String(text || "").trim().toLowerCase();
  if (lastSpokenRef?.current && lastSpokenRef.current.key === key && now - lastSpokenRef.current.ts < 1200) {
    return;
  }
  if (!force && lastSpokenAtRef?.current && now - lastSpokenAtRef.current < 1000) {
    return;
  }

  const utterance = new window.SpeechSynthesisUtterance(String(text || ""));
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = pickPreferredVoice(voices, voiceName);
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = Math.max(0.85, Math.min(1.2, Number(rate) || 1.02));
  utterance.pitch = Math.max(0.85, Math.min(1.35, Number(pitch) || 1.06));
  utterance.volume = 0.95;
  if (window.speechSynthesis.speaking) {
    if (force) {
      window.speechSynthesis.cancel();
    } else {
      return;
    }
  }
  window.speechSynthesis.speak(utterance);

  if (lastSpokenRef) {
    lastSpokenRef.current = { key, ts: now };
  }
  if (lastSpokenAtRef) {
    lastSpokenAtRef.current = now;
  }
}

function chooseResultText(chess, userColor) {
  if (chess.isCheckmate()) {
    return chess.turn() === (userColor === "white" ? "w" : "b") ? "Aika wins by checkmate." : "You win by checkmate.";
  }
  if (chess.isDraw()) return "Draw by rule.";
  if (chess.isStalemate()) return "Draw by stalemate.";
  if (chess.isThreefoldRepetition()) return "Draw by repetition.";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material.";
  return "Game finished.";
}

function buildBattleUnit(themeId, universePackId, color, piece) {
  const glyph = resolveArmyGlyph(themeId, piece);
  const side = color === "w" ? "White" : "Black";
  const role = resolveUniversePieceLabel(universePackId, color, piece);
  const sprite = resolveUniversePieceSprite(universePackId, color, piece);
  return { glyph, sprite, label: `${side} ${role}` };
}

export default function WizardChessPanel() {
  const serverUrl = useMemo(() => resolveServerUrl(), []);
  const boardRef = useRef(null);
  const boardFrameRef = useRef(null);
  const boardApiRef = useRef(null);
  const chatStreamRef = useRef(null);
  const battleAttackerRef = useRef(null);
  const battleDefenderRef = useRef(null);
  const battleFlashRef = useRef(null);
  const battleImpactRef = useRef(null);
  const battleRuneRef = useRef(null);
  const moveTrailRef = useRef(null);
  const moveImpactRef = useRef(null);
  const duelRootRef = useRef(null);
  const duelAttackerRef = useRef(null);
  const duelDefenderRef = useRef(null);
  const duelClashRef = useRef(null);
  const userMoveHandlerRef = useRef(() => false);
  const speechMemoRef = useRef({ key: "", ts: 0 });
  const speechLastAtRef = useRef(0);
  const finisherTimeoutRef = useRef(null);
  const duelTimeoutRef = useRef(null);

  const chessRef = useRef(new Chess());
  const lastMoveRef = useRef(null);
  const clockTimerRef = useRef(null);
  const runningRef = useRef(true);
  const reactionRecentRef = useRef([]);
  const greetedRef = useRef(false);
  const gameSummaryRef = useRef({
    opening: "",
    sacrifices: 0,
    blunders: 0,
    brilliantMoves: 0
  });

  const [initialized, setInitialized] = useState(false);
  const [uiPrefsLoaded, setUiPrefsLoaded] = useState(false);
  const [fen, setFen] = useState(chessRef.current.fen());
  const [playerColor, setPlayerColor] = useState("white");
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [personalityMode, setPersonalityMode] = useState(DEFAULT_PERSONALITY_MODE);
  const [engineThinking, setEngineThinking] = useState(false);
  const [statusText, setStatusText] = useState("Summon Aika and start your duel.");
  const [evaluation, setEvaluation] = useState(null);
  const [hintMove, setHintMove] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(DEFAULT_UI_PREFS.voiceEnabled);
  const [voiceRate, setVoiceRate] = useState(DEFAULT_UI_PREFS.voiceRate);
  const [voicePitch, setVoicePitch] = useState(DEFAULT_UI_PREFS.voicePitch);
  const [voiceName, setVoiceName] = useState(DEFAULT_UI_PREFS.voiceName);
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [sfxEnabled, setSfxEnabled] = useState(DEFAULT_UI_PREFS.sfxEnabled);
  const [cinematicIntensity, setCinematicIntensity] = useState(DEFAULT_UI_PREFS.cinematicIntensity);
  const [encounterId, setEncounterId] = useState(DEFAULT_UI_PREFS.encounterId);
  const [boardTheme, setBoardTheme] = useState(DEFAULT_UI_PREFS.boardTheme);
  const [armyTheme, setArmyTheme] = useState(DEFAULT_UI_PREFS.armyTheme);
  const [universePackId, setUniversePackId] = useState(DEFAULT_UI_PREFS.universePackId);
  const [pulse, setPulse] = useState("idle");
  const [mood, setMood] = useState("focused");
  const [aikaLog, setAikaLog] = useState([]);
  const [memory, setMemory] = useState(() => createDefaultWizardMemory());
  const [lastOpening, setLastOpening] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [turnColor, setTurnColor] = useState("white");
  const [battleFx, setBattleFx] = useState(null);
  const [moveFx, setMoveFx] = useState(null);
  const [duelCutscene, setDuelCutscene] = useState(null);
  const [finisherFx, setFinisherFx] = useState(null);
  const [clocks, setClocks] = useState({
    whiteMs: 5 * 60 * 1000,
    blackMs: 5 * 60 * 1000
  });

  const moveHistory = useMemo(() => chessRef.current.history({ verbose: true }), [fen]);
  const userTurn = useMemo(
    () => turnColor === playerColor && !gameOver,
    [turnColor, playerColor, gameOver]
  );

  const habits = useMemo(() => summarizeWizardHabits(memory), [memory]);
  const activeEncounter = useMemo(() => resolveEncounter(encounterId), [encounterId]);
  const activeBoardTheme = useMemo(() => resolveBoardTheme(boardTheme), [boardTheme]);
  const activeArmyTheme = useMemo(() => resolveArmyTheme(armyTheme), [armyTheme]);
  const activeUniversePack = useMemo(() => resolveUniversePack(universePackId), [universePackId]);
  const activeBattleProfile = useMemo(() => resolveArmyBattleProfile(armyTheme), [armyTheme]);

  const pageStyleVars = useMemo(() => ({
    "--wizard-page-gradient": activeBoardTheme.pageGradient,
    "--wizard-square-light": activeBoardTheme.boardLight,
    "--wizard-square-dark": activeBoardTheme.boardDark,
    "--wizard-board-border": activeBoardTheme.boardBorder,
    "--wizard-aura": activeBoardTheme.aura,
    "--wizard-white-filter": activeArmyTheme.whiteFilter,
    "--wizard-black-filter": activeArmyTheme.blackFilter,
    "--wizard-battle-accent": activeBattleProfile.accent,
    "--wizard-battle-impact": activeBattleProfile.impact,
    "--wizard-pack-glow": activeBattleProfile.accent
  }), [activeArmyTheme, activeBattleProfile, activeBoardTheme]);

  const pieceSpriteVars = useMemo(
    () => buildPieceSpriteVars(universePackId),
    [universePackId]
  );

  const syncBoardState = useCallback(() => {
    const chess = chessRef.current;
    const nextFen = chess.fen();
    setFen(nextFen);
    setTurnColor(toTurnColor(chess.turn()));
    setGameOver(chess.isGameOver() || false);
    const api = boardApiRef.current;
    if (!api) return;
    const checkedSquare = findCheckedKingSquare(chess);
    const colorForMoves = !chess.isGameOver() && toTurnColor(chess.turn()) === playerColor ? playerColor : undefined;
    api.set({
      fen: nextFen,
      orientation: playerColor,
      turnColor: toTurnColor(chess.turn()),
      check: checkedSquare,
      movable: {
        free: false,
        color: colorForMoves,
        dests: colorForMoves ? toDests(chess) : new Map()
      },
      lastMove: lastMoveRef.current ? [lastMoveRef.current.from, lastMoveRef.current.to] : undefined
    });
  }, [playerColor]);

  const pushReaction = useCallback((eventType, context = {}) => {
    const recent = reactionRecentRef.current.slice(-7);
    const reaction = buildWizardReaction({
      mode: personalityMode,
      eventType,
      context,
      recentLines: recent,
      memory
    });
    if (!reaction?.text) return;
    reactionRecentRef.current = [...recent, reaction.text];
    setMood(reaction.mood || "focused");
    setAikaLog(current => [
      ...current.slice(-35),
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text: reaction.text,
        eventType,
        mood: reaction.mood || "focused",
        ts: new Date().toLocaleTimeString()
      }
    ]);
    const forceVoiceEvents = new Set(["check", "checkmate", "capture", "promotion"]);
    const voiceGateMs = eventType === "move_made" ? 1450 : 1100;
    const elapsed = Date.now() - (speechLastAtRef.current || 0);
    const allowSpeech = forceVoiceEvents.has(eventType) || elapsed >= voiceGateMs;
    speakLine({
      text: reaction.text,
      enabled: voiceEnabled && allowSpeech,
      rate: voiceRate,
      pitch: voicePitch,
      voiceName,
      force: forceVoiceEvents.has(eventType),
      lastSpokenRef: speechMemoRef,
      lastSpokenAtRef: speechLastAtRef
    });
  }, [memory, personalityMode, voiceEnabled, voiceName, voicePitch, voiceRate]);

  const animatePulse = useCallback((type = "capture") => {
    const frame = boardFrameRef.current;
    if (!frame) return;
    setPulse(type);
    const intensity = Math.max(0.45, Math.min(1.35, Number(cinematicIntensity) || 0.78));
    const color = type === "check" ? "255,90,90" : type === "checkmate" ? "255,198,92" : "109,214,255";
    gsap.killTweensOf(frame);
    gsap.fromTo(
      frame,
      { boxShadow: "0 0 0 rgba(0,0,0,0)", x: 0, scale: 1, rotate: 0 },
      {
        boxShadow: `0 0 ${Math.round(44 * intensity)}px rgba(${color},0.68), 0 0 ${Math.round(86 * intensity)}px rgba(${color},0.32)`,
        x: type === "capture" ? 4 * intensity : 1.5 * intensity,
        rotate: type === "capture" ? 0.4 * intensity : 0.15 * intensity,
        scale: type === "checkmate" ? 1 + 0.02 * intensity : 1 + 0.008 * intensity,
        duration: 0.11 + (0.03 * intensity),
        yoyo: true,
        repeat: type === "capture" ? 5 : 3,
        ease: "power2.out",
        clearProps: "x,rotate,scale",
        onComplete: () => setPulse("idle")
      }
    );
  }, [cinematicIntensity]);

  const playEventSound = useCallback((eventType) => {
    playWizardSound(eventType, {
      enabled: sfxEnabled,
      intensity: 0.45 + (Number(cinematicIntensity) || 0.78)
    });
  }, [cinematicIntensity, sfxEnabled]);

  const applyUniversePack = useCallback((nextPackId, options = {}) => {
    const pack = resolveUniversePack(nextPackId);
    setUniversePackId(pack.id);
    const shouldSyncThemes = options?.syncThemes !== false;
    if (shouldSyncThemes) {
      setBoardTheme(pack.boardTheme);
      setArmyTheme(pack.armyTheme);
      setEncounterId("custom");
      setStatusText(`Universe pack loaded: ${pack.label}`);
      pushReaction("game_start", { opening: pack.label });
    }
  }, [pushReaction]);

  const applyEncounter = useCallback((nextEncounterId) => {
    const encounter = resolveEncounter(nextEncounterId);
    setEncounterId(encounter.id);
    if (encounter?.preset) {
      setDifficulty(encounter.preset.difficulty);
      setPersonalityMode(encounter.preset.personalityMode);
      setBoardTheme(encounter.preset.boardTheme);
      setArmyTheme(encounter.preset.armyTheme);
      setUniversePackId(ENCOUNTER_PACK_MAP[encounter.id] || DEFAULT_UNIVERSE_PACK_ID);
      setStatusText(`Encounter loaded: ${encounter.label}`);
      pushReaction("game_start", { opening: encounter.label });
    }
  }, [pushReaction]);

  const postEngineRequest = useCallback(async (payload) => {
    const response = await fetch(`${serverUrl}/api/chess/engine-move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "wizard_chess_engine_failed");
    }
    return data;
  }, [serverUrl]);

  const concludeGame = useCallback((resultText = "") => {
    const chess = chessRef.current;
    runningRef.current = false;
    setGameOver(true);
    setEngineThinking(false);
    setStatusText(resultText || chooseResultText(chess, playerColor));
    if (chess.isCheckmate()) {
      animatePulse("checkmate");
      playEventSound("checkmate");
      pushReaction("checkmate");
      const winner = chess.turn() === (playerColor === "white" ? "w" : "b") ? "Aika" : "You";
      setFinisherFx({ text: `${winner} unleashes the final spell`, ts: Date.now() });
      if (finisherTimeoutRef.current) clearTimeout(finisherTimeoutRef.current);
      finisherTimeoutRef.current = setTimeout(() => {
        setFinisherFx(null);
      }, 2300);
    } else {
      setFinisherFx(null);
    }
    const memoryNext = recordWizardGameMemory(memory, {
      ...gameSummaryRef.current,
      result: resultText || chooseResultText(chess, playerColor)
    });
    setMemory(memoryNext);
    saveWizardMemory(memoryNext);
  }, [animatePulse, memory, playEventSound, playerColor, pushReaction]);

  const processMoveEvents = useCallback((move, actor, openingName = "") => {
    const chess = chessRef.current;
    const actorLabel = actor === "player" ? "You" : "Aika";
    const orientation = playerColor;
    const fromPercent = squareToPercent(move.from, orientation);
    const toPercent = squareToPercent(move.to, orientation);
    setMoveFx({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from: move.from,
      to: move.to,
      san: move.san,
      actor,
      fromPercent,
      toPercent
    });
    setStatusText(`${actorLabel} played ${move.san}.`);
    if (move.captured) {
      const profile = resolveArmyBattleProfile(armyTheme);
      const attackerRole = resolveUniversePieceLabel(universePackId, move.color, move.piece);
      const defenderRole = resolveUniversePieceLabel(universePackId, move.color === "w" ? "b" : "w", move.captured);
      setBattleFx({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        eventType: "capture",
        actor,
        from: move.from,
        to: move.to,
        san: move.san,
        battleText: `${attackerRole} ${profile.strikeVerb} on ${defenderRole}`,
        accent: profile.accent,
        impact: profile.impact,
        attacker: { color: move.color, piece: move.piece },
        defender: { color: move.color === "w" ? "b" : "w", piece: move.captured }
      });
      setDuelCutscene({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: `${attackerRole} vs ${defenderRole}`,
        subtitle: `${activeUniversePack.label} - ${profile.finisher || activeUniversePack.finisherVerb}`,
        battleText: `${attackerRole} ${activeUniversePack.strikeVerb || profile.strikeVerb} on ${defenderRole}`,
        attacker: { color: move.color, piece: move.piece },
        defender: { color: move.color === "w" ? "b" : "w", piece: move.captured }
      });
      pushReaction("capture", { actor });
      playEventSound("capture");
      animatePulse("capture");
    } else if (Math.random() < 0.3) {
      pushReaction("move_made", { actor });
      playEventSound("move");
    } else {
      playEventSound("move");
    }
    if (move.promotion) {
      pushReaction("promotion", { actor });
      playEventSound("promotion");
      animatePulse("capture");
    }
    if (isInCheckCompat(chess)) {
      pushReaction("check", { actor });
      playEventSound("check");
      animatePulse("check");
    }
    if (openingName && openingName !== lastOpening) {
      setLastOpening(openingName);
      gameSummaryRef.current.opening = openingName;
      pushReaction("opening_detected", { opening: openingName });
    }
  }, [activeUniversePack, animatePulse, armyTheme, lastOpening, playEventSound, playerColor, pushReaction, universePackId]);

  const runEngineTurn = useCallback(async () => {
    if (engineThinking || gameOver) return;
    const chess = chessRef.current;
    if (toTurnColor(chess.turn()) === playerColor) return;
    setEngineThinking(true);
    try {
      const preset = resolveDifficultyPreset(difficulty);
      const result = await postEngineRequest({
        fen: chess.fen(),
        preset: preset.id,
        moveTimeMs: preset.moveTimeMs,
        purpose: "move"
      });
      const parsed = parseUciMove(result?.move || result?.bestMove || "");
      if (!parsed) {
        setStatusText("Engine returned no legal move.");
        concludeGame("Engine could not continue.");
        return;
      }
      const move = chess.move(parsed);
      if (!move) {
        setStatusText("Engine move was invalid for this board state.");
        concludeGame("Engine move invalid.");
        return;
      }
      lastMoveRef.current = { from: move.from, to: move.to };
      const openingName = detectOpening(chess.history({ verbose: true }).map(item => `${item.from}${item.to}${item.promotion || ""}`));
      processMoveEvents(move, "aika", openingName);
      setEvaluation(result?.evaluation || null);
      if (result?.softened && Math.random() < 0.4) {
        pushReaction("move_made", { actor: "aika" });
      }
      syncBoardState();
      if (chess.isGameOver()) {
        concludeGame(chooseResultText(chess, playerColor));
      }
    } catch (err) {
      setStatusText(`Engine error: ${err?.message || "wizard_chess_engine_failed"}`);
    } finally {
      setEngineThinking(false);
    }
  }, [
    concludeGame,
    difficulty,
    engineThinking,
    gameOver,
    playerColor,
    postEngineRequest,
    processMoveEvents,
    pushReaction,
    syncBoardState
  ]);

  const applyUserUciMove = useCallback((uci) => {
    if (engineThinking || gameOver) return false;
    const chess = chessRef.current;
    if (toTurnColor(chess.turn()) !== playerColor) return false;
    const parsed = parseUciMove(normalizePromotionUci(chess, uci));
    if (!parsed) return false;
    const beforeMoveFen = chess.fen();
    const move = chess.move(parsed);
    if (!move) {
      pushReaction("illegal_move_attempt");
      setStatusText("Illegal move. Try another square.");
      if (boardApiRef.current) boardApiRef.current.set({ fen: beforeMoveFen });
      return false;
    }

    const wasSacrifice = pieceValue(move.piece) >= 5 && !move.captured;
    const likelyBlunder = !move.captured && pieceValue(move.piece) >= 3 && chess.moves({ verbose: true }).some(reply => reply.captured && reply.to === move.to);
    const brilliant = move.san.includes("+") && wasSacrifice;

    if (wasSacrifice) gameSummaryRef.current.sacrifices += 1;
    if (likelyBlunder) {
      gameSummaryRef.current.blunders += 1;
      pushReaction("blunder");
    }
    if (brilliant) {
      gameSummaryRef.current.brilliantMoves += 1;
      pushReaction("brilliant_move");
    }

    setMemory(current => {
      const next = recordWizardMoveMemory(current, move, "player");
      saveWizardMemory(next);
      return next;
    });

    lastMoveRef.current = { from: move.from, to: move.to };
    const openingName = detectOpening(chess.history({ verbose: true }).map(item => `${item.from}${item.to}${item.promotion || ""}`));
    processMoveEvents(move, "player", openingName);
    syncBoardState();

    if (chess.isGameOver()) {
      concludeGame(chooseResultText(chess, playerColor));
      return true;
    }

    setTimeout(() => {
      runEngineTurn();
    }, 260);
    return true;
  }, [
    concludeGame,
    engineThinking,
    gameOver,
    playerColor,
    processMoveEvents,
    pushReaction,
    runEngineTurn,
    syncBoardState
  ]);

  useEffect(() => {
    userMoveHandlerRef.current = applyUserUciMove;
  }, [applyUserUciMove]);

  const startNewGame = useCallback((color = playerColor) => {
    chessRef.current = new Chess();
    lastMoveRef.current = null;
    setHintMove("");
    setEvaluation(null);
    setLastOpening("");
    setPlayerColor(color);
    setBattleFx(null);
    setMoveFx(null);
    setDuelCutscene(null);
    setFinisherFx(null);
    setClocks({ whiteMs: 5 * 60 * 1000, blackMs: 5 * 60 * 1000 });
    setGameOver(false);
    setEngineThinking(false);
    setMood("focused");
    runningRef.current = true;
    gameSummaryRef.current = {
      opening: "",
      sacrifices: 0,
      blunders: 0,
      brilliantMoves: 0
    };
    setStatusText("Duel initialized. Your move.");
    playEventSound("game_start");
    pushReaction("game_start");
    syncBoardState();
    if (color === "black") {
      setTimeout(() => runEngineTurn(), 360);
    }
  }, [playEventSound, playerColor, pushReaction, runEngineTurn, syncBoardState]);

  const requestHint = useCallback(async () => {
    if (gameOver) return;
    try {
      const result = await postEngineRequest({
        fen: chessRef.current.fen(),
        preset: resolveDifficultyPreset(difficulty).id,
        moveTimeMs: 320,
        purpose: "hint"
      });
      const best = String(result?.bestMove || result?.move || "");
      setHintMove(best);
      setStatusText(best ? `Hint: ${best}` : "No hint available.");
      if (best) pushReaction("move_made");
    } catch (err) {
      setStatusText(`Hint failed: ${err?.message || "hint_failed"}`);
    }
  }, [difficulty, gameOver, postEngineRequest, pushReaction]);

  const testVoice = useCallback(() => {
    warmWizardSoundscape();
    speakLine({
      text: "Arcane channel online. I can hear you.",
      enabled: voiceEnabled,
      rate: voiceRate,
      pitch: voicePitch,
      voiceName,
      force: true,
      lastSpokenRef: speechMemoRef,
      lastSpokenAtRef: speechLastAtRef
    });
  }, [voiceEnabled, voiceName, voicePitch, voiceRate]);

  const undoTurn = useCallback(() => {
    if (engineThinking) return;
    const chess = chessRef.current;
    if (!chess.history().length) return;
    chess.undo();
    if (toTurnColor(chess.turn()) !== playerColor && chess.history().length) {
      chess.undo();
    }
    setStatusText("Last turn undone.");
    setBattleFx(null);
    setMoveFx(null);
    setDuelCutscene(null);
    syncBoardState();
  }, [engineThinking, playerColor, syncBoardState]);

  const resign = useCallback(() => {
    if (gameOver) return;
    runningRef.current = false;
    setGameOver(true);
    setMoveFx(null);
    setDuelCutscene(null);
    setFinisherFx(null);
    setStatusText("You resigned. Aika claims the board.");
    pushReaction("resignation");
    const memoryNext = recordWizardGameMemory(memory, {
      ...gameSummaryRef.current,
      result: "You resigned."
    });
    setMemory(memoryNext);
    saveWizardMemory(memoryNext);
  }, [gameOver, memory, pushReaction]);

  useEffect(() => {
    const saved = loadWizardMemory();
    setMemory(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
    const hydrateVoices = () => {
      const voices = window.speechSynthesis
        .getVoices()
        .filter(item => /en/i.test(String(item?.lang || "")));
      setVoiceOptions(voices);
      if (!voices.length) return;
      if (voiceName && voices.some(item => item.name === voiceName)) return;
      const fallback = pickPreferredVoice(voices);
      if (fallback?.name) {
        setVoiceName(fallback.name);
      }
    };
    hydrateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", hydrateVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", hydrateVoices);
    };
  }, [voiceName]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (!voiceEnabled) {
      window.speechSynthesis.cancel();
    }
  }, [voiceEnabled]);

  useEffect(() => {
    warmWizardSoundscape();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const primeAudio = () => warmWizardSoundscape();
    window.addEventListener("pointerdown", primeAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", primeAudio);
    };
  }, []);

  useEffect(() => {
    const prefs = loadUiPrefs();
    setVoiceEnabled(prefs.voiceEnabled);
    setVoiceRate(prefs.voiceRate);
    setVoicePitch(prefs.voicePitch);
    setVoiceName(prefs.voiceName || "");
    setSfxEnabled(prefs.sfxEnabled);
    setCinematicIntensity(prefs.cinematicIntensity);
    setEncounterId(prefs.encounterId);
    setBoardTheme(prefs.boardTheme);
    setArmyTheme(prefs.armyTheme);
    setUniversePackId(prefs.universePackId || DEFAULT_UNIVERSE_PACK_ID);
    setUiPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!uiPrefsLoaded) return;
    saveUiPrefs({
      boardTheme,
      armyTheme,
      universePackId,
      encounterId,
      voiceEnabled,
      voiceRate,
      voicePitch,
      voiceName,
      sfxEnabled,
      cinematicIntensity
    });
  }, [armyTheme, boardTheme, cinematicIntensity, encounterId, sfxEnabled, uiPrefsLoaded, universePackId, voiceEnabled, voiceName, voicePitch, voiceRate]);

  useEffect(() => {
    if (!boardRef.current || boardApiRef.current) return;
    const chess = chessRef.current;
    boardApiRef.current = Chessground(boardRef.current, {
      fen: chess.fen(),
      orientation: playerColor,
      turnColor: toTurnColor(chess.turn()),
      movable: {
        free: false,
        color: playerColor,
        dests: toDests(chess),
        events: {
          after: (orig, dest) => {
            userMoveHandlerRef.current(`${orig}${dest}`);
          }
        }
      },
      animation: {
        enabled: true,
        duration: 240
      },
      draggable: {
        enabled: true,
        showGhost: true
      },
      highlight: {
        lastMove: true,
        check: true
      }
    });
    setInitialized(true);
    return () => {
      boardApiRef.current?.destroy?.();
      boardApiRef.current = null;
    };
  }, [playerColor]);

  useEffect(() => {
    if (!initialized) return;
    syncBoardState();
  }, [initialized, syncBoardState]);

  useEffect(() => {
    if (!initialized || typeof window === "undefined" || typeof window.ResizeObserver === "undefined") return undefined;
    const boardHost = boardRef.current;
    const api = boardApiRef.current;
    if (!boardHost || !api) return undefined;
    const observer = new window.ResizeObserver(() => {
      api.redrawAll?.();
      api.set({
        fen: chessRef.current.fen(),
        orientation: playerColor,
        turnColor: toTurnColor(chessRef.current.turn()),
        check: findCheckedKingSquare(chessRef.current),
        movable: {
          free: false,
          color: !chessRef.current.isGameOver() && toTurnColor(chessRef.current.turn()) === playerColor ? playerColor : undefined,
          dests: toDests(chessRef.current)
        },
        lastMove: lastMoveRef.current ? [lastMoveRef.current.from, lastMoveRef.current.to] : undefined
      });
    });
    observer.observe(boardHost);
    return () => observer.disconnect();
  }, [initialized, playerColor]);

  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    pushReaction("game_start");
  }, [pushReaction]);

  useEffect(() => {
    if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    clockTimerRef.current = setInterval(() => {
      if (!runningRef.current || gameOver) return;
      const active = chessRef.current.turn() === "w" ? "whiteMs" : "blackMs";
      setClocks(current => {
        const nextValue = Math.max(0, current[active] - 250);
        const next = { ...current, [active]: nextValue };
        if (nextValue <= 0) {
          runningRef.current = false;
          setGameOver(true);
          setStatusText(active === "whiteMs" ? "White flag fell." : "Black flag fell.");
        }
        return next;
      });
    }, 250);
    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
  }, [gameOver]);

  useEffect(() => {
    if (!gameOver && toTurnColor(chessRef.current.turn()) !== playerColor) {
      runEngineTurn();
    }
  }, [gameOver, playerColor, runEngineTurn]);

  useEffect(() => {
    const chatStream = chatStreamRef.current;
    if (!chatStream) return;
    chatStream.scrollTop = chatStream.scrollHeight;
  }, [aikaLog]);

  useEffect(() => {
    if (!battleFx) return;
    const attacker = battleAttackerRef.current;
    const defender = battleDefenderRef.current;
    const flash = battleFlashRef.current;
    const impact = battleImpactRef.current;
    const rune = battleRuneRef.current;
    const frame = boardFrameRef.current;
    if (!attacker || !defender || !flash || !impact || !rune || !frame) return;
    const intensity = Math.max(0.4, Math.min(1.25, Number(cinematicIntensity) || 0.78));

    gsap.killTweensOf([attacker, defender, flash, impact, rune, frame]);
    gsap.set(attacker, { x: -86 * intensity, y: 0, opacity: 0, scale: 0.84 });
    gsap.set(defender, { x: 86 * intensity, y: 0, opacity: 0, scale: 0.84 });
    gsap.set(flash, { opacity: 0, scale: 0.22 });
    gsap.set(impact, { opacity: 0, scale: 0.35 });
    gsap.set(rune, { opacity: 0, scale: 0.56, rotate: -38 });
    gsap.set(frame, { transformOrigin: "50% 50%", rotate: 0, scale: 1 });

    const timeline = gsap.timeline({
      onComplete: () => {
        setBattleFx(null);
      }
    });

    timeline
      .to(attacker, { x: -18, opacity: 1, scale: 1, duration: 0.16 + 0.05 * intensity, ease: "power2.out" })
      .to(defender, { x: 18, opacity: 1, scale: 1, duration: 0.16 + 0.05 * intensity, ease: "power2.out" }, "<")
      .to(rune, { opacity: 0.9, scale: 1.05, rotate: 8, duration: 0.16 + 0.03 * intensity, ease: "power2.out" }, "<")
      .to(frame, { rotate: 0.34 * intensity, scale: 1 + 0.014 * intensity, duration: 0.1 + 0.03 * intensity, yoyo: true, repeat: 1, ease: "power1.inOut" }, "<")
      .to(attacker, { x: 62 * intensity, y: -7 * intensity, duration: 0.18 + 0.06 * intensity, ease: "power2.in" })
      .to(defender, { x: -42 * intensity, opacity: 0.22, scale: 0.72, duration: 0.21 + 0.08 * intensity, ease: "power3.out" }, "<")
      .to(flash, { opacity: 1, scale: 1.36, duration: 0.13 + 0.04 * intensity, ease: "power2.out" }, "<")
      .to(impact, { opacity: 0.82, scale: 1.32 + (0.2 * intensity), duration: 0.14 + 0.04 * intensity, ease: "expo.out" }, "<")
      .to(rune, { opacity: 0.2, scale: 1.4, rotate: 26, duration: 0.14 + 0.05 * intensity, ease: "power1.out" }, "<")
      .to(flash, { opacity: 0, scale: 1.8, duration: 0.16 + 0.05 * intensity, ease: "power2.in" })
      .to(impact, { opacity: 0, scale: 1.9, duration: 0.18 + 0.06 * intensity, ease: "power2.out" }, "<")
      .to(rune, { opacity: 0, scale: 1.8, rotate: 62, duration: 0.2 + 0.06 * intensity, ease: "power2.in" }, "<")
      .set(frame, { rotate: 0, scale: 1 });

    return () => {
      timeline.kill();
    };
  }, [battleFx, cinematicIntensity]);

  useEffect(() => {
    if (!moveFx) return;
    const trail = moveTrailRef.current;
    const impact = moveImpactRef.current;
    if (!trail || !impact) return;
    const dx = moveFx.toPercent.x - moveFx.fromPercent.x;
    const dy = moveFx.toPercent.y - moveFx.fromPercent.y;
    const distance = Math.max(4, Math.sqrt((dx * dx) + (dy * dy)));
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    gsap.killTweensOf([trail, impact]);
    gsap.set(trail, {
      left: `${moveFx.fromPercent.x}%`,
      top: `${moveFx.fromPercent.y}%`,
      width: `${distance}%`,
      rotate: angle,
      opacity: 0
    });
    gsap.set(impact, {
      left: `${moveFx.toPercent.x}%`,
      top: `${moveFx.toPercent.y}%`,
      opacity: 0,
      scale: 0.3
    });
    const timeline = gsap.timeline({
      onComplete: () => setMoveFx(null)
    });
    timeline
      .to(trail, { opacity: 0.95, duration: 0.14, ease: "power2.out" })
      .to(impact, { opacity: 0.9, scale: 1.2, duration: 0.16, ease: "expo.out" }, "<")
      .to(trail, { opacity: 0, duration: 0.2, ease: "power1.in" })
      .to(impact, { opacity: 0, scale: 1.8, duration: 0.22, ease: "power2.out" }, "<");
    return () => timeline.kill();
  }, [moveFx]);

  useEffect(() => {
    if (!duelCutscene) return;
    const root = duelRootRef.current;
    const attacker = duelAttackerRef.current;
    const defender = duelDefenderRef.current;
    const clash = duelClashRef.current;
    if (!root || !attacker || !defender || !clash) return;
    const intensity = Math.max(0.45, Math.min(1.3, Number(cinematicIntensity) || 0.78));
    gsap.killTweensOf([root, attacker, defender, clash]);
    gsap.set(root, { opacity: 0 });
    gsap.set(attacker, { x: -140 * intensity, opacity: 0, scale: 0.88 });
    gsap.set(defender, { x: 140 * intensity, opacity: 0, scale: 0.88 });
    gsap.set(clash, { opacity: 0, scale: 0.4, rotate: -18 });
    const timeline = gsap.timeline();
    timeline
      .to(root, { opacity: 1, duration: 0.18, ease: "power1.out" })
      .to(attacker, { x: -18, opacity: 1, scale: 1, duration: 0.22, ease: "power2.out" }, "<")
      .to(defender, { x: 18, opacity: 1, scale: 1, duration: 0.22, ease: "power2.out" }, "<")
      .to(attacker, { x: 42, duration: 0.18, ease: "power2.in" })
      .to(defender, { x: -44, duration: 0.2, ease: "power2.inOut" }, "<")
      .to(clash, { opacity: 1, scale: 1.25, rotate: 0, duration: 0.14, ease: "expo.out" }, "<")
      .to(clash, { opacity: 0, scale: 1.9, duration: 0.2, ease: "power2.inOut" })
      .to(root, { opacity: 0, duration: 0.22, ease: "power1.in" }, "+=0.44")
      .set(root, { display: "none" });
    if (duelTimeoutRef.current) clearTimeout(duelTimeoutRef.current);
    duelTimeoutRef.current = setTimeout(() => {
      setDuelCutscene(null);
    }, 1750);
    return () => timeline.kill();
  }, [cinematicIntensity, duelCutscene]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__WIZARD_CHESS_TEST = {
      playUci: (uci) => applyUserUciMove(String(uci || "")),
      getFen: () => chessRef.current.fen(),
      getHistory: () => chessRef.current.history(),
      getClocks: () => ({ ...clocks }),
      getBattleState: () => ({
        hasMoveFx: Boolean(moveFx),
        hasBattleFx: Boolean(battleFx),
        hasDuelCutscene: Boolean(duelCutscene)
      })
    };
    return () => {
      delete window.__WIZARD_CHESS_TEST;
    };
  }, [applyUserUciMove, battleFx, clocks, duelCutscene, moveFx]);

  useEffect(() => () => {
    if (finisherTimeoutRef.current) {
      clearTimeout(finisherTimeoutRef.current);
    }
    if (duelTimeoutRef.current) {
      clearTimeout(duelTimeoutRef.current);
    }
  }, []);

  const groupedMoves = useMemo(() => {
    const rows = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      rows.push({
        ply: Math.floor(i / 2) + 1,
        white: moveHistory[i]?.san || "",
        black: moveHistory[i + 1]?.san || ""
      });
    }
    return rows;
  }, [moveHistory]);

  const battleAttacker = battleFx ? buildBattleUnit(armyTheme, universePackId, battleFx.attacker.color, battleFx.attacker.piece) : null;
  const battleDefender = battleFx ? buildBattleUnit(armyTheme, universePackId, battleFx.defender.color, battleFx.defender.piece) : null;
  const duelAttacker = duelCutscene ? buildBattleUnit(armyTheme, universePackId, duelCutscene.attacker.color, duelCutscene.attacker.piece) : null;
  const duelDefender = duelCutscene ? buildBattleUnit(armyTheme, universePackId, duelCutscene.defender.color, duelCutscene.defender.piece) : null;
  const activeBattleCue = duelCutscene || battleFx || null;

  return (
    <div className="wizard-page" style={{ ...pageStyleVars, ...pieceSpriteVars }}>
      <div className="wizard-header">
        <div>
          <h1>Wizard Chess: Aika Duel Chamber</h1>
          <p>Cinematic mode active. Choose a universe pack, arena, and army, then duel.</p>
        </div>
        <div className="wizard-header-actions">
          <button onClick={() => startNewGame("white")}>Play White</button>
          <button onClick={() => startNewGame("black")}>Play Black</button>
          <button onClick={requestHint}>Hint</button>
          <button onClick={undoTurn}>Undo</button>
          <button onClick={resign}>Resign</button>
        </div>
      </div>

      <div className="wizard-layout">
        <section className="wizard-panel wizard-left">
          <h2>Match Ledger</h2>
          <div className="wizard-status-line"><span>Status</span><strong>{statusText}</strong></div>
          <div className="wizard-status-line"><span>Evaluation</span><strong>{formatEval(evaluation)}</strong></div>
          <div className="wizard-status-line"><span>Hint</span><strong>{hintMove || "none"}</strong></div>
          <div className="wizard-clocks">
            <div className={turnColor === "white" ? "active" : ""}><label>White</label><strong>{formatClock(clocks.whiteMs)}</strong></div>
            <div className={turnColor === "black" ? "active" : ""}><label>Black</label><strong>{formatClock(clocks.blackMs)}</strong></div>
          </div>
          <div className="wizard-moves">
            <table>
              <thead><tr><th>#</th><th>White</th><th>Black</th></tr></thead>
              <tbody>
                {groupedMoves.map(row => (
                  <tr key={row.ply}><td>{row.ply}</td><td>{row.white}</td><td>{row.black}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="wizard-center">
          <div className="wizard-board-shell" ref={boardFrameRef}>
            <WizardArenaScene
              pulse={pulse}
              palette={activeBoardTheme.scenePalette}
              cinematicIntensity={cinematicIntensity}
              battleCue={activeBattleCue}
              accent={activeBattleProfile.accent}
              impact={activeBattleProfile.impact}
            />
            <div className="wizard-board-overlay" />
            <div className="wizard-board" ref={boardRef} />
            {moveFx && (
              <div className="wizard-move-layer">
                <div className="move-trail" ref={moveTrailRef} />
                <div className="move-impact" ref={moveImpactRef} />
              </div>
            )}
            {battleFx && (
              <div className="wizard-battle-layer">
                <div className="battle-unit attacker" ref={battleAttackerRef}>
                  <span className="glyph">{battleAttacker?.glyph}</span>
                  {battleAttacker?.sprite ? <img src={battleAttacker.sprite} alt="" className="battle-sprite" /> : null}
                  <span>{battleAttacker?.label}</span>
                </div>
                <div className="battle-rune" ref={battleRuneRef} />
                <div className="battle-impact" ref={battleImpactRef} />
                <div className="battle-flash" ref={battleFlashRef}>
                  <strong>{battleFx.battleText || battleFx.san}</strong>
                  <span>{battleFx.san}</span>
                </div>
                <div className="battle-unit defender" ref={battleDefenderRef}>
                  <span className="glyph">{battleDefender?.glyph}</span>
                  {battleDefender?.sprite ? <img src={battleDefender.sprite} alt="" className="battle-sprite" /> : null}
                  <span>{battleDefender?.label}</span>
                </div>
              </div>
            )}
            {duelCutscene && (
              <div className="wizard-duel-cutscene" ref={duelRootRef}>
                <div className="duel-title">{duelCutscene.title}</div>
                <div className="duel-subtitle">{duelCutscene.subtitle}</div>
                <div className="duel-fighters">
                  <div className="duel-unit attacker" ref={duelAttackerRef}>
                    <span className="glyph">{duelAttacker?.glyph}</span>
                    {duelAttacker?.sprite ? <img src={duelAttacker.sprite} alt="" className="duel-sprite" /> : null}
                    <span>{duelAttacker?.label}</span>
                  </div>
                  <div className="duel-clash" ref={duelClashRef}>CLASH</div>
                  <div className="duel-unit defender" ref={duelDefenderRef}>
                    <span className="glyph">{duelDefender?.glyph}</span>
                    {duelDefender?.sprite ? <img src={duelDefender.sprite} alt="" className="duel-sprite" /> : null}
                    <span>{duelDefender?.label}</span>
                  </div>
                </div>
                <div className="duel-battle-text">{duelCutscene.battleText}</div>
              </div>
            )}
            {finisherFx && (
              <div className="wizard-finisher-layer">
                <div className="finisher-rune">Arcane Checkmate</div>
                <div className="finisher-text">{finisherFx.text}</div>
              </div>
            )}
          </div>
          <div className="wizard-controls">
            <label>Encounter
              <select value={encounterId} onChange={e => applyEncounter(e.target.value)}>
                {ENCOUNTERS.map(item => (<option key={item.id} value={item.id}>{item.label}</option>))}
              </select>
            </label>
            <label>Universe Pack
              <select
                value={universePackId}
                onChange={e => applyUniversePack(e.target.value, { syncThemes: true })}
              >
                {UNIVERSE_PACKS.map(item => (<option key={item.id} value={item.id}>{item.label}</option>))}
              </select>
            </label>
            <label>Difficulty
              <select value={difficulty} onChange={e => { setEncounterId("custom"); setDifficulty(e.target.value); }}>
                {DIFFICULTY_PRESETS.map(item => (<option key={item.id} value={item.id}>{item.label}</option>))}
              </select>
            </label>
            <label>Personality
              <select value={personalityMode} onChange={e => { setEncounterId("custom"); setPersonalityMode(e.target.value); }}>
                {PERSONALITY_MODES.map(item => (<option key={item.id} value={item.id}>{item.label}</option>))}
              </select>
            </label>
            <label>Board Theme
              <select value={boardTheme} onChange={e => { setEncounterId("custom"); setBoardTheme(e.target.value); }}>
                {BOARD_THEMES.map(item => (<option key={item.id} value={item.id}>{item.label}</option>))}
              </select>
            </label>
            <label>Army Theme
              <select value={armyTheme} onChange={e => { setEncounterId("custom"); setArmyTheme(e.target.value); }}>
                {ARMY_THEMES.map(item => (<option key={item.id} value={item.id}>{item.label}</option>))}
              </select>
            </label>
            <label className="wizard-toggle"><input type="checkbox" checked={voiceEnabled} onChange={e => setVoiceEnabled(e.target.checked)} />Aika voice</label>
            <label className="wizard-toggle"><input type="checkbox" checked={sfxEnabled} onChange={e => setSfxEnabled(e.target.checked)} />Battle SFX</label>
            <label>Voice Profile
              <select value={voiceName} onChange={e => setVoiceName(e.target.value)}>
                <option value="">Auto voice</option>
                {voiceOptions.map(item => (
                  <option key={item.voiceURI || item.name} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>Voice Rate
              <input type="range" min="0.9" max="1.2" step="0.01" value={voiceRate} onChange={e => setVoiceRate(Number(e.target.value))} />
            </label>
            <label>Voice Pitch
              <input type="range" min="0.85" max="1.35" step="0.01" value={voicePitch} onChange={e => setVoicePitch(Number(e.target.value))} />
            </label>
            <label>Cinematic Intensity
              <input type="range" min="0.25" max="1.2" step="0.01" value={cinematicIntensity} onChange={e => setCinematicIntensity(Number(e.target.value))} />
            </label>
            <button className="wizard-small-button" onClick={testVoice} type="button">Test Voice</button>
            <div className="wizard-badges">
              <span>{resolveDifficultyPreset(difficulty).summary}</span>
              <span>{resolvePersonalityMode(personalityMode).description}</span>
              <span>{activeBoardTheme.summary}</span>
              <span>{activeArmyTheme.summary}</span>
              <span>{activeUniversePack.label}</span>
              <span>{activeEncounter.summary}</span>
              <span>{`Voice ${voiceEnabled ? "On" : "Muted"}`}</span>
              <span>{`Intensity ${(cinematicIntensity * 100).toFixed(0)}%`}</span>
              <span>Original inspired worlds</span>
              {engineThinking && <span>Aika is calculating...</span>}
              {userTurn && !gameOver && <span>Your move</span>}
              {gameOver && <span>Game over</span>}
            </div>
          </div>
        </section>

        <section className="wizard-panel wizard-right">
          <h2>Aika Presence</h2>
          <div className={`wizard-avatar mood-${mood}`}>
            <div className="sigil" />
            <div className="meta"><strong>{resolvePersonalityMode(personalityMode).label}</strong><span>Mood: {mood}</span></div>
          </div>
          <div className="wizard-habits">
            <h3>Your Patterns</h3>
            <div>Games: {habits.gamesPlayed}</div>
            <div>Favorite opening: {habits.favoriteOpening || "still learning"}</div>
            <div>Favorite piece: {habits.favoritePiece ? habits.favoritePiece.toUpperCase() : "unknown"}</div>
            <div>Aggression ratio: {(habits.aggressionRatio * 100).toFixed(0)}%</div>
          </div>
          <div className="wizard-chat-stream" ref={chatStreamRef}>
            {aikaLog.map(entry => (
              <div key={entry.id} className="wizard-chat-line">
                <div className="line-header"><span>{entry.ts}</span><span>{entry.eventType}</span></div>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style jsx>{`
        .wizard-page {
          height: 100svh;
          min-height: 100dvh;
          max-height: 100dvh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: var(--wizard-page-gradient);
          color: #edf2ff;
          padding: 16px;
          font-family: "Manrope", "Segoe UI", sans-serif;
          gap: 12px;
        }
        .wizard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
        }
        .wizard-header h1 {
          margin: 0;
          font-size: clamp(1.15rem, 2vw, 1.7rem);
          font-family: "Space Grotesk", "Segoe UI", sans-serif;
          letter-spacing: 0.03em;
        }
        .wizard-header p {
          margin: 6px 0 0;
          color: #b8c2de;
          font-size: 0.92rem;
        }
        .wizard-header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .wizard-header-actions button {
          border-radius: 10px;
          border: 1px solid rgba(129, 160, 244, 0.42);
          background: rgba(20, 30, 58, 0.7);
          color: #ecf2ff;
          padding: 8px 12px;
          cursor: pointer;
        }
        .wizard-layout {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: clamp(240px, 22vw, 340px) minmax(560px, 1fr) clamp(260px, 23vw, 360px);
          gap: 12px;
          overflow: hidden;
          align-items: stretch;
        }
        .wizard-panel {
          border: 1px solid rgba(126, 149, 221, 0.26);
          border-radius: 14px;
          background: rgba(15, 19, 30, 0.84);
          backdrop-filter: blur(12px);
          padding: 12px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .wizard-panel.wizard-left {
          display: grid;
          grid-template-rows: auto auto auto minmax(0, 1fr);
          gap: 0;
        }
        .wizard-panel.wizard-right {
          display: grid;
          grid-template-rows: auto auto auto minmax(0, 1fr);
          gap: 0;
          min-height: 0;
        }
        .wizard-panel h2 {
          margin: 0 0 10px;
          font-family: "Space Grotesk", "Segoe UI", sans-serif;
          font-size: 1rem;
        }
        .wizard-status-line {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 0.86rem;
          color: #b8c2de;
        }
        .wizard-status-line strong {
          color: #f7fbff;
          text-align: right;
          max-width: 58%;
          overflow-wrap: anywhere;
        }
        .wizard-clocks {
          margin: 8px 0 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .wizard-clocks > div {
          border: 1px solid rgba(123, 149, 223, 0.24);
          border-radius: 10px;
          padding: 8px;
          background: rgba(22, 26, 40, 0.7);
        }
        .wizard-clocks > div.active {
          border-color: rgba(104, 219, 255, 0.7);
          box-shadow: 0 0 16px rgba(104, 219, 255, 0.24);
        }
        .wizard-clocks label {
          display: block;
          color: #a8b6d6;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .wizard-clocks strong {
          font-size: 1.05rem;
          letter-spacing: 0.08em;
        }
        .wizard-moves {
          border: 1px solid rgba(120, 142, 205, 0.24);
          border-radius: 10px;
          background: rgba(13, 18, 30, 0.76);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-gutter: stable;
          overscroll-behavior: contain;
          min-height: 0;
          flex: 1;
        }
        .wizard-moves table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.84rem;
        }
        .wizard-moves th, .wizard-moves td {
          padding: 6px 8px;
          border-bottom: 1px solid rgba(101, 122, 185, 0.2);
          text-align: left;
        }
        .wizard-center {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-height: 0;
          overflow: hidden;
          align-items: center;
        }
        .wizard-board-shell {
          position: relative;
          flex: 0 0 auto;
          width: min(100%, min(78vh, 900px));
          aspect-ratio: 1 / 1;
          min-height: 0;
          border-radius: 18px;
          border: 1px solid var(--wizard-board-border);
          background: radial-gradient(340px 210px at 50% 88%, var(--wizard-aura), transparent 78%), linear-gradient(180deg, rgba(8, 10, 18, 0.96), rgba(12, 18, 29, 0.92));
          overflow: hidden;
          box-shadow: 0 18px 38px rgba(2, 6, 14, 0.62);
        }
        .wizard-board {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: grid;
          place-items: center;
          padding: clamp(8px, 2.2vw, 20px);
        }
        .wizard-board :global(.cg-wrap) {
          width: min(100%, 100%);
          height: auto;
          aspect-ratio: 1 / 1;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 20px 36px rgba(0, 0, 0, 0.52);
        }
        .wizard-board :global(square.light) { background: var(--wizard-square-light) !important; }
        .wizard-board :global(square.dark) { background: var(--wizard-square-dark) !important; }
        .wizard-board :global(piece.white) {
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35)) drop-shadow(0 8px 10px rgba(0, 0, 0, 0.45)) saturate(1.06) contrast(1.08) brightness(1.04);
          transition: filter .25s ease;
          background-size: 95% 95% !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
        }
        .wizard-board :global(piece.black) {
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.46)) drop-shadow(0 9px 12px rgba(0, 0, 0, 0.6)) saturate(0.88) contrast(1.2) brightness(0.86);
          transition: filter .25s ease;
          background-size: 95% 95% !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
        }
        .wizard-board :global(piece.white.pawn) { background-image: var(--wizard-piece-white-p) !important; }
        .wizard-board :global(piece.white.knight) { background-image: var(--wizard-piece-white-n) !important; }
        .wizard-board :global(piece.white.bishop) { background-image: var(--wizard-piece-white-b) !important; }
        .wizard-board :global(piece.white.rook) { background-image: var(--wizard-piece-white-r) !important; }
        .wizard-board :global(piece.white.queen) { background-image: var(--wizard-piece-white-q) !important; }
        .wizard-board :global(piece.white.king) { background-image: var(--wizard-piece-white-k) !important; }
        .wizard-board :global(piece.black.pawn) { background-image: var(--wizard-piece-black-p) !important; }
        .wizard-board :global(piece.black.knight) { background-image: var(--wizard-piece-black-n) !important; }
        .wizard-board :global(piece.black.bishop) { background-image: var(--wizard-piece-black-b) !important; }
        .wizard-board :global(piece.black.rook) { background-image: var(--wizard-piece-black-r) !important; }
        .wizard-board :global(piece.black.queen) { background-image: var(--wizard-piece-black-q) !important; }
        .wizard-board :global(piece.black.king) { background-image: var(--wizard-piece-black-k) !important; }
        .wizard-board-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(240px 240px at 50% 48%, rgba(97, 173, 255, 0.17), transparent 72%), radial-gradient(300px 190px at 50% 72%, rgba(132, 87, 255, 0.09), transparent 76%);
        }
        .wizard-battle-layer {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          display: grid;
          place-items: center;
        }
        .battle-unit {
          position: absolute;
          min-width: 130px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--wizard-battle-accent) 65%, #ffffff 35%);
          background: color-mix(in srgb, var(--wizard-battle-accent) 18%, rgba(8, 14, 26, 0.86) 82%);
          color: #e8f0ff;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.74rem;
          letter-spacing: 0.02em;
          justify-content: center;
          backdrop-filter: blur(7px);
        }
        .battle-unit .glyph {
          font-size: 1.05rem;
        }
        .battle-sprite {
          width: 28px;
          height: 28px;
          object-fit: contain;
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.25));
        }
        .battle-unit.attacker {
          left: 12%;
        }
        .battle-unit.defender {
          right: 12%;
        }
        .battle-flash {
          min-width: min(46ch, 75%);
          padding: 10px 14px;
          border-radius: 12px;
          background: color-mix(in srgb, var(--wizard-battle-impact) 24%, rgba(9, 14, 28, 0.84) 76%);
          border: 1px solid color-mix(in srgb, var(--wizard-battle-impact) 68%, #fff 32%);
          color: #fff3dd;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          text-transform: none;
          box-shadow: 0 0 26px color-mix(in srgb, var(--wizard-battle-impact) 58%, transparent 42%);
          display: grid;
          gap: 4px;
          text-align: center;
          justify-items: center;
        }
        .battle-flash strong {
          font-size: 0.76rem;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: #fff8e8;
        }
        .battle-flash span {
          font-size: 0.72rem;
          color: #d8e8ff;
          letter-spacing: 0.08em;
        }
        .battle-rune,
        .battle-impact {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
        }
        .battle-rune {
          width: min(56vw, 410px);
          height: min(56vw, 410px);
          border: 1px solid color-mix(in srgb, var(--wizard-battle-accent) 70%, #ffffff 30%);
          box-shadow: 0 0 40px color-mix(in srgb, var(--wizard-battle-accent) 50%, transparent 50%);
        }
        .battle-impact {
          width: min(26vw, 190px);
          height: min(26vw, 190px);
          background: radial-gradient(circle, color-mix(in srgb, var(--wizard-battle-impact) 62%, #fff 38%), color-mix(in srgb, var(--wizard-battle-impact) 40%, transparent 60%) 42%, transparent 72%);
        }
        .wizard-move-layer {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
        }
        .move-trail {
          position: absolute;
          height: 5px;
          border-radius: 999px;
          transform-origin: 0% 50%;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.12), color-mix(in srgb, var(--wizard-battle-accent) 75%, #fff 25%) 52%, color-mix(in srgb, var(--wizard-battle-impact) 68%, #fff 32%));
          box-shadow: 0 0 20px color-mix(in srgb, var(--wizard-battle-accent) 62%, transparent 38%);
          translate: 0 -50%;
        }
        .move-impact {
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          translate: -50% -50%;
          background: radial-gradient(circle, #fff, color-mix(in srgb, var(--wizard-battle-impact) 78%, #fff 22%) 48%, transparent 72%);
          box-shadow: 0 0 22px color-mix(in srgb, var(--wizard-battle-impact) 70%, transparent 30%);
        }
        .wizard-duel-cutscene {
          position: absolute;
          inset: 0;
          z-index: 6;
          pointer-events: none;
          display: grid;
          grid-template-rows: auto auto 1fr auto;
          align-items: center;
          justify-items: center;
          gap: 10px;
          padding: 14px;
          background: radial-gradient(circle at center, color-mix(in srgb, var(--wizard-pack-glow) 18%, transparent 82%), rgba(5, 8, 18, 0.86) 58%);
          border: 1px solid color-mix(in srgb, var(--wizard-pack-glow) 45%, transparent 55%);
          border-radius: 18px;
          backdrop-filter: blur(2px);
        }
        .duel-title {
          font-family: "Space Grotesk", "Segoe UI", sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          font-size: clamp(0.85rem, 1.5vw, 1.1rem);
          color: #f4f8ff;
        }
        .duel-subtitle {
          font-size: 0.76rem;
          color: #b8cbe8;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .duel-fighters {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 10px;
        }
        .duel-unit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 52px;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--wizard-battle-accent) 62%, #fff 38%);
          background: rgba(10, 14, 27, 0.84);
          color: #eef4ff;
          font-size: 0.82rem;
          letter-spacing: 0.02em;
        }
        .duel-unit .glyph {
          font-size: 1.2rem;
        }
        .duel-sprite {
          width: 34px;
          height: 34px;
          object-fit: contain;
          filter: drop-shadow(0 0 7px rgba(255, 255, 255, 0.32));
        }
        .duel-clash {
          min-width: 74px;
          text-align: center;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--wizard-battle-impact) 70%, #fff 30%);
          background: color-mix(in srgb, var(--wizard-battle-impact) 25%, rgba(10, 13, 24, 0.75) 75%);
          padding: 7px 10px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          font-size: 0.7rem;
          color: #fff5df;
          box-shadow: 0 0 20px color-mix(in srgb, var(--wizard-battle-impact) 52%, transparent 48%);
        }
        .duel-battle-text {
          font-size: 0.85rem;
          color: #dce9ff;
          letter-spacing: 0.03em;
          text-align: center;
        }
        .wizard-finisher-layer {
          position: absolute;
          inset: 0;
          z-index: 5;
          pointer-events: none;
          display: grid;
          place-items: center;
          background: radial-gradient(circle at center, rgba(255, 220, 136, 0.18), rgba(8, 12, 25, 0.58) 58%, rgba(5, 8, 18, 0.82));
          animation: finisherFade 2.3s ease-out forwards;
        }
        .finisher-rune {
          font-family: "Space Grotesk", "Segoe UI", sans-serif;
          letter-spacing: 0.18em;
          font-size: clamp(0.95rem, 1.8vw, 1.28rem);
          text-transform: uppercase;
          color: #ffdf9d;
          text-shadow: 0 0 14px rgba(255, 201, 112, 0.7);
          margin-bottom: 6px;
        }
        .finisher-text {
          font-size: clamp(1.1rem, 2.5vw, 1.7rem);
          font-weight: 700;
          color: #f4f7ff;
          text-shadow: 0 0 18px rgba(131, 181, 255, 0.58);
        }
        @keyframes finisherFade {
          0% { opacity: 0; }
          12% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        .wizard-controls {
          width: min(100%, min(78vh, 900px));
          margin: 0 auto;
          border: 1px solid rgba(130, 148, 220, 0.26);
          border-radius: 12px;
          background: rgba(11, 16, 28, 0.8);
          padding: 10px;
          display: grid;
          grid-template-columns: repeat(4, minmax(120px, 1fr));
          gap: 10px;
          align-items: end;
        }
        .wizard-controls label {
          font-size: 0.78rem;
          color: #b2c0de;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .wizard-controls select,
        .wizard-controls input[type="range"] {
          border-radius: 8px;
          border: 1px solid rgba(140, 161, 223, 0.3);
          background: rgba(20, 27, 47, 0.82);
          color: #ecf2ff;
          padding: 7px 8px;
        }
        .wizard-small-button {
          border-radius: 8px;
          border: 1px solid rgba(140, 161, 223, 0.4);
          background: rgba(34, 49, 85, 0.82);
          color: #ecf2ff;
          min-height: 36px;
          padding: 8px 10px;
          cursor: pointer;
          align-self: end;
        }
        .wizard-toggle {
          flex-direction: row !important;
          align-items: center;
          gap: 8px;
          padding-top: 10px;
        }
        .wizard-badges {
          grid-column: 1 / -1;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .wizard-badges span {
          border: 1px solid rgba(128, 155, 220, 0.34);
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.72rem;
          background: rgba(29, 37, 64, 0.66);
          color: #d8e5ff;
        }
        .wizard-avatar {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(132, 153, 224, 0.3);
          border-radius: 12px;
          background: rgba(18, 24, 41, 0.8);
          padding: 10px;
          margin-bottom: 10px;
        }
        .wizard-avatar .sigil {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          background: radial-gradient(circle at 40% 35%, #7fd5ff, #495a9c 60%, #17223c);
          box-shadow: 0 0 20px rgba(117, 196, 255, 0.35);
        }
        .wizard-avatar .meta {
          display: flex;
          flex-direction: column;
          gap: 3px;
          font-size: 0.82rem;
          color: #bed0f2;
        }
        .wizard-avatar.mood-triumphant .sigil { box-shadow: 0 0 26px rgba(255, 196, 106, 0.58); }
        .wizard-avatar.mood-impressed .sigil { box-shadow: 0 0 24px rgba(151, 238, 255, 0.58); }
        .wizard-avatar.mood-smug .sigil { box-shadow: 0 0 24px rgba(255, 140, 183, 0.5); }
        .wizard-habits {
          border: 1px solid rgba(132, 153, 224, 0.24);
          border-radius: 10px;
          background: rgba(18, 24, 41, 0.68);
          padding: 10px;
          margin-bottom: 10px;
          font-size: 0.82rem;
          color: #c4d2ed;
          display: grid;
          gap: 5px;
        }
        .wizard-habits h3 {
          margin: 0 0 4px;
          font-size: 0.88rem;
          color: #f0f4ff;
        }
        .wizard-chat-stream {
          border: 1px solid rgba(132, 153, 224, 0.22);
          border-radius: 10px;
          background: rgba(10, 14, 24, 0.76);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-gutter: stable;
          overscroll-behavior: contain;
          flex: 1;
          min-height: 0;
          max-height: 100%;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .wizard-chat-line {
          border: 1px solid rgba(132, 153, 224, 0.22);
          border-radius: 8px;
          background: rgba(20, 27, 47, 0.72);
          padding: 8px;
        }
        .wizard-chat-line .line-header {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 0.68rem;
          color: #97aad6;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .wizard-chat-line p {
          margin: 6px 0 0;
          font-size: 0.84rem;
          color: #e7efff;
          line-height: 1.35;
        }

        @media (max-width: 1480px) {
          .wizard-layout {
            grid-template-columns: clamp(220px, 21vw, 300px) minmax(480px, 1fr) clamp(230px, 21vw, 320px);
          }
        }

        @media (max-width: 1240px) {
          .wizard-page {
            height: auto;
            min-height: 100dvh;
            max-height: none;
            overflow: auto;
          }
          .wizard-layout {
            grid-template-columns: 1fr;
            overflow: visible;
          }
          .wizard-panel,
          .wizard-center {
            min-height: auto;
            overflow: visible;
          }
          .wizard-panel.wizard-right {
            grid-template-rows: auto auto auto minmax(220px, 1fr);
          }
          .wizard-chat-stream {
            max-height: 340px;
          }
          .wizard-board-shell {
            width: min(100%, 82vw);
            min-height: 320px;
          }
          .wizard-controls {
            width: 100%;
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 760px) {
          .wizard-controls {
            grid-template-columns: 1fr;
          }
          .wizard-toggle {
            padding-top: 0;
          }
          .battle-unit {
            min-width: 110px;
            font-size: 0.68rem;
          }
          .battle-flash {
            min-width: min(80vw, 44ch);
          }
          .duel-fighters {
            grid-template-columns: 1fr;
          }
          .duel-clash {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
