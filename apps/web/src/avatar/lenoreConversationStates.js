function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function blendObject(from = {}, to = {}, alpha) {
  const out = {};
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of keys) {
    const fromValue = Number(from[key] || 0);
    const toValue = Number(to[key] || 0);
    out[key] = lerp(fromValue, toValue, alpha);
  }
  return out;
}

const BASE_STATE_POSES = {
  paused: {
    root: { y: 0.01, x: 0.001, rotX: 0.004, rotY: 0.006 },
    hips: { y: 0.006 },
    neck: { x: -0.008, y: 0.006 },
    head: { x: 0.012, y: 0.006, z: 0.008 },
    leftShoulder: { x: -0.04, y: 0.01, z: -0.08 },
    rightShoulder: { x: -0.04, y: -0.01, z: 0.08 },
    leftArm: { x: -1.02, y: 0.08, z: -0.14 },
    rightArm: { x: -1.02, y: -0.08, z: 0.14 },
    leftForeArm: { x: 0.34, y: 0.02, z: 0.02 },
    rightForeArm: { x: 0.34, y: -0.02, z: -0.02 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 }
  },
  ready: {
    root: { y: 0.01, x: 0, rotX: 0.004, rotY: 0.004 },
    hips: { y: 0.006 },
    neck: { x: -0.006, y: 0.006 },
    head: { x: 0.01, y: 0.006, z: 0.004 },
    leftShoulder: { x: -0.035, y: 0.01, z: -0.075 },
    rightShoulder: { x: -0.035, y: -0.01, z: 0.075 },
    leftArm: { x: -0.98, y: 0.08, z: -0.12 },
    rightArm: { x: -0.98, y: -0.08, z: 0.12 },
    leftForeArm: { x: 0.32, y: 0.02, z: 0.02 },
    rightForeArm: { x: 0.32, y: -0.02, z: -0.02 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 }
  },
  listening: {
    root: { y: 0.012, x: 0.004, rotX: 0.006, rotY: 0.01 },
    hips: { y: 0.008 },
    neck: { x: 0.008, y: 0.012 },
    head: { x: 0.02, y: 0.012, z: 0.01 },
    leftShoulder: { x: -0.03, y: 0.012, z: -0.06 },
    rightShoulder: { x: -0.03, y: -0.012, z: 0.06 },
    leftArm: { x: -0.92, y: 0.06, z: -0.1 },
    rightArm: { x: -0.92, y: -0.06, z: 0.1 },
    leftForeArm: { x: 0.28, y: 0.02, z: 0.015 },
    rightForeArm: { x: 0.28, y: -0.02, z: -0.015 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 }
  },
  thinking: {
    root: { y: 0.01, x: -0.003, rotX: 0.006, rotY: -0.008 },
    hips: { y: 0.004 },
    neck: { x: -0.012, y: -0.006 },
    head: { x: 0.01, y: -0.01, z: 0.012 },
    leftShoulder: { x: -0.035, y: 0.01, z: -0.06 },
    rightShoulder: { x: -0.035, y: -0.01, z: 0.06 },
    leftArm: { x: -0.94, y: 0.07, z: -0.11 },
    rightArm: { x: -0.94, y: -0.07, z: 0.11 },
    leftForeArm: { x: 0.3, y: 0.02, z: 0.015 },
    rightForeArm: { x: 0.3, y: -0.02, z: -0.015 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 }
  },
  speaking: {
    root: { y: 0.012, x: 0.003, rotX: 0.008, rotY: 0.01 },
    hips: { y: 0.008 },
    neck: { x: 0.003, y: 0.01 },
    head: { x: 0.016, y: 0.012, z: 0.006 },
    leftShoulder: { x: -0.025, y: 0.01, z: -0.05 },
    rightShoulder: { x: -0.025, y: -0.01, z: 0.05 },
    leftArm: { x: -0.88, y: 0.06, z: -0.1 },
    rightArm: { x: -0.88, y: -0.06, z: 0.1 },
    leftForeArm: { x: 0.3, y: 0.02, z: 0.02 },
    rightForeArm: { x: 0.3, y: -0.02, z: -0.02 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 }
  }
};

