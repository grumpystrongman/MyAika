function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mergeTargetMaps(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      out[key] = Math.max(out[key] || 0, Number(value) || 0);
    }
  }
  return out;
}

function scaleTargets(targets, scale = 1) {
  const out = {};
  for (const [key, value] of Object.entries(targets || {})) {
    out[key] = (Number(value) || 0) * scale;
  }
  return out;
}

function blendTargetMaps(fromTargets, toTargets, weight) {
  const out = {};
  const keys = new Set([
    ...Object.keys(fromTargets || {}),
    ...Object.keys(toTargets || {})
  ]);
  for (const key of keys) {
    const fromValue = fromTargets?.[key] || 0;
    const toValue = toTargets?.[key] || 0;
    out[key] = fromValue + (toValue - fromValue) * weight;
  }
  return out;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * (3 - 2 * t);
}

export function mapGenericBlendshapesToLenore(blendshapes = {}) {
  const GENERIC_BLENDSHAPE_MAP = {
    jawOpen: {
      Mouth_Lips_Jaw_Adjust: 0.82,
      Mouth_Open: 0.34,
      V_Open: 0.28
    },
    mouthOpen: {
      Mouth_Open: 0.92,
      Mouth_Lips_Part: 0.46,
      V_Open: 0.7
    },
    mouthPucker: {
      Mouth_Pucker: 0.92,
      Mouth_Pucker_Open: 0.68,
      V_Tight_O: 0.78
    },
    mouthFunnel: {
      Mouth_Pucker_Open: 0.9,
      Mouth_Pucker: 0.56,
      V_Tight_O: 0.76
    },
    mouthSmile: {
      Mouth_Smile: 0.82,
      Mouth_Widen: 0.42,
      V_Wide: 0.45
    },
    mouthFrown: {
      Mouth_Frown: 0.7,
      Mouth_Down: 0.32
    },
    browInnerUp: {
      Brow_Raise_Inner_Left: 0.68,
      Brow_Raise_Inner_Right: 0.68
    },
    browDownLeft: {
      Brow_Drop_Left: 0.72
    },
    browDownRight: {
      Brow_Drop_Right: 0.72
    }
  };

  const out = {};
  for (const [key, value] of Object.entries(blendshapes || {})) {
    const normalizedKey = String(key || "").trim();
    const amount = Number(value) || 0;
    if (!amount) continue;
    const mapped = GENERIC_BLENDSHAPE_MAP[normalizedKey];
    if (mapped) {
      for (const [targetName, targetValue] of Object.entries(mapped)) {
        out[targetName] = Math.max(out[targetName] || 0, targetValue * amount);
      }
      continue;
    }
    out[normalizedKey] = Math.max(out[normalizedKey] || 0, amount);
  }
  return out;
}

export function buildBlinkTargets(amount = 0) {
  const blink = clamp(amount, 0, 1);
  if (blink <= 0.001) return {};
  return {
    Eye_Blink_Left: blink,
    Eye_Blink_Right: blink,
    Eye_Blink_L: blink,
    Eye_Blink_R: blink,
    Eye_Close_L: blink,
    Eye_Close_R: blink
  };
}

function phonemeToTargets(phoneme = "") {
  const key = String(phoneme || "").toLowerCase().trim();
  if (["m", "b", "p"].includes(key)) return { Mouth_Plosive: 0.98, V_Explosive: 0.82, Mouth_Lips_Tight: 0.46, Mouth_Lips_Part: 0.02, Mouth_Open: 0.01 };
  if (["f", "v"].includes(key)) return { V_Dental_Lip: 0.86, Mouth_Bottom_Lip_Bite: 0.68, Mouth_Lips_Part: 0.08, Mouth_Open: 0.03 };
  if (["o", "u", "w"].includes(key)) return { Mouth_Pucker: 0.58, Mouth_Pucker_Open: 0.62, V_Tight_O: 0.82, Mouth_Lips_Part: 0.16, Mouth_Open: 0.08 };
  if (["e", "i", "y"].includes(key)) return { Mouth_Widen: 0.54, Mouth_Smile: 0.1, V_Wide: 0.72, Mouth_Lips_Part: 0.18, Mouth_Open: 0.1 };
  if (["a", "h"].includes(key)) return { Mouth_Open: 0.62, Mouth_Lips_Part: 0.34, V_Open: 0.72, Mouth_Lips_Jaw_Adjust: 0.28 };
  if (["s", "z"].includes(key)) return { V_Affricate: 0.52, V_Dental_Lip: 0.2, Mouth_Lips_Part: 0.11, Mouth_Open: 0.02, Mouth_Widen: 0.14, Mouth_Top_Lip_Up: 0.08 };
  if (["ch", "j", "sh"].includes(key)) return { V_Affricate: 0.82, Mouth_Lips_Part: 0.18, Mouth_Open: 0.05, Mouth_Widen: 0.1, Mouth_Pucker_Open: 0.08, Mouth_Top_Lip_Up: 0.04 };
  if (key === "th") return { V_Dental_Lip: 0.34, Mouth_Top_Lip_Up: 0.24, V_Tongue_Out: 0.56, Mouth_Lips_Part: 0.12, Mouth_Open: 0.04 };
  if (["n", "l", "d", "t", "r"].includes(key)) return { Mouth_Lips_Part: 0.18, Mouth_Open: 0.08, V_Tongue_up: 0.16, Mouth_Lips_Tight: 0.06 };
  if (["k", "g", "c", "q"].includes(key)) return { Mouth_Lips_Part: 0.16, Mouth_Open: 0.12, Mouth_Lips_Jaw_Adjust: 0.14 };
  return {};
}

