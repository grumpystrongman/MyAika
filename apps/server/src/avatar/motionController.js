const DEFAULT_BREATHING = {
  period: 4500,
  amplitude: 0.08,
  offset: 0.0
};

const DEFAULT_BLINKING = {
  interval: { min: 3000, max: 5000 },
  duration: 150,
  frequency: 20
};

const DEFAULT_EYE_DARTS = {
  interval: { min: 5000, max: 8500 },
  duration: 300,
  range: 15,
  frequency: 6
};

const DEFAULT_HEAD_MOTION = {
  idleNoddingInterval: { min: 8000, max: 15000 },
  noddingDuration: 1200,
  noddingAngle: 8,
  tiltProbability: 0.3,
  tiltAngle: 5
};

export class MotionController {
  constructor(characterSpec = {}) {
    this.characterSpec = characterSpec;
    this.breathing = { ...DEFAULT_BREATHING };
    this.blinking = { ...DEFAULT_BLINKING };
    this.eyeDarts = { ...DEFAULT_EYE_DARTS };
    this.headMotion = { ...DEFAULT_HEAD_MOTION };

    this.isActive = false;
    this.startTime = 0;
    this.emotionIntensity = 0.5;

    this.schedules = {
      breathing: null,
      blinking: null,
      eyeDarts: null,
      headMotion: null
    };
  }

  start(currentTime = 0) {
    this.isActive = true;
    this.startTime = currentTime;
    this._scheduleBreathing();
    this._scheduleBlinking();
    this._scheduleEyeDarts();
    this._scheduleHeadMotion();

    return {
      status: "motion_started",
      timestamp: Date.now(),
      breathing: this.breathing,
      blinking: this.blinking,
      eyeDarts: this.eyeDarts,
      headMotion: this.headMotion
    };
  }

  stop() {
    this.isActive = false;
    if (this.schedules.breathing) clearTimeout(this.schedules.breathing);
    if (this.schedules.blinking) clearTimeout(this.schedules.blinking);
    if (this.schedules.eyeDarts) clearTimeout(this.schedules.eyeDarts);
    if (this.schedules.headMotion) clearTimeout(this.schedules.headMotion);

    return {
      status: "motion_stopped",
      timestamp: Date.now()
    };
  }

  _scheduleBreathing() {
    if (!this.isActive) return;

    const nextBreathTime = this.breathing.period * (0.8 + Math.random() * 0.4);
    this.schedules.breathing = setTimeout(() => {
      if (this.isActive) {
        this._scheduleBreathing();
      }
    }, nextBreathTime);
  }

  _scheduleBlinking() {
    if (!this.isActive) return;

    const interval =
      this.blinking.interval.min +
      Math.random() * (this.blinking.interval.max - this.blinking.interval.min);

    this.schedules.blinking = setTimeout(() => {
      if (this.isActive) {
        this._scheduleBlinking();
      }
    }, interval);
  }

  _scheduleEyeDarts() {
    if (!this.isActive) return;

    const interval =
      this.eyeDarts.interval.min +
      Math.random() * (this.eyeDarts.interval.max - this.eyeDarts.interval.min);

    this.schedules.eyeDarts = setTimeout(() => {
      if (this.isActive) {
        this._scheduleEyeDarts();
      }
    }, interval);
  }

  _scheduleHeadMotion() {
    if (!this.isActive) return;

    const interval =
      this.headMotion.idleNoddingInterval.min +
      Math.random() *
        (this.headMotion.idleNoddingInterval.max - this.headMotion.idleNoddingInterval.min);

    this.schedules.headMotion = setTimeout(() => {
      if (this.isActive) {
        this._scheduleHeadMotion();
      }
    }, interval);
  }

  getBreathingFrame(elapsedMs) {
    const phase = (elapsedMs % this.breathing.period) / this.breathing.period;
    const breathAmount = Math.sin(phase * Math.PI * 2) * this.breathing.amplitude;

    return {
      type: "breathing",
      blendshapes: {
        chestRise: Math.max(0, breathAmount * 0.5),
        shoulderRise: Math.max(0, breathAmount * 0.3),
        jawOpen: Math.max(0, breathAmount * 0.2)
      },
      duration: 50,
      timestamp: elapsedMs
    };
  }

  getBlinkingFrame() {
    const startTime = Date.now();
    const blinkSequence = [];

    for (let i = 0; i < this.blinking.frequency; i++) {
      const closeTime = (i * this.blinking.duration) / this.blinking.frequency;
      const openTime = closeTime + this.blinking.duration / 2;

      blinkSequence.push({
        time: startTime + closeTime,
        blendshapes: {
          eyeBlinkLeft: 1.0,
          eyeBlinkRight: 1.0
        },
        duration: this.blinking.duration / this.blinking.frequency / 2
      });

      blinkSequence.push({
        time: startTime + openTime,
        blendshapes: {
          eyeBlinkLeft: 0.0,
          eyeBlinkRight: 0.0
        },
        duration: this.blinking.duration / this.blinking.frequency / 2
      });
    }

    return {
      type: "blinking",
      sequence: blinkSequence,
      totalDuration: this.blinking.duration,
      startTime,
      eyelidClosureSpeed: 0.15
    };
  }

