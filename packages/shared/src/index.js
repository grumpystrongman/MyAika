export const Emotion = Object.freeze({
  NEUTRAL: "neutral",
  HAPPY: "happy",
  SHY: "shy",
  SAD: "sad",
  ANGRY: "angry",
  SURPRISED: "surprised",
  SLEEPY: "sleepy"
});

/**
 * Renderer-agnostic behavior packet.
 * Both 2D and 3D bodies interpret this.
 */
export function makeBehavior({ emotion = Emotion.NEUTRAL, intensity = 0.4, speaking = false } = {}) {
  return {
    emotion,
    intensity: clamp01(intensity),
    speaking: Boolean(speaking)
  };
}

function clamp01(n) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, x));
}