function getPhonemeFamily(phoneme = "") {
  const key = String(phoneme || "").toLowerCase().trim();
  if (["m", "b", "p"].includes(key)) return "plosive";
  if (["f", "v", "th"].includes(key)) return "dental";
  if (["ch", "j", "sh", "s", "z"].includes(key)) return "affricate";
  if (["n", "l", "d", "t", "r", "k", "g", "c", "q"].includes(key)) return "consonant";
  if (["o", "u", "w"].includes(key)) return "rounded";
  if (["e", "i", "y"].includes(key)) return "wide";
  if (["a", "h"].includes(key)) return "open";
  return "other";
}

export function stabilizeMouthTargets(targets = {}) {
  const next = { ...targets };
  const pucker = Math.max(next.Mouth_Pucker || 0, next.Mouth_Pucker_Open || 0, next.V_Tight_O || 0);
  const wide = Math.max(next.Mouth_Widen || 0, next.V_Wide || 0);
  const plosive = Math.max(next.Mouth_Plosive || 0, next.V_Explosive || 0);
  const affricate = Math.max(next.V_Affricate || 0, next.V_Dental_Lip || 0);

  if (pucker > 0.4) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.18);
    next.V_Open = Math.min(next.V_Open || 0, 0.22);
  }
  if (wide > 0.4) {
    next.Mouth_Pucker = Math.min(next.Mouth_Pucker || 0, 0.08);
    next.Mouth_Pucker_Open = Math.min(next.Mouth_Pucker_Open || 0, 0.12);
  }
  if (plosive > 0.35) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.04);
    next.Mouth_Lips_Part = Math.min(next.Mouth_Lips_Part || 0, 0.08);
    next.Mouth_Lips_Jaw_Adjust = Math.min(next.Mouth_Lips_Jaw_Adjust || 0, 0.14);
  }
  if (affricate > 0.35) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.1);
    next.Mouth_Pucker = Math.min(next.Mouth_Pucker || 0, 0.12);
  }
  if ((next.V_Tongue_Out || 0) > 0.2) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.08);
    next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.11), 0.18);
    next.V_Dental_Lip = Math.min(next.V_Dental_Lip || 0, 0.48);
  }
  if ((next.V_Affricate || 0) > 0.45) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.08);
    next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.12), 0.2);
    next.V_Tongue_Out = Math.min(next.V_Tongue_Out || 0, 0.08);
    next.Mouth_Top_Lip_Up = Math.max(next.Mouth_Top_Lip_Up || 0, 0.06);
  }
  next.Mouth_Open = clamp(next.Mouth_Open || 0, 0, 0.32);
  next.V_Open = clamp(next.V_Open || 0, 0, 0.34);
  next.Mouth_Lips_Part = clamp(next.Mouth_Lips_Part || 0, 0, 0.22);
  next.V_Tongue_Out = clamp(next.V_Tongue_Out || 0, 0, 0.26);
  next.Mouth_Top_Lip_Up = clamp(next.Mouth_Top_Lip_Up || 0, 0, 0.18);
  next.Mouth_Smile = clamp(next.Mouth_Smile || 0, 0, 0.2);
  next.Mouth_Widen = clamp(next.Mouth_Widen || 0, 0, 0.24);
  next.Eye_Wide_Left = clamp(next.Eye_Wide_Left || 0, 0, 0.06);
  next.Eye_Wide_Right = clamp(next.Eye_Wide_Right || 0, 0, 0.06);
  next.Eye_Wide_L = clamp(next.Eye_Wide_L || 0, 0, 0.06);
  next.Eye_Wide_R = clamp(next.Eye_Wide_R || 0, 0, 0.06);
  return next;
}