const RESPONSE_OVERLAYS = {
  neutral: {},
  comfort: {
    neck: { x: 0.006 },
    head: { x: 0.012, z: 0.008 },
    leftShoulder: { z: -0.008 },
    rightShoulder: { z: 0.008 }
  },
  teasing: {
    head: { y: 0.01, z: 0.018 },
    leftShoulder: { z: 0.01 },
    rightShoulder: { z: -0.01 }
  },
  playful: {
    head: { x: 0.006, y: 0.012 },
    leftShoulder: { z: 0.008 },
    rightShoulder: { z: -0.008 }
  },
  surprised: {
    head: { x: 0.01, y: 0.014 },
    neck: { x: 0.006 },
    leftShoulder: { x: 0.004 },
    rightShoulder: { x: 0.004 }
  },
  reflective: {
    head: { y: -0.012, z: 0.008 },
    neck: { x: -0.01, y: -0.01 }
  },
  question: {
    head: { y: 0.008, z: 0.012 },
    neck: { y: 0.008 }
  },
  directive: {
    head: { z: -0.004 },
    leftShoulder: { z: -0.012 },
    rightShoulder: { z: 0.012 }
  },
  executive: {
    head: { z: -0.004 },
    leftShoulder: { z: -0.014 },
    rightShoulder: { z: 0.014 },
    leftArm: { x: 0.012 },
    rightArm: { x: 0.012 }
  }
};

const CHOREO_OVERLAYS = {
  quiet_poise: {
    root: { y: 0.002 },
    leftShoulder: { z: -0.004 },
    rightShoulder: { z: 0.004 }
  },
  command_presence: {
    root: { rotY: -0.004 },
    head: { z: -0.004 },
    leftShoulder: { z: -0.01 },
    rightShoulder: { z: 0.01 }
  },
  soft_reassure: {
    root: { x: 0.004 },
    head: { x: 0.008, z: 0.008 },
    leftShoulder: { z: -0.006 },
    rightShoulder: { z: 0.006 }
  }
};

function applyOverlay(base, overlay = {}, scale = 1) {
  const next = {};
  const parts = new Set([...Object.keys(base || {}), ...Object.keys(overlay || {})]);
  for (const part of parts) {
    next[part] = { ...(base?.[part] || {}) };
    for (const [key, value] of Object.entries(overlay?.[part] || {})) {
      next[part][key] = Number(next[part][key] || 0) + Number(value || 0) * scale;
    }
  }
  return next;
}

function addRhythm(target, rhythm = {}) {
  const next = {};
  for (const [part, values] of Object.entries(target || {})) {
    next[part] = { ...values };
    for (const [key, value] of Object.entries(rhythm?.[part] || {})) {
      next[part][key] = Number(next[part][key] || 0) + Number(value || 0);
    }
  }
  return next;
}

export function resolveLenoreConversationState(runtime = {}) {
  if (runtime.isTalking) return "speaking";
  if (runtime.isListening) return "listening";
  const idleState = String(runtime.motion?.idleState || "paused").toLowerCase();
  return ["paused", "ready", "listening", "thinking", "speaking"].includes(idleState) ? idleState : "paused";
}

