const VISEME_MAP = {
  "p": { blendshapes: { mouthPucker: 0.8, jawOpen: 0.1 }, duration: 100 },
  "b": { blendshapes: { mouthPucker: 0.8, jawOpen: 0.1 }, duration: 100 },
  "m": { blendshapes: { mouthPucker: 0.6, jawOpen: 0.0 }, duration: 100 },
  "f": { blendshapes: { mouthPucker: 0.5, jawOpen: 0.2 }, duration: 100 },
  "v": { blendshapes: { mouthPucker: 0.4, jawOpen: 0.15 }, duration: 100 },
  "th": { blendshapes: { mouthOpen: 0.3, jawOpen: 0.2 }, duration: 120 },
  "d": { blendshapes: { mouthOpen: 0.2, jawOpen: 0.25 }, duration: 80 },
  "t": { blendshapes: { mouthOpen: 0.2, jawOpen: 0.25 }, duration: 80 },
  "n": { blendshapes: { mouthOpen: 0.15, jawOpen: 0.2 }, duration: 90 },
  "s": { blendshapes: { mouthOpen: 0.4, jawOpen: 0.1 }, duration: 100 },
  "z": { blendshapes: { mouthOpen: 0.4, jawOpen: 0.1 }, duration: 100 },
  "sh": { blendshapes: { mouthPucker: 0.3, jawOpen: 0.15 }, duration: 110 },
  "ch": { blendshapes: { mouthOpen: 0.35, jawOpen: 0.25 }, duration: 100 },
  "j": { blendshapes: { mouthOpen: 0.35, jawOpen: 0.2 }, duration: 100 },
  "l": { blendshapes: { mouthOpen: 0.2, jawOpen: 0.2 }, duration: 80 },
  "r": { blendshapes: { mouthPucker: 0.3, jawOpen: 0.15 }, duration: 90 },
  "w": { blendshapes: { mouthPucker: 0.7, jawOpen: 0.1 }, duration: 100 },
  "y": { blendshapes: { mouthOpen: 0.2, jawOpen: 0.15 }, duration: 80 },
  "k": { blendshapes: { mouthOpen: 0.1, jawOpen: 0.2 }, duration: 80 },
  "g": { blendshapes: { mouthOpen: 0.1, jawOpen: 0.2 }, duration: 80 },
  "h": { blendshapes: { mouthOpen: 0.2, jawOpen: 0.3 }, duration: 80 },
  "a": { blendshapes: { mouthOpen: 0.6, jawOpen: 0.5 }, duration: 120 },
  "e": { blendshapes: { mouthSmile: 0.3, mouthOpen: 0.3, jawOpen: 0.2 }, duration: 120 },
  "i": { blendshapes: { mouthSmile: 0.4, mouthOpen: 0.2, jawOpen: 0.1 }, duration: 100 },
  "o": { blendshapes: { mouthPucker: 0.6, jawOpen: 0.4 }, duration: 120 },
  "u": { blendshapes: { mouthPucker: 0.8, jawOpen: 0.3 }, duration: 120 },
  "silence": { blendshapes: {}, duration: 50 }
};

// Performance cache for lipsync sequences (LRU cache with max 500 entries)
const lipsyncCache = new Map();
const MAX_CACHE_SIZE = 500;

function getCacheKey(text, duration) {
  return `${text.trim()}:${duration}`;
}

export function getVisemeForPhoneme(phoneme) {
  const key = String(phoneme || "").toLowerCase().trim();
  
  if (VISEME_MAP[key]) return VISEME_MAP[key];
  
  const singleChar = key.charAt(0);
  if (VISEME_MAP[singleChar]) return VISEME_MAP[singleChar];
  
  return VISEME_MAP.silence;
}