function tightenConsonantClusters(targets, prevCue, currentCue, nextCue) {
  const next = { ...(targets || {}) };
  const currentFamily = getPhonemeFamily(currentCue?.phoneme);
  const prevFamily = getPhonemeFamily(prevCue?.phoneme);
  const nextFamily = getPhonemeFamily(nextCue?.phoneme);
  const currentDuration = Number(currentCue?.duration) || 90;
  const nextGap = nextCue ? Math.max(0, Number(nextCue.time || 0) - (Number(currentCue?.time || 0) + currentDuration)) : 999;
  const prevGap = prevCue ? Math.max(0, Number(currentCue?.time || 0) - (Number(prevCue.time || 0) + (Number(prevCue.duration) || 90))) : 999;
  const isConsonant = ["plosive", "dental", "affricate", "consonant"].includes(currentFamily);
  const isCluster =
    isConsonant &&
    (
      (["plosive", "dental", "affricate", "consonant"].includes(prevFamily) && prevGap < 70) ||
      (["plosive", "dental", "affricate", "consonant"].includes(nextFamily) && nextGap < 70) ||
      currentDuration < 72
    );
  if (!isCluster) return next;

  next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.1);
  next.V_Open = Math.min(next.V_Open || 0, 0.15);
  next.Mouth_Lips_Jaw_Adjust = Math.min(next.Mouth_Lips_Jaw_Adjust || 0, 0.16);
  next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.1), 0.22);

  if (currentFamily === "plosive") {
    next.Mouth_Lips_Tight = Math.max(next.Mouth_Lips_Tight || 0, 0.44);
    next.Mouth_Plosive = Math.max(next.Mouth_Plosive || 0, 0.86);
  } else if (currentFamily === "dental") {
    next.V_Dental_Lip = Math.max(next.V_Dental_Lip || 0, 0.6);
    if (String(currentCue?.phoneme || "").toLowerCase() === "th") {
      next.V_Tongue_Out = Math.max(next.V_Tongue_Out || 0, 0.38);
      next.Mouth_Top_Lip_Up = Math.max(next.Mouth_Top_Lip_Up || 0, 0.16);
      next.Mouth_Bottom_Lip_Bite = Math.min(next.Mouth_Bottom_Lip_Bite || 0, 0.12);
      next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.12), 0.18);
    } else {
      next.Mouth_Bottom_Lip_Bite = Math.max(next.Mouth_Bottom_Lip_Bite || 0, 0.32);
    }
  } else if (currentFamily === "affricate") {
    next.V_Affricate = Math.max(next.V_Affricate || 0, 0.7);
    next.Mouth_Widen = Math.max(next.Mouth_Widen || 0, 0.12);
    next.V_Tongue_Out = Math.min(next.V_Tongue_Out || 0, 0.05);
    next.Mouth_Top_Lip_Up = Math.max(next.Mouth_Top_Lip_Up || 0, 0.08);
  }
  return next;
}

export function buildCueTargets(cue, talkIntensity = 0.5) {
  const phonemeTargets = phonemeToTargets(cue?.phoneme || "");
  const genericTargets = scaleTargets(mapGenericBlendshapesToLenore(cue?.blendshapes || {}), 0.6);
  const duration = Math.max(40, Number(cue?.duration) || 90);
  const durationScale = duration < 70 ? 0.82 : duration > 150 ? 1.06 : 0.94;
  const scale = (0.42 + clamp(talkIntensity, 0, 1) * 0.18) * durationScale;
  return stabilizeMouthTargets(scaleTargets(mergeTargetMaps(genericTargets, phonemeTargets), scale));
}