function buildStateRhythm(stateName, t, intensity) {
  const breath = (Math.sin(t * 1.06) + 1) * 0.5;
  const drift = Math.sin(t * 0.58);
  const nod = Math.sin(t * 1.32);
  const scale = 0.65 + intensity * 0.35;

  switch (stateName) {
    case "paused":
      return {
        root: { y: breath * 0.014 * scale, x: drift * 0.003 * scale, rotY: drift * 0.006 * scale },
        head: { x: drift * 0.012 * scale, y: Math.sin(t * 0.44) * 0.014 * scale, z: Math.sin(t * 0.36) * 0.009 * scale },
        leftShoulder: { x: breath * 0.006 * scale, z: drift * 0.01 * scale },
        rightShoulder: { x: breath * 0.006 * scale, z: -drift * 0.01 * scale }
      };
    case "ready":
      return {
        root: { y: breath * 0.012 * scale, rotY: drift * 0.004 * scale },
        head: { x: drift * 0.009 * scale, y: Math.sin(t * 0.54) * 0.01 * scale },
        leftShoulder: { x: breath * 0.004 * scale },
        rightShoulder: { x: breath * 0.004 * scale }
      };
    case "listening":
      return {
        root: { y: breath * 0.012 * scale, x: Math.sin(t * 0.84) * 0.004 * scale, rotY: drift * 0.008 * scale },
        head: { x: 0.006 + nod * 0.012 * scale, y: Math.sin(t * 0.88) * 0.012 * scale, z: Math.sin(t * 0.4) * 0.006 * scale },
        neck: { y: Math.sin(t * 0.74) * 0.008 * scale },
        leftShoulder: { y: 0.004 * scale, x: breath * 0.005 * scale },
        rightShoulder: { y: -0.004 * scale, x: breath * 0.005 * scale }
      };
    case "thinking":
      return {
        root: { y: breath * 0.01 * scale, x: drift * 0.002 * scale, rotY: -drift * 0.006 * scale },
        head: { x: Math.sin(t * 0.42) * 0.008 * scale, y: -Math.abs(Math.sin(t * 0.5)) * 0.012 * scale, z: Math.sin(t * 0.52) * 0.01 * scale },
        neck: { x: -0.004 * scale, y: -Math.sin(t * 0.32) * 0.006 * scale }
      };
    case "speaking":
      return {
        root: { y: breath * 0.016 * scale, x: drift * 0.005 * scale, rotY: Math.sin(t * 0.9) * 0.012 * scale },
        head: { x: nod * 0.014 * scale, y: Math.sin(t * 1.5) * 0.014 * scale, z: Math.sin(t * 0.66) * 0.008 * scale },
        neck: { y: Math.sin(t * 1.12) * 0.01 * scale },
        leftShoulder: { x: breath * 0.008 * scale, z: Math.sin(t * 1.2) * 0.012 * scale },
        rightShoulder: { x: breath * 0.008 * scale, z: -Math.sin(t * 1.2) * 0.012 * scale },
        leftArm: { x: Math.sin(t * 1.16) * 0.012 * scale },
        rightArm: { x: -Math.sin(t * 1.16) * 0.012 * scale },
        leftForeArm: { x: Math.sin(t * 1.42) * 0.008 * scale },
        rightForeArm: { x: -Math.sin(t * 1.42) * 0.008 * scale }
      };
    default:
      return {};
  }
}

export function computeLenoreConversationPose(runtime = {}, motionState = {}, t = 0) {
  const stateName = resolveLenoreConversationState(runtime);
  const responseClass = String(runtime.motion?.responseClass || "neutral").toLowerCase();
  const choreographyPreset = String(runtime.motion?.choreographyPreset || "quiet_poise").toLowerCase();
  const intensity = clamp(Number(runtime.motion?.motionIntensity ?? motionState.motionIntensity ?? 0.45), 0, 1.5);
  const cameraFrame = String(runtime.appearance?.cameraFrame || "bust").toLowerCase();

  let pose = BASE_STATE_POSES[stateName] || BASE_STATE_POSES.paused;
  pose = applyOverlay(pose, RESPONSE_OVERLAYS[responseClass] || {}, 0.78);
  pose = applyOverlay(pose, CHOREO_OVERLAYS[choreographyPreset] || CHOREO_OVERLAYS.quiet_poise, 0.82);
  pose = addRhythm(pose, buildStateRhythm(stateName, t, intensity));
  if (cameraFrame === "portrait" || cameraFrame === "bust") {
    pose = applyOverlay(pose, {
      leftShoulder: { x: -0.01, z: -0.02 },
      rightShoulder: { x: -0.01, z: 0.02 },
      leftArm: { x: -0.06, y: 0.02, z: -0.03 },
      rightArm: { x: -0.06, y: -0.02, z: 0.03 },
      leftForeArm: { x: -0.08, y: -0.02, z: -0.02 },
      rightForeArm: { x: -0.08, y: 0.02, z: 0.02 },
      leftHand: { x: 0, y: 0, z: 0 },
      rightHand: { x: 0, y: 0, z: 0 }
    }, 1);
  }

  return {
    stateName,
    pose
  };
}

export function blendLenoreConversationPose(previousPose = null, nextPose, alpha = 1) {
  if (!previousPose) return nextPose;
  const out = {};
  const parts = new Set([...Object.keys(previousPose || {}), ...Object.keys(nextPose || {})]);
  for (const part of parts) {
    out[part] = blendObject(previousPose?.[part] || {}, nextPose?.[part] || {}, alpha);
  }
  return out;
}

export function getLenoreTransitionAlpha(dt = 0.016, stateName = "paused") {
  const speedMap = {
    paused: 5.2,
    ready: 5.8,
    listening: 7.2,
    thinking: 4.8,
    speaking: 8.8
  };
  const speed = speedMap[stateName] || 6;
  return 1 - Math.exp(-Math.max(dt, 0.001) * speed);
}