export function textToPhonemes(text) {
  const multiCharPhonemes = [
    ["ght", "t"],
    ["th", "th"],
    ["sh", "sh"],
    ["ch", "ch"],
    ["ng", "ng"],
    ["ph", "f"],
    ["qu", "w"]
  ];

  const processed = String(text || "").toLowerCase();
  const phonemes = [];
  let index = 0;

  while (index < processed.length) {
    let matched = false;
    for (const [pattern, replacement] of multiCharPhonemes) {
      if (processed.startsWith(pattern, index)) {
        if (replacement) phonemes.push(replacement);
        index += pattern.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const char = processed[index];
    if (/[a-z]/.test(char)) {
      phonemes.push(char);
    }
    index += 1;
  }

  return phonemes;
}

export function generateLipsyncSequence(text, audioDurationMs) {
  // Input validation
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new TypeError("text must be a non-empty string");
  }
  
  const duration = Number(audioDurationMs) || 1000;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new TypeError("audioDurationMs must be a positive number");
  }
  
  // Check cache
  const cacheKey = getCacheKey(text, duration);
  if (lipsyncCache.has(cacheKey)) {
    return lipsyncCache.get(cacheKey);
  }
  
  const phonemes = textToPhonemes(text);
  if (phonemes.length === 0) {
    return {
      sequence: [],
      totalDuration: 0,
      phonemeCount: 0,
      estimatedAccuracy: 1.0,
      cached: false
    };
  }
  
  const totalDuration = phonemes.reduce((sum, p) => sum + (getVisemeForPhoneme(p).duration || 80), 0);
  const timePerPhoneme = Math.max(50, duration / Math.max(1, phonemes.length));
  
  const sequence = [];
  let currentTime = 0;
  
  for (const phoneme of phonemes) {
    const viseme = getVisemeForPhoneme(phoneme);
    const phonemeDuration = Math.min(viseme.duration, timePerPhoneme);
    
    sequence.push({
      phoneme,
      viseme: viseme.blendshapes,
      startTime: currentTime,
      duration: phonemeDuration,
      endTime: currentTime + phonemeDuration
    });
    currentTime += phonemeDuration;
  }
  
  const result = {
    sequence,
    totalDuration: currentTime,
    phonemeCount: phonemes.length,
    estimatedAccuracy: Math.min(1.0, duration / totalDuration),
    cached: false
  };
  
  // Cache with LRU eviction
  if (lipsyncCache.size >= MAX_CACHE_SIZE) {
    const firstKey = lipsyncCache.keys().next().value;
    lipsyncCache.delete(firstKey);
  }
  lipsyncCache.set(cacheKey, result);
  
  return result;
}

export function blendVisemes(viseme1, viseme2, weight) {
  const blended = {};
  const allKeys = new Set([...Object.keys(viseme1), ...Object.keys(viseme2)]);
  
  for (const key of allKeys) {
    const v1 = viseme1[key] || 0;
    const v2 = viseme2[key] || 0;
    blended[key] = v1 + (v2 - v1) * weight;
  }
  
  return blended;
}

export function interpolateLipsync(sequence, currentTime) {
  const frame = sequence.sequence.find(s => s.startTime <= currentTime && currentTime < s.endTime);
  const nextFrame = sequence.sequence.find(s => s.startTime > currentTime);
  
  if (!frame) return { blendshapes: {}, confidence: 0 };
  if (!nextFrame) return { blendshapes: frame.viseme, confidence: 1.0 };
  
  const frameWeight = (currentTime - frame.startTime) / (frame.duration || 1);
  const blended = blendVisemes(frame.viseme, nextFrame.viseme, frameWeight);
  
  return {
    blendshapes: blended,
    confidence: Math.min(1.0, (1.0 - frameWeight) * 0.8 + 0.2),
    currentPhoneme: frame.phoneme,
    nextPhoneme: nextFrame?.phoneme || null
  };
}

export function lipsyncFormatForRenderer(sequence, audioPlayer) {
  return {
    sequences: sequence.sequence.map(s => ({
      time: s.startTime,
      duration: s.duration,
      blendshapes: s.viseme,
      phoneme: s.phoneme
    })),
    totalDuration: sequence.totalDuration,
    interpolationMethod: "cubic-bezier",
    fallbackMethod: "nearest"
  };
}

export function validateLipsync(sequence) {
  const issues = [];
  
  if (!sequence.sequence || sequence.sequence.length === 0) {
    issues.push("lip_sync_sequence_empty");
  }
  
  let currentTime = 0;
  for (const frame of sequence.sequence) {
    if (frame.startTime !== currentTime) {
      issues.push(`lip_sync_gap_at_${currentTime}ms`);
    }
    currentTime = frame.endTime;
  }
  
  if (sequence.totalDuration > 0 && sequence.estimatedAccuracy < 0.6) {
    issues.push("lip_sync_timing_mismatch");
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

export function estimatePhonemeAccuracy(audioFeatures, sequence) {
  if (!audioFeatures || !sequence) return 0.5;
  
  const voicingConfidence = audioFeatures.voicingConfidence || 0.5;
  const pitchStability = audioFeatures.pitchStability || 0.6;
  const sequenceConfidence = sequence.estimatedAccuracy || 0.7;
  
  return (voicingConfidence + pitchStability + sequenceConfidence) / 3.0;
}