export function getLipsyncTargetsAtElapsed(lipsyncSequence, elapsedMs, talkIntensity) {
  const seq = Array.isArray(lipsyncSequence?.sequences) ? lipsyncSequence.sequences : [];
  if (!seq.length) return null;

  let index = seq.findIndex((item) => elapsedMs < item.time + item.duration);
  if (index < 0) index = seq.length - 1;
  const current = seq[index];
  if (!current) return null;
  const next = seq[index + 1] || null;
  const prev = seq[index - 1] || null;
  const currentTargets = buildCueTargets(current, talkIntensity);

  const currentEnd = current.time + current.duration;
  const fadeWindow = Math.min(95, Math.max(50, current.duration * 0.42));
  let currentWeight = 1;
  let nextWeight = 0;

  if (elapsedMs < current.time) {
    currentWeight = smoothstep(current.time - fadeWindow, current.time, elapsedMs);
  } else if (elapsedMs > currentEnd - fadeWindow) {
    currentWeight = 1 - smoothstep(currentEnd - fadeWindow, currentEnd, elapsedMs);
  }

  if (next) {
    const nextTargets = buildCueTargets(next, talkIntensity);
    if (elapsedMs >= currentEnd - fadeWindow) {
      nextWeight = smoothstep(currentEnd - fadeWindow, currentEnd + fadeWindow, elapsedMs);
      return tightenConsonantClusters(
        blendTargetMaps(
          scaleTargets(currentTargets, clamp(currentWeight, 0, 1)),
          scaleTargets(nextTargets, clamp(nextWeight, 0, 1)),
          0.5
        ),
        prev,
        current,
        next
      );
    }
  }

  return tightenConsonantClusters(scaleTargets(currentTargets, clamp(currentWeight, 0.25, 1)), prev, current, next);
}

export function buildFallbackTalkingTargets(t, talkIntensity = 0.5, motionState = {}, runtime = {}) {
  const intensity = clamp(talkIntensity, 0, 1);
  const cadence = runtime.motion?.responseClass === "directive" || runtime.motion?.responseClass === "executive" ? 1.85 : 2.2;
  const pulse = (Math.sin(t * cadence * Math.PI * 2) + 1) * 0.5;
  const open = clamp((0.04 + pulse * 0.08) * (0.68 + intensity * 0.12) * (0.86 + (motionState.talkHead || 0) * 0.14), 0, 0.16);
  const part = clamp(open * 0.5, 0, 0.16);
  return stabilizeMouthTargets({
    Mouth_Open: open,
    Mouth_Lips_Part: part,
    Mouth_Lips_Jaw_Adjust: open * 0.16,
    V_Open: open * 0.18
  });
}

export function getMoodTargets(runtime = {}) {
  const responseClass = String(runtime?.motion?.responseClass || "neutral").toLowerCase();
  const idleState = String(runtime?.motion?.idleState || "paused").toLowerCase();
  const empathyMode = String(runtime?.motion?.empathyMode || "").toLowerCase();

  const out = {};

  if (runtime.mood === "happy") {
    Object.assign(out, {
      Mouth_Smile: 0.18,
      Brow_Raise_Outer_Left: 0.08,
      Brow_Raise_Outer_Right: 0.08,
      Cheek_Raise_L: 0.06,
      Cheek_Raise_R: 0.06
    });
  }
  if (runtime.mood === "teasing") {
    Object.assign(out, {
      Mouth_Smile: 0.15,
      Mouth_Widen: 0.08,
      Brow_Raise_Outer_Left: 0.14,
      Brow_Drop_Right: 0.08,
      Eye_Squint_Left: 0.04
    });
  }
  if (runtime.mood === "thinking") {
    Object.assign(out, {
      Brow_Drop_Left: 0.08,
      Brow_Drop_Right: 0.08,
      Mouth_Lips_Tight: 0.11
    });
  }
  if (runtime.mood === "concerned") {
    Object.assign(out, {
      Mouth_Frown: 0.12,
      Brow_Raise_Inner_Left: 0.07,
      Brow_Raise_Inner_Right: 0.07
    });
  }
  if (runtime.mood === "surprised") {
    Object.assign(out, {
      Eye_Wide_Left: 0.05,
      Eye_Wide_Right: 0.05,
      Brow_Raise_Outer_Left: 0.06,
      Brow_Raise_Outer_Right: 0.06
    });
  }

  if (responseClass === "comfort" || empathyMode === "co_regulate" || empathyMode === "warm") {
    Object.assign(out, {
      Mouth_Smile: Math.max(out.Mouth_Smile || 0, 0.08),
      Brow_Raise_Inner_Left: Math.max(out.Brow_Raise_Inner_Left || 0, 0.06),
      Brow_Raise_Inner_Right: Math.max(out.Brow_Raise_Inner_Right || 0, 0.06),
      Cheek_Raise_L: Math.max(out.Cheek_Raise_L || 0, 0.04),
      Cheek_Raise_R: Math.max(out.Cheek_Raise_R || 0, 0.04)
    });
  }
  if (responseClass === "directive" || responseClass === "executive" || empathyMode === "competent") {
    Object.assign(out, {
      Mouth_Lips_Tight: Math.max(out.Mouth_Lips_Tight || 0, 0.1),
      Brow_Drop_Left: Math.max(out.Brow_Drop_Left || 0, 0.06),
      Brow_Drop_Right: Math.max(out.Brow_Drop_Right || 0, 0.06),
      Eye_Wide_Left: Math.min(out.Eye_Wide_Left || 0, 0.02),
      Eye_Wide_Right: Math.min(out.Eye_Wide_Right || 0, 0.02)
    });
  }
  if (responseClass === "question") {
    Object.assign(out, {
      Brow_Raise_Outer_Left: Math.max(out.Brow_Raise_Outer_Left || 0, 0.09),
      Brow_Raise_Outer_Right: Math.max(out.Brow_Raise_Outer_Right || 0, 0.04),
      Mouth_Lips_Part: Math.max(out.Mouth_Lips_Part || 0, 0.05)
    });
  }
  if (idleState === "thinking") {
    Object.assign(out, {
      Eye_Squint_Left: Math.max(out.Eye_Squint_Left || 0, 0.02),
      Eye_Squint_Right: Math.max(out.Eye_Squint_Right || 0, 0.02)
    });
  }
  return out;
}