  getEyeDartFrame() {
    const dartTargets = [
      { x: -this.eyeDarts.range, y: 5 },
      { x: this.eyeDarts.range, y: 0 },
      { x: -this.eyeDarts.range * 0.5, y: -8 },
      { x: this.eyeDarts.range * 0.5, y: 3 }
    ];

    const target = dartTargets[Math.floor(Math.random() * dartTargets.length)];
    const startTime = Date.now();

    return {
      type: "eyeDart",
      target,
      duration: this.eyeDarts.duration,
      startTime,
      easingFunction: "easeInOutCubic",
      blendshapes: {
        eyeLookUpLeft: Math.max(0, target.y / 20),
        eyeLookDownLeft: Math.max(0, -target.y / 20),
        eyeLookInLeft: Math.max(0, target.x / this.eyeDarts.range),
        eyeLookOutLeft: Math.max(0, -target.x / this.eyeDarts.range),
        eyeLookUpRight: Math.max(0, target.y / 20),
        eyeLookDownRight: Math.max(0, -target.y / 20),
        eyeLookInRight: Math.max(0, target.x / this.eyeDarts.range),
        eyeLookOutRight: Math.max(0, -target.x / this.eyeDarts.range)
      },
      returnToNeutral: true
    };
  }

  getHeadMotionFrame() {
    const shouldTilt = Math.random() < this.headMotion.tiltProbability;
    const isNodding = Math.random() > 0.5;

    if (isNodding) {
      return {
        type: "headNodding",
        duration: this.headMotion.noddingDuration,
        rotationAxis: "x",
        angle: this.headMotion.noddingAngle,
        oscillations: 1.5,
        damping: 0.8,
        easingFunction: "easeInOutQuad",
        blendshapes: {
          jawForward: 0.1,
          jawLeft: 0,
          jawRight: 0
        }
      };
    } else if (shouldTilt) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      return {
        type: "headTilt",
        duration: this.headMotion.noddingDuration * 0.7,
        rotationAxis: "z",
        angle: this.headMotion.tiltAngle * direction,
        easingFunction: "easeInOutQuad",
        blendshapes: {
          jawLeft: direction > 0 ? 0.05 : 0,
          jawRight: direction < 0 ? 0.05 : 0
        }
      };
    } else {
      return {
        type: "headTurn",
        duration: this.headMotion.noddingDuration * 0.6,
        rotationAxis: "y",
        angle: (Math.random() - 0.5) * 10,
        easingFunction: "easeInOutQuad"
      };
    }
  }

  setEmotionIntensity(intensity) {
    this.emotionIntensity = Math.max(0, Math.min(1, intensity));

    const intensityMultiplier = 0.5 + intensity * 1.5;
    this.breathing.amplitude = DEFAULT_BREATHING.amplitude * intensityMultiplier;

    if (intensity > 0.7) {
      this.blinking.interval = {
        min: DEFAULT_BLINKING.interval.min * 0.6,
        max: DEFAULT_BLINKING.interval.max * 0.6
      };
    } else if (intensity < 0.3) {
      this.blinking.interval = {
        min: DEFAULT_BLINKING.interval.min * 1.3,
        max: DEFAULT_BLINKING.interval.max * 1.3
      };
    }

    return {
      status: "emotion_intensity_updated",
      intensity,
      intensityMultiplier
    };
  }

  applyGestureToMotion(gesture) {
    if (!gesture) return null;

    const gestureMotions = {
      nod: { type: "headNodding", angle: 15, oscillations: 1, duration: 600 },
      shake: { type: "headShake", angle: 20, oscillations: 2.5, duration: 800 },
      tilt_left: { type: "headTilt", angle: 20, duration: 500 },
      tilt_right: { type: "headTilt", angle: -20, duration: 500 },
      look_up: { type: "eyeGaze", target: { x: 0, y: 30 }, duration: 300 },
      look_down: { type: "eyeGaze", target: { x: 0, y: -30 }, duration: 300 },
      look_left: { type: "eyeGaze", target: { x: -40, y: 0 }, duration: 300 },
      look_right: { type: "eyeGaze", target: { x: 40, y: 0 }, duration: 300 }
    };

    return gestureMotions[gesture] || null;
  }

  getMotionFrame(elapsedMs, includeType = false) {
    const frame = {
      breathing: this.getBreathingFrame(elapsedMs),
      timestamp: Date.now(),
      elapsedMs
    };

    if (includeType) {
      frame.availableMotions = ["breathing", "blinking", "eyeDarts", "headMotion"];
    }

    return frame;
  }

  getMotionStatus() {
    return {
      isActive: this.isActive,
      emotionIntensity: this.emotionIntensity,
      breathing: this.breathing,
      blinking: this.blinking,
      eyeDarts: this.eyeDarts,
      headMotion: this.headMotion,
      startTime: this.startTime
    };
  }
}

export function createMotionController(characterSpec) {
  return new MotionController(characterSpec);
}

export function interpolateMotion(motion1, motion2, weight) {
  if (!motion1 || !motion2) return motion1 || motion2;

  const blendshapes = {};
  const allKeys = new Set([
    ...Object.keys(motion1.blendshapes || {}),
    ...Object.keys(motion2.blendshapes || {})
  ]);

  for (const key of allKeys) {
    const v1 = motion1.blendshapes?.[key] || 0;
    const v2 = motion2.blendshapes?.[key] || 0;
    blendshapes[key] = v1 + (v2 - v1) * weight;
  }

  return {
    ...motion1,
    blendshapes,
    interpolated: true
  };
}
