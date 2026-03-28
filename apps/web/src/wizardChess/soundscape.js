let sharedAudioContext = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new Ctor();
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

function scheduleTone(ctx, {
  frequency = 440,
  type = "sine",
  start = 0,
  duration = 0.16,
  gain = 0.08,
  attack = 0.01,
  release = 0.06,
  pan = 0
}) {
  const now = ctx.currentTime + Math.max(0, start);
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  const gainNode = ctx.createGain();
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panner) {
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
  }

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(Math.max(0.0001, gain), now + Math.max(0.001, attack));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, duration + release));

  oscillator.connect(gainNode);
  if (panner) {
    gainNode.connect(panner);
    panner.connect(ctx.destination);
  } else {
    gainNode.connect(ctx.destination);
  }

  oscillator.start(now);
  oscillator.stop(now + duration + release + 0.01);
}

const EVENT_PATTERNS = {
  game_start: [
    { frequency: 294, type: "triangle", duration: 0.12, gain: 0.06, pan: -0.15 },
    { frequency: 392, type: "triangle", start: 0.09, duration: 0.16, gain: 0.07, pan: 0.15 },
    { frequency: 523, type: "sine", start: 0.2, duration: 0.2, gain: 0.05 }
  ],
  move: [
    { frequency: 240, type: "triangle", duration: 0.06, gain: 0.045 },
    { frequency: 180, type: "sine", start: 0.04, duration: 0.08, gain: 0.03 }
  ],
  capture: [
    { frequency: 190, type: "sawtooth", duration: 0.08, gain: 0.08, pan: -0.2 },
    { frequency: 135, type: "square", start: 0.05, duration: 0.14, gain: 0.1, pan: 0.25 },
    { frequency: 420, type: "triangle", start: 0.15, duration: 0.09, gain: 0.04 }
  ],
  check: [
    { frequency: 660, type: "square", duration: 0.1, gain: 0.07 },
    { frequency: 494, type: "triangle", start: 0.07, duration: 0.12, gain: 0.06 }
  ],
  promotion: [
    { frequency: 392, type: "triangle", duration: 0.1, gain: 0.07, pan: -0.2 },
    { frequency: 523, type: "triangle", start: 0.08, duration: 0.12, gain: 0.08, pan: 0.18 },
    { frequency: 784, type: "sine", start: 0.22, duration: 0.16, gain: 0.06 }
  ],
  checkmate: [
    { frequency: 196, type: "square", duration: 0.2, gain: 0.09, pan: -0.12 },
    { frequency: 147, type: "square", start: 0.17, duration: 0.24, gain: 0.1, pan: 0.14 },
    { frequency: 110, type: "triangle", start: 0.36, duration: 0.3, gain: 0.12 },
    { frequency: 880, type: "sine", start: 0.46, duration: 0.24, gain: 0.04 }
  ]
};

export function playWizardSound(eventType, { enabled = true, intensity = 0.75 } = {}) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const pattern = EVENT_PATTERNS[eventType] || EVENT_PATTERNS.move;
  const clampedIntensity = Math.max(0.1, Math.min(1.3, Number(intensity) || 0.75));
  for (const tone of pattern) {
    scheduleTone(ctx, {
      ...tone,
      gain: (tone.gain || 0.05) * clampedIntensity
    });
  }
}

export function warmWizardSoundscape() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}