export function buildIdleFaceTargets(runtime = {}, t = 0) {
  const responseClass = String(runtime.motion?.responseClass || "neutral").toLowerCase();
  const empathyMode = String(runtime.motion?.empathyMode || "").toLowerCase();
  const idleState = String(runtime.motion?.idleState || "paused").toLowerCase();
  const listeningLift = runtime.isListening ? 0.03 : 0;
  const thinkingPinch = idleState === "thinking" ? 0.04 : 0;
  const teaseSquint = responseClass === "teasing" ? 0.04 : 0;
  const reassureSoften = responseClass === "comfort" || empathyMode === "co_regulate" ? 0.025 : 0;
  const executiveControl = responseClass === "executive" || responseClass === "directive" ? 0.04 : 0;
  const thinkingRoll = idleState === "thinking" ? Math.max(0, Math.sin(t * 0.33)) * 0.02 : 0;

  return {
    Brow_Raise_Outer_Left: listeningLift,
    Brow_Raise_Outer_Right: listeningLift * 0.8,
    Brow_Raise_Inner_Left: runtime.isListening ? 0.02 + reassureSoften : reassureSoften,
    Brow_Raise_Inner_Right: runtime.isListening ? 0.02 + reassureSoften : reassureSoften,
    Brow_Drop_Left: thinkingPinch + executiveControl,
    Brow_Drop_Right: thinkingPinch + executiveControl,
    Eye_Squint_Left: teaseSquint + executiveControl * 0.3,
    Eye_Squint_Right: executiveControl * 0.25,
    Cheek_Raise_L: teaseSquint * 0.5 + reassureSoften * 0.6,
    Cheek_Raise_R: reassureSoften * 0.6,
    Mouth_Lips_Part: runtime.isListening ? 0.018 + Math.max(0, Math.sin(t * 0.54)) * 0.012 : 0.01,
    Mouth_Lips_Tight: executiveControl * 0.6 + thinkingRoll,
    Eye_Wide_Left: 0,
    Eye_Wide_Right: 0,
    Eye_Wide_L: 0,
    Eye_Wide_R: 0
  };
}

export function composeLenoreFaceTargets({
  runtime = {},
  t = 0,
  blink = 0,
  cueTargets = null,
  motionState = {}
} = {}) {
  const moodTargets = getMoodTargets(runtime);
  const idleTargets = buildIdleFaceTargets(runtime, t);
  const blinkTargets = buildBlinkTargets(blink);
  const mouthTargets = runtime.isTalking
    ? (cueTargets || buildFallbackTalkingTargets(t, runtime.talkIntensity, motionState, runtime))
    : {};

  return {
    idleTargets,
    moodTargets,
    blinkTargets,
    mouthTargets
  };
}
