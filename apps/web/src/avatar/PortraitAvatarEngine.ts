import type { AvatarEngine, AvatarLipsyncSequence, Mood } from "./AvatarEngine";

type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Layout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type VariantKey =
  | "blink"
  | "browLift"
  | "browKnit"
  | "frontHair"
  | "eyeGloss"
  | "jawShadow"
  | "makeupWarm"
  | "makeupConcerned"
  | "makeupSurprised"
  | "makeupTeasing"
  | "cheekWarm"
  | "cheekConcerned"
  | "cheekTeasing"
  | "mouthSoft"
  | "mouthMedium"
  | "mouthWide"
  | "mouthRound"
  | "mouthClosedPress"
  | "mouthLipBite"
  | "mouthEe"
  | "mouthAh"
  | "mouthOh"
  | "mouthSibilant"
  | "mouthTongue";

type FeatureClip = "ellipse" | "rect";

type ConversationState = "idle" | "listening" | "thinking" | "answering" | "interrupt";

type ConversationMotionProfile = {
  state: ConversationState;
  breathAmplitude: number;
  portraitScaleBoost: number;
  gazeXScale: number;
  gazeYScale: number;
  gazeYOffset: number;
  browLiftBoost: number;
  browKnitBoost: number;
  glossBoost: number;
  jawBoost: number;
  backdropBoost: number;
  haloAlpha: number;
  hairOverlayBoost: number;
  eyeLayerBoost: number;
  mouthLayerBoost: number;
};

export type PortraitAvatarConfig = {
  imageUrl: string;
  skinTint?: string;
  shadowTint?: string;
  lipTint?: string;
  variants?: {
    blink?: string;
    browLift?: string;
    browKnit?: string;
    frontHair?: string;
    eyeGloss?: string;
    jawShadow?: string;
    makeupWarm?: string;
    makeupConcerned?: string;
    makeupSurprised?: string;
    makeupTeasing?: string;
    cheekWarm?: string;
    cheekConcerned?: string;
    cheekTeasing?: string;
    mouthSoft?: string;
    mouthMedium?: string;
    mouthWide?: string;
    mouthRound?: string;
    mouthClosedPress?: string;
    mouthLipBite?: string;
    mouthEe?: string;
    mouthAh?: string;
    mouthOh?: string;
    mouthSibilant?: string;
    mouthTongue?: string;
  };
  frame?: {
    scale?: number;
    offsetX?: number;
    offsetY?: number;
  };
  layers?: {
    faceCore?: string;
    eyeCore?: string;
    irisCore?: string;
    lidSoft?: string;
    mouthCore?: string;
    hairShell?: string;
    fringeVeil?: string;
  };
  anchors: {
    leftBrow?: Region;
    rightBrow?: Region;
    leftEye: Region;
    rightEye: Region;
    mouth: Region;
    face?: Region;
  };
};

const DEFAULT_CONFIG: PortraitAvatarConfig = {
  imageUrl: "/assets/aika/portraits/nocturne-human/base.png",
  skinTint: "rgba(229, 203, 195, 0.92)",
  shadowTint: "rgba(35, 20, 25, 0.58)",
  lipTint: "rgba(137, 22, 44, 0.9)",
  variants: {
    blink: "/assets/aika/portraits/nocturne-human/blink.png",
    browLift: "/assets/aika/portraits/nocturne-human/brow-lift.png",
    browKnit: "/assets/aika/portraits/nocturne-human/brow-knit.png",
    frontHair: "/assets/aika/portraits/nocturne-human/front-hair.png",
    eyeGloss: "/assets/aika/portraits/nocturne-human/eye-gloss.png",
    jawShadow: "/assets/aika/portraits/nocturne-human/jaw-shadow.png",
    makeupWarm: "/assets/aika/portraits/nocturne-human/makeup-warm.png",
    makeupConcerned: "/assets/aika/portraits/nocturne-human/makeup-concerned.png",
    makeupSurprised: "/assets/aika/portraits/nocturne-human/makeup-surprised.png",
    makeupTeasing: "/assets/aika/portraits/nocturne-human/makeup-teasing.png",
    cheekWarm: "/assets/aika/portraits/nocturne-human/cheek-warm.png",
    cheekConcerned: "/assets/aika/portraits/nocturne-human/cheek-concerned.png",
    cheekTeasing: "/assets/aika/portraits/nocturne-human/cheek-teasing.png",
    mouthSoft: "/assets/aika/portraits/nocturne-human/mouth-open-soft.png",
    mouthMedium: "/assets/aika/portraits/nocturne-human/mouth-open-medium.png",
    mouthWide: "/assets/aika/portraits/nocturne-human/mouth-open-wide.png",
    mouthRound: "/assets/aika/portraits/nocturne-human/mouth-round.png",
    mouthClosedPress: "/assets/aika/portraits/nocturne-human/mouth-closed-press.png",
    mouthLipBite: "/assets/aika/portraits/nocturne-human/mouth-lip-bite.png",
    mouthEe: "/assets/aika/portraits/nocturne-human/mouth-ee.png",
    mouthAh: "/assets/aika/portraits/nocturne-human/mouth-ah.png",
    mouthOh: "/assets/aika/portraits/nocturne-human/mouth-oh.png",
    mouthSibilant: "/assets/aika/portraits/nocturne-human/mouth-sibilant.png",
    mouthTongue: "/assets/aika/portraits/nocturne-human/mouth-tongue.png"
  },
  frame: {
    scale: 0.96,
    offsetX: 0,
    offsetY: 0.02
  },
  layers: {
    faceCore: "/assets/aika/portraits/nocturne-human/layer-face-core.png",
    eyeCore: "/assets/aika/portraits/nocturne-human/layer-eye-core.png",
    irisCore: "/assets/aika/portraits/nocturne-human/layer-iris-core.png",
    lidSoft: "/assets/aika/portraits/nocturne-human/layer-lid-soft.png",
    mouthCore: "/assets/aika/portraits/nocturne-human/layer-mouth-core.png",
    hairShell: "/assets/aika/portraits/nocturne-human/layer-hair-shell.png",
    fringeVeil: "/assets/aika/portraits/nocturne-human/layer-fringe-veil.png"
  },
  anchors: {
    leftBrow: { x: 0.286, y: 0.158, w: 0.142, h: 0.046 },
    rightBrow: { x: 0.542, y: 0.158, w: 0.142, h: 0.046 },
    leftEye: { x: 0.294, y: 0.214, w: 0.126, h: 0.05 },
    rightEye: { x: 0.55, y: 0.214, w: 0.126, h: 0.05 },
    mouth: { x: 0.424, y: 0.318, w: 0.154, h: 0.072 },
    face: { x: 0.235, y: 0.098, w: 0.53, h: 0.43 }
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export class PortraitAvatarEngine implements AvatarEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private config: PortraitAvatarConfig;
  private image: HTMLImageElement | null = null;
  private layerImages: Record<"faceCore" | "eyeCore" | "irisCore" | "lidSoft" | "mouthCore" | "hairShell" | "fringeVeil", HTMLImageElement | null> = {
    faceCore: null,
    eyeCore: null,
    irisCore: null,
    lidSoft: null,
    mouthCore: null,
    hairShell: null,
    fringeVeil: null
  };
  private variantImages: Record<VariantKey, HTMLImageElement | null> = {
    blink: null,
    browLift: null,
    browKnit: null,
    frontHair: null,
    eyeGloss: null,
    jawShadow: null,
    makeupWarm: null,
    makeupConcerned: null,
    makeupSurprised: null,
    makeupTeasing: null,
    cheekWarm: null,
    cheekConcerned: null,
    cheekTeasing: null,
    mouthSoft: null,
    mouthMedium: null,
    mouthWide: null,
    mouthRound: null,
    mouthClosedPress: null,
    mouthLipBite: null,
    mouthEe: null,
    mouthAh: null,
    mouthOh: null,
    mouthSibilant: null,
    mouthTongue: null
  };
  private mood: Mood = "neutral";
  private isTalking = false;
  private talkIntensity = 0.45;
  private isListening = false;
  private idleEnabled = true;
  private frameId: number | null = null;
  private nextBlinkAt = 0;
  private blinkAmount = 0;
  private nextShiftAt = 0;
  private shiftX = 0;
  private shiftY = 0;
  private targetShiftX = 0;
  private targetShiftY = 0;
  private speechOpen = 0;
  private speechTargetOpen = 0;
  private speechRoundness = 0;
  private speechTargetRoundness = 0;
  private nextSpeechBeatAt = 0;
  private speechPulseSeed = Math.random() * 1000;
  private lipsyncSequence: AvatarLipsyncSequence | null = null;
  private lipsyncStartedAt = 0;
  private idleSeed = Math.random() * 1000;
  private lastFrameAt = 0;
  private moodFx = {
    makeupWarm: 0,
    makeupConcerned: 0,
    makeupSurprised: 0,
    makeupTeasing: 0,
    cheekWarm: 0,
    cheekConcerned: 0,
    cheekTeasing: 0
  };
  private conversationState: ConversationState = "idle";
  private interruptUntilMs = 0;
  private conversationFx = {
    idle: 1,
    listening: 0,
    thinking: 0,
    answering: 0,
    interrupt: 0
  };

  constructor(canvas: HTMLCanvasElement, config?: Partial<PortraitAvatarConfig>) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_context_unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      variants: {
        ...DEFAULT_CONFIG.variants,
        ...(config?.variants || {})
      },
      frame: {
        ...DEFAULT_CONFIG.frame,
        ...(config?.frame || {})
      },
      layers: {
        ...DEFAULT_CONFIG.layers,
        ...(config?.layers || {})
      },
      anchors: {
        ...DEFAULT_CONFIG.anchors,
        ...(config?.anchors || {})
      }
    };
    this.resize(canvas.clientWidth || 320, canvas.clientHeight || 480);
  }

  async load(modelUrl: string): Promise<void> {
    if (modelUrl && modelUrl.toLowerCase().endsWith(".json")) {
      const res = await fetch(modelUrl);
      if (!res.ok) throw new Error("portrait_config_load_failed");
      const remoteConfig = await res.json();
      this.config = {
        ...this.config,
        ...remoteConfig,
        variants: {
          ...this.config.variants,
          ...(remoteConfig.variants || {})
        },
        frame: {
          ...this.config.frame,
          ...(remoteConfig.frame || {})
        },
        layers: {
          ...this.config.layers,
          ...(remoteConfig.layers || {})
        },
        anchors: {
          ...this.config.anchors,
          ...(remoteConfig.anchors || {})
        }
      };
    } else if (modelUrl) {
      this.config = {
        ...this.config,
        imageUrl: modelUrl
      };
    }

    const [
      baseImage,
      blinkImage,
      browLiftImage,
      browKnitImage,
      frontHairImage,
      eyeGlossImage,
      jawShadowImage,
      makeupWarmImage,
      makeupConcernedImage,
      makeupSurprisedImage,
      makeupTeasingImage,
      cheekWarmImage,
      cheekConcernedImage,
      cheekTeasingImage,
      faceCoreImage,
      eyeCoreImage,
      irisCoreImage,
      lidSoftImage,
      mouthCoreImage,
      hairShellImage,
      fringeVeilImage,
      mouthSoftImage,
      mouthMediumImage,
      mouthWideImage,
      mouthRoundImage,
      mouthClosedPressImage,
      mouthLipBiteImage,
      mouthEeImage,
      mouthAhImage,
      mouthOhImage,
      mouthSibilantImage,
      mouthTongueImage
    ] = await Promise.all([
      this.preloadImage(this.config.imageUrl),
      this.preloadOptionalImage(this.config.variants?.blink),
      this.preloadOptionalImage(this.config.variants?.browLift),
      this.preloadOptionalImage(this.config.variants?.browKnit),
      this.preloadOptionalImage(this.config.variants?.frontHair),
      this.preloadOptionalImage(this.config.variants?.eyeGloss),
      this.preloadOptionalImage(this.config.variants?.jawShadow),
      this.preloadOptionalImage(this.config.variants?.makeupWarm),
      this.preloadOptionalImage(this.config.variants?.makeupConcerned),
      this.preloadOptionalImage(this.config.variants?.makeupSurprised),
      this.preloadOptionalImage(this.config.variants?.makeupTeasing),
      this.preloadOptionalImage(this.config.variants?.cheekWarm),
      this.preloadOptionalImage(this.config.variants?.cheekConcerned),
      this.preloadOptionalImage(this.config.variants?.cheekTeasing),
      this.preloadOptionalImage(this.config.layers?.faceCore),
      this.preloadOptionalImage(this.config.layers?.eyeCore),
      this.preloadOptionalImage(this.config.layers?.irisCore),
      this.preloadOptionalImage(this.config.layers?.lidSoft),
      this.preloadOptionalImage(this.config.layers?.mouthCore),
      this.preloadOptionalImage(this.config.layers?.hairShell),
      this.preloadOptionalImage(this.config.layers?.fringeVeil),
      this.preloadOptionalImage(this.config.variants?.mouthSoft),
      this.preloadOptionalImage(this.config.variants?.mouthMedium),
      this.preloadOptionalImage(this.config.variants?.mouthWide),
      this.preloadOptionalImage(this.config.variants?.mouthRound),
      this.preloadOptionalImage(this.config.variants?.mouthClosedPress),
      this.preloadOptionalImage(this.config.variants?.mouthLipBite),
      this.preloadOptionalImage(this.config.variants?.mouthEe),
      this.preloadOptionalImage(this.config.variants?.mouthAh),
      this.preloadOptionalImage(this.config.variants?.mouthOh),
      this.preloadOptionalImage(this.config.variants?.mouthSibilant),
      this.preloadOptionalImage(this.config.variants?.mouthTongue)
    ]);
    this.image = baseImage;
    this.layerImages = {
      faceCore: faceCoreImage,
      eyeCore: eyeCoreImage,
      irisCore: null,
      lidSoft: null,
      mouthCore: mouthCoreImage,
      hairShell: hairShellImage,
      fringeVeil: fringeVeilImage
    };
    this.variantImages = {
      blink: null,
      browLift: browLiftImage,
      browKnit: browKnitImage,
      frontHair: frontHairImage,
      eyeGloss: eyeGlossImage,
      jawShadow: jawShadowImage,
      makeupWarm: makeupWarmImage,
      makeupConcerned: makeupConcernedImage,
      makeupSurprised: makeupSurprisedImage,
      makeupTeasing: makeupTeasingImage,
      cheekWarm: cheekWarmImage,
      cheekConcerned: cheekConcernedImage,
      cheekTeasing: cheekTeasingImage,
      mouthSoft: mouthSoftImage,
      mouthMedium: mouthMediumImage,
      mouthWide: mouthWideImage,
      mouthRound: mouthRoundImage,
      mouthClosedPress: mouthClosedPressImage,
      mouthLipBite: mouthLipBiteImage,
      mouthEe: mouthEeImage,
      mouthAh: mouthAhImage,
      mouthOh: mouthOhImage,
      mouthSibilant: mouthSibilantImage,
      mouthTongue: mouthTongueImage
    };
    this.startLoop();
  }

  setMood(mood: Mood): void {
    this.mood = mood;
  }

  setTalking(isTalking: boolean, intensity = 0.45): void {
    const wasTalking = this.isTalking;
    if (wasTalking && !isTalking) {
      const abruptStop =
        this.speechOpen > 0.12 ||
        this.speechTargetOpen > 0.12 ||
        this.talkIntensity > 0.28 ||
        Boolean(this.lipsyncSequence);
      if (abruptStop) {
        this.interruptUntilMs = performance.now() + 420;
      }
    }
    if (!wasTalking && isTalking) {
      this.interruptUntilMs = 0;
    }
    this.isTalking = isTalking;
    this.talkIntensity = clamp(intensity, 0, 1);
  }

  setLipSyncSequence(sequence: AvatarLipsyncSequence | null, startedAtMs = 0): void {
    this.lipsyncSequence = sequence;
    this.lipsyncStartedAt = sequence && startedAtMs > 0 ? startedAtMs : 0;
  }

  setListening(isListening: boolean): void {
    this.isListening = isListening;
  }

  setIdle(enabled: boolean): void {
    this.idleEnabled = enabled;
    if (enabled) this.startLoop();
    else this.stopLoop();
  }

  resize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = nextWidth * this.dpr;
    this.canvas.height = nextHeight * this.dpr;
    this.canvas.style.width = `${nextWidth}px`;
    this.canvas.style.height = `${nextHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = nextWidth;
    this.height = nextHeight;
    this.draw(performance.now());
  }

  destroy(): void {
    this.stopLoop();
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  private preloadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("portrait_image_load_failed"));
      img.src = src;
    });
  }

  private async preloadOptionalImage(src?: string): Promise<HTMLImageElement | null> {
    if (!src) return null;
    try {
      return await this.preloadImage(src);
    } catch {
      return null;
    }
  }

  private startLoop() {
    if (this.frameId !== null) return;
    const loop = (timestamp: number) => {
      this.draw(timestamp);
      this.frameId = window.requestAnimationFrame(loop);
    };
    this.frameId = window.requestAnimationFrame(loop);
  }

  private stopLoop() {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private updateMicroMotion(t: number) {
    if (this.nextBlinkAt <= t) {
      this.nextBlinkAt = t + 2.4 + Math.random() * 3.3;
    }

    const blinkPhase = this.nextBlinkAt - t;
    if (blinkPhase < 0.16) {
      this.blinkAmount = clamp(1 - Math.abs(blinkPhase - 0.08) / 0.08, 0, 1);
    } else {
      this.blinkAmount = 0;
    }

    if (this.nextShiftAt <= t) {
      this.nextShiftAt = t + 1.4 + Math.random() * 2.2;
      const rangeX =
        0.018 +
        this.conversationFx.listening * 0.009 +
        this.conversationFx.thinking * 0.005 +
        this.conversationFx.interrupt * 0.006;
      const rangeY =
        0.012 +
        this.conversationFx.listening * 0.006 +
        this.conversationFx.thinking * 0.006 +
        this.conversationFx.interrupt * 0.004;
      this.targetShiftX = (Math.random() * 2 - 1) * rangeX;
      this.targetShiftY = (Math.random() * 2 - 1) * rangeY;
    }

    const easeX = 0.08 + this.conversationFx.listening * 0.022 + this.conversationFx.interrupt * 0.024;
    const easeY = 0.085 + this.conversationFx.thinking * 0.02 + this.conversationFx.interrupt * 0.026;
    this.shiftX += (this.targetShiftX - this.shiftX) * easeX;
    this.shiftY += (this.targetShiftY - this.shiftY) * easeY;
  }

  private updateSpeechMotion(t: number, moodBias: number) {
    if (!this.isTalking) {
      this.speechTargetOpen = Math.max(0, moodBias * 0.2);
      this.speechTargetRoundness = 0;
      this.speechOpen += (this.speechTargetOpen - this.speechOpen) * 0.18;
      this.speechRoundness += (this.speechTargetRoundness - this.speechRoundness) * 0.14;
      return;
    }

    if (this.nextSpeechBeatAt <= t) {
      const cadence = 0.12 + (1 - this.talkIntensity) * 0.08 + Math.random() * 0.09;
      this.nextSpeechBeatAt = t + cadence;
      const syllablePulse = 0.18 + this.talkIntensity * 0.5 + Math.random() * 0.18;
      const pauseChance = 0.14 - this.talkIntensity * 0.05;
      this.speechTargetOpen = Math.random() < pauseChance ? 0.04 : syllablePulse;
      const vowelSelector = (Math.sin(t * 1.9 + this.speechPulseSeed) + Math.random() * 0.7) * 0.5 + 0.5;
      this.speechTargetRoundness = clamp(vowelSelector > 0.72 ? 0.72 + this.talkIntensity * 0.12 : vowelSelector * 0.38, 0, 1);
    }

    const openEase = this.speechTargetOpen > this.speechOpen ? 0.34 : 0.18;
    const roundEase = this.speechTargetRoundness > this.speechRoundness ? 0.22 : 0.12;
    this.speechOpen += (this.speechTargetOpen - this.speechOpen) * openEase;
    this.speechRoundness += (this.speechTargetRoundness - this.speechRoundness) * roundEase;
    this.speechOpen = clamp(this.speechOpen + Math.max(0, moodBias) * 0.04, 0, 0.88);
    this.speechRoundness = clamp(this.speechRoundness, 0, 1);
  }

  private getMoodState() {
    switch (this.mood) {
      case "happy":
        return { warmth: 0.14, mouthBias: 0.05, eyeBias: 0.04, browBias: -0.04 };
      case "teasing":
        return { warmth: 0.08, mouthBias: 0.06, eyeBias: 0.03, browBias: -0.02 };
      case "thinking":
        return { warmth: -0.02, mouthBias: -0.02, eyeBias: -0.03, browBias: 0.02 };
      case "concerned":
        return { warmth: -0.08, mouthBias: -0.04, eyeBias: -0.06, browBias: 0.05 };
      case "surprised":
        return { warmth: 0.02, mouthBias: 0.1, eyeBias: 0.1, browBias: -0.08 };
      default:
        return { warmth: 0, mouthBias: 0, eyeBias: 0, browBias: 0 };
    }
  }

  private getLayout(): Layout {
    if (!this.image) {
      return { x: 0, y: 0, width: this.width, height: this.height };
    }
    const imgAspect = this.image.width / this.image.height;
    const canvasAspect = this.width / this.height;
    let drawWidth = this.width;
    let drawHeight = this.height;

    if (imgAspect > canvasAspect) {
      drawHeight = this.height * 0.98;
      drawWidth = drawHeight * imgAspect;
    } else {
      drawWidth = this.width * 0.92;
      drawHeight = drawWidth / imgAspect;
    }

    const frameScale = this.config.frame?.scale || 1;
    drawWidth *= frameScale;
    drawHeight *= frameScale;
    const x = (this.width - drawWidth) * 0.5 + (this.config.frame?.offsetX || 0) * this.width;
    const y = (this.height - drawHeight) * 0.5 + (this.config.frame?.offsetY || 0) * this.height;
    return { x, y, width: drawWidth, height: drawHeight };
  }

  private regionRect(region: Region, layout: Layout): Rect {
    return {
      x: layout.x + region.x * layout.width,
      y: layout.y + region.y * layout.height,
      w: region.w * layout.width,
      h: region.h * layout.height
    };
  }

  private expandRegion(region: Region, padX = 0.08, padY = 0.12): Region {
    const x = clamp(region.x - region.w * padX, 0, 1);
    const y = clamp(region.y - region.h * padY, 0, 1);
    const maxW = 1 - x;
    const maxH = 1 - y;
    return {
      x,
      y,
      w: Math.min(region.w * (1 + padX * 2), maxW),
      h: Math.min(region.h * (1 + padY * 2), maxH)
    };
  }

  private transformPoint(
    x: number,
    y: number,
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number
  ) {
    const centerX = layout.x + layout.width * 0.5;
    const centerY = layout.y + layout.height * 0.5;
    return {
      x: centerX + (x - centerX) * portraitScale + translateX,
      y: centerY + (y - centerY) * portraitScale + translateY
    };
  }

  private projectRect(
    region: Region,
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number
  ): Rect {
    const raw = this.regionRect(region, layout);
    const topLeft = this.transformPoint(raw.x, raw.y, layout, translateX, translateY, portraitScale);
    const bottomRight = this.transformPoint(raw.x + raw.w, raw.y + raw.h, layout, translateX, translateY, portraitScale);
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y
    };
  }

  private drawPortraitLayer(
    image: HTMLImageElement,
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number,
    alpha = 1
  ) {
    this.ctx.save();
    this.ctx.globalAlpha = clamp(alpha, 0, 1);
    this.ctx.translate(translateX, translateY);
    this.ctx.translate(layout.x + layout.width * 0.5, layout.y + layout.height * 0.5);
    this.ctx.scale(portraitScale, portraitScale);
    this.ctx.translate(-(layout.x + layout.width * 0.5), -(layout.y + layout.height * 0.5));
    this.ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
    this.ctx.restore();
  }

  private drawParallaxOverlay(
    image: HTMLImageElement | null,
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number,
    alpha: number,
    options: {
      motionX?: number;
      motionY?: number;
      scale?: number;
    } = {}
  ) {
    if (!image || alpha <= 0.01) return;
    this.drawPortraitLayer(
      image,
      layout,
      translateX * (options.motionX ?? 1),
      translateY * (options.motionY ?? 1),
      portraitScale * (options.scale ?? 1),
      alpha
    );
  }

  private easeToward(current: number, target: number, dt: number, rise = 7.5, fall = 4.2) {
    const rate = target > current ? rise : fall;
    const weight = 1 - Math.exp(-rate * dt);
    return current + (target - current) * weight;
  }

  private updateMoodFx(dt: number) {
    const target = {
      makeupWarm: this.mood === "happy" ? 0.22 : 0,
      makeupConcerned: this.mood === "concerned" || this.mood === "thinking" ? 0.2 : 0,
      makeupSurprised: this.mood === "surprised" ? 0.24 : 0,
      makeupTeasing: this.mood === "teasing" ? 0.22 : 0,
      cheekWarm: this.mood === "happy" ? 0.24 : 0,
      cheekConcerned: this.mood === "concerned" || this.mood === "thinking" ? 0.18 : 0,
      cheekTeasing: this.mood === "teasing" ? 0.18 : 0
    };

    this.moodFx.makeupWarm = this.easeToward(this.moodFx.makeupWarm, target.makeupWarm, dt);
    this.moodFx.makeupConcerned = this.easeToward(this.moodFx.makeupConcerned, target.makeupConcerned, dt);
    this.moodFx.makeupSurprised = this.easeToward(this.moodFx.makeupSurprised, target.makeupSurprised, dt);
    this.moodFx.makeupTeasing = this.easeToward(this.moodFx.makeupTeasing, target.makeupTeasing, dt, 8.4, 4.6);
    this.moodFx.cheekWarm = this.easeToward(this.moodFx.cheekWarm, target.cheekWarm, dt);
    this.moodFx.cheekConcerned = this.easeToward(this.moodFx.cheekConcerned, target.cheekConcerned, dt);
    this.moodFx.cheekTeasing = this.easeToward(this.moodFx.cheekTeasing, target.cheekTeasing, dt, 7.8, 4.4);
  }

  private inferConversationState(nowMs: number): ConversationState {
    if (this.isTalking) return "answering";
    if (nowMs < this.interruptUntilMs) return "interrupt";
    if (this.isListening) return "listening";
    if (this.mood === "thinking") return "thinking";
    return "idle";
  }

  private updateConversationFx(dt: number, t: number) {
    this.conversationState = this.inferConversationState(t * 1000);
    const target = {
      idle: this.conversationState === "idle" ? 1 : 0,
      listening: this.conversationState === "listening" ? 1 : 0,
      thinking: this.conversationState === "thinking" ? 1 : 0,
      answering: this.conversationState === "answering" ? 1 : 0,
      interrupt: this.conversationState === "interrupt" ? 1 : 0
    };

    this.conversationFx.idle = this.easeToward(this.conversationFx.idle, target.idle, dt, 2.8, 3.6);
    this.conversationFx.listening = this.easeToward(this.conversationFx.listening, target.listening, dt, 7.4, 4.8);
    this.conversationFx.thinking = this.easeToward(this.conversationFx.thinking, target.thinking, dt, 4.8, 3.4);
    this.conversationFx.answering = this.easeToward(this.conversationFx.answering, target.answering, dt, 10.6, 6.6);
    this.conversationFx.interrupt = this.easeToward(this.conversationFx.interrupt, target.interrupt, dt, 15.2, 8.8);
  }

  private getConversationMotion(t: number): ConversationMotionProfile {
    const listenPulse = 0.5 + Math.sin(t * 2.6 + this.idleSeed * 0.4) * 0.5;
    const thinkPulse = 0.5 + Math.sin(t * 1.15 + this.idleSeed * 0.2) * 0.5;
    const answerPulse = 0.5 + Math.sin(t * 5.2 + this.idleSeed * 0.65) * 0.5;
    const interruptPulse = 0.5 + Math.sin(t * 9.6 + this.idleSeed * 1.1) * 0.5;
    return {
      state: this.conversationState,
      breathAmplitude:
        this.conversationFx.listening * (0.0032 + listenPulse * 0.0012) +
        this.conversationFx.thinking * (0.002 + thinkPulse * 0.0009) +
        this.conversationFx.answering * (0.0025 + answerPulse * 0.0012) +
        this.conversationFx.interrupt * (0.0038 + interruptPulse * 0.0018),
      portraitScaleBoost:
        this.conversationFx.listening * 0.01 +
        this.conversationFx.answering * 0.006 +
        this.conversationFx.interrupt * (0.008 + interruptPulse * 0.003),
      gazeXScale:
        1 +
        this.conversationFx.listening * 0.34 +
        this.conversationFx.thinking * 0.18 +
        this.conversationFx.interrupt * 0.24,
      gazeYScale:
        1 +
        this.conversationFx.listening * 0.3 +
        this.conversationFx.thinking * 0.38 +
        this.conversationFx.interrupt * 0.2,
      gazeYOffset:
        this.conversationFx.listening * 0.012 -
        this.conversationFx.thinking * 0.01 -
        this.conversationFx.interrupt * (0.012 + interruptPulse * 0.008),
      browLiftBoost:
        this.conversationFx.listening * (0.07 + listenPulse * 0.03) +
        this.conversationFx.interrupt * (0.1 + interruptPulse * 0.08),
      browKnitBoost:
        this.conversationFx.thinking * (0.08 + thinkPulse * 0.03) +
        this.conversationFx.interrupt * (0.06 + interruptPulse * 0.05),
      glossBoost:
        this.conversationFx.listening * 0.04 +
        this.conversationFx.answering * 0.035 +
        this.conversationFx.interrupt * (0.04 + interruptPulse * 0.04),
      jawBoost:
        this.conversationFx.answering * 0.03 +
        this.conversationFx.thinking * 0.014 +
        this.conversationFx.interrupt * (0.03 + interruptPulse * 0.02),
      backdropBoost:
        this.conversationFx.listening * (0.02 + listenPulse * 0.01) +
        this.conversationFx.thinking * (0.018 + thinkPulse * 0.01) +
        this.conversationFx.interrupt * (0.028 + interruptPulse * 0.016),
      haloAlpha:
        this.conversationFx.listening * (0.14 + listenPulse * 0.1) +
        this.conversationFx.thinking * (0.04 + thinkPulse * 0.03) +
        this.conversationFx.interrupt * (0.08 + interruptPulse * 0.08),
      hairOverlayBoost:
        this.conversationFx.listening * 0.06 +
        this.conversationFx.answering * 0.045 +
        this.conversationFx.interrupt * (0.06 + interruptPulse * 0.04),
      eyeLayerBoost:
        this.conversationFx.listening * 0.065 +
        this.conversationFx.thinking * 0.03 +
        this.conversationFx.interrupt * 0.05,
      mouthLayerBoost:
        this.conversationFx.answering * 0.08 +
        this.conversationFx.interrupt * (0.05 + interruptPulse * 0.03)
    };
  }

  private clipFeature(rect: Rect, clip: FeatureClip) {
    this.ctx.beginPath();
    if (clip === "ellipse") {
      this.ctx.ellipse(rect.x + rect.w * 0.5, rect.y + rect.h * 0.5, rect.w * 0.5, rect.h * 0.5, 0, 0, Math.PI * 2);
    } else {
      this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
    }
    this.ctx.clip();
  }

  private drawFeatureRegion(
    image: HTMLImageElement,
    layout: Layout,
    region: Region,
    translateX: number,
    translateY: number,
    portraitScale: number,
    alpha = 1,
    options: {
      clip?: FeatureClip;
      padX?: number;
      padY?: number;
      offsetX?: number;
      offsetY?: number;
      scaleX?: number;
      scaleY?: number;
    } = {}
  ) {
    if (alpha <= 0.01) return;
    const expanded = this.expandRegion(region, options.padX ?? 0.08, options.padY ?? 0.12);
    const src = {
      x: expanded.x * image.width,
      y: expanded.y * image.height,
      w: expanded.w * image.width,
      h: expanded.h * image.height
    };
    const dst = this.projectRect(expanded, layout, translateX, translateY, portraitScale);
    const clipRect = this.projectRect(region, layout, translateX, translateY, portraitScale);
    const centerX = clipRect.x + clipRect.w * 0.5;
    const centerY = clipRect.y + clipRect.h * 0.5;

    this.ctx.save();
    this.ctx.globalAlpha = clamp(alpha, 0, 1);
    this.clipFeature(clipRect, options.clip || "rect");
    this.ctx.translate(centerX, centerY);
    this.ctx.scale(options.scaleX ?? 1, options.scaleY ?? 1);
    this.ctx.translate(-centerX, -centerY);
    this.ctx.translate((options.offsetX ?? 0) * clipRect.w, (options.offsetY ?? 0) * clipRect.h);
    this.ctx.drawImage(image, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
    this.ctx.restore();
  }

  private drawRigDepthLayers(
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number,
    speech: { openness: number; wideBias: number; roundness: number },
    moodWarmth: number,
    conversation: ConversationMotionProfile
  ) {
    const jawAlpha = clamp(0.1 + speech.openness * 0.22 + Math.max(0, -moodWarmth) * 0.08 + conversation.jawBoost, 0, 0.32);
    const glossAlpha = clamp(0.14 + this.talkIntensity * 0.06 + conversation.glossBoost, 0, 0.28);
    this.drawParallaxOverlay(this.variantImages.jawShadow, layout, translateX, translateY, portraitScale, jawAlpha, {
      motionX: 0.7,
      motionY: 0.76,
      scale: 1.002
    });
    this.drawParallaxOverlay(this.variantImages.eyeGloss, layout, translateX, translateY, portraitScale, glossAlpha, {
      motionX: 1.15,
      motionY: 1.08,
      scale: 1.001
    });
  }

  private drawSlicedLayers(
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number,
    speech: { openness: number; roundness: number; wideBias: number },
    conversation: ConversationMotionProfile
  ) {
    const eyeAlpha = clamp(0.1 + conversation.eyeLayerBoost + speech.wideBias * 0.04, 0, 0.24);
    const irisAlpha = 0;
    const lidAlpha = clamp(
      (this.mood === "thinking" || this.mood === "concerned" ? 0.05 : 0) +
      (this.mood === "teasing" ? 0.035 : 0) +
      this.blinkAmount * 0.05,
      0,
      0.1
    );
    const mouthAlpha = clamp(0.08 + speech.openness * 0.18 + speech.roundness * 0.06 + conversation.mouthLayerBoost, 0, 0.28);
    const faceAlpha = clamp(0.1 + conversation.backdropBoost * 0.35, 0.1, 0.14);
    const hairAlpha = clamp(0.16 + conversation.hairOverlayBoost, 0.16, 0.24);
    const fringeAlpha = clamp(0.14 + conversation.hairOverlayBoost * 0.8 + (this.mood === "teasing" ? 0.03 : 0), 0.14, 0.24);
    const teaseGlanceX = 0;

    this.drawParallaxOverlay(this.layerImages.faceCore, layout, translateX, translateY, portraitScale, faceAlpha, {
      motionX: 0.86,
      motionY: 0.82,
      scale: 1.001
    });
    this.drawParallaxOverlay(this.layerImages.eyeCore, layout, translateX, translateY, portraitScale, eyeAlpha, {
      motionX: 1.24,
      motionY: 1.12,
      scale: 1.002
    });
    if (this.layerImages.irisCore) {
      this.drawFeatureRegion(this.layerImages.irisCore, layout, this.config.anchors.leftEye, translateX, translateY, portraitScale, irisAlpha, {
        clip: "ellipse",
        padX: 0.12,
        padY: 0.22,
        offsetX: teaseGlanceX,
        offsetY: this.mood === "teasing" ? -0.004 : 0,
        scaleX: 1,
        scaleY: 1
      });
      this.drawFeatureRegion(this.layerImages.irisCore, layout, this.config.anchors.rightEye, translateX, translateY, portraitScale, irisAlpha, {
        clip: "ellipse",
        padX: 0.12,
        padY: 0.22,
        offsetX: teaseGlanceX * 0.2,
        offsetY: 0,
        scaleX: 1,
        scaleY: 1
      });
    }
    if (this.layerImages.lidSoft) {
      this.drawFeatureRegion(this.layerImages.lidSoft, layout, this.config.anchors.leftEye, translateX, translateY, portraitScale, lidAlpha, {
        clip: "ellipse",
        padX: 0.14,
        padY: 0.28,
        offsetY: this.mood === "teasing" ? -0.008 : -0.004,
        scaleY: 0.99
      });
      this.drawFeatureRegion(this.layerImages.lidSoft, layout, this.config.anchors.rightEye, translateX, translateY, portraitScale, lidAlpha, {
        clip: "ellipse",
        padX: 0.14,
        padY: 0.28,
        offsetY: (this.mood === "thinking" || this.mood === "concerned") ? -0.006 : -0.003,
        scaleY: 0.99
      });
    }
    this.drawParallaxOverlay(this.layerImages.mouthCore, layout, translateX, translateY, portraitScale, mouthAlpha, {
      motionX: 1.03,
      motionY: 1.1,
      scale: 1.002
    });
    this.drawParallaxOverlay(this.layerImages.hairShell, layout, translateX, translateY, portraitScale, hairAlpha, {
      motionX: 1.34,
      motionY: 1.16,
      scale: 1.004
    });
    this.drawParallaxOverlay(this.layerImages.fringeVeil, layout, translateX, translateY, portraitScale, fringeAlpha, {
      motionX: 1.22,
      motionY: 1.06,
      scale: 1.003
    });
  }

  private drawMoodCosmetics(
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number
  ) {
    this.drawParallaxOverlay(this.variantImages.cheekWarm, layout, translateX, translateY, portraitScale, this.moodFx.cheekWarm, {
      motionX: 0.74,
      motionY: 0.7,
      scale: 1.002
    });
    this.drawParallaxOverlay(this.variantImages.cheekConcerned, layout, translateX, translateY, portraitScale, this.moodFx.cheekConcerned, {
      motionX: 0.74,
      motionY: 0.7,
      scale: 1.002
    });
    this.drawParallaxOverlay(this.variantImages.cheekTeasing, layout, translateX, translateY, portraitScale, this.moodFx.cheekTeasing, {
      motionX: 0.76,
      motionY: 0.68,
      scale: 1.002
    });
    this.drawParallaxOverlay(this.variantImages.makeupWarm, layout, translateX, translateY, portraitScale, this.moodFx.makeupWarm, {
      motionX: 1.02,
      motionY: 0.94
    });
    this.drawParallaxOverlay(this.variantImages.makeupConcerned, layout, translateX, translateY, portraitScale, this.moodFx.makeupConcerned, {
      motionX: 1.02,
      motionY: 0.94
    });
    this.drawParallaxOverlay(this.variantImages.makeupSurprised, layout, translateX, translateY, portraitScale, this.moodFx.makeupSurprised, {
      motionX: 1.04,
      motionY: 0.9
    });
    this.drawParallaxOverlay(this.variantImages.makeupTeasing, layout, translateX, translateY, portraitScale, this.moodFx.makeupTeasing, {
      motionX: 1.06,
      motionY: 0.92
    });
  }

  private getBlinkStrength(eyeBias: number) {
    return clamp(this.blinkAmount + Math.max(0, -eyeBias) * 0.18, 0, 1);
  }

  private getSpeechProfile(mouthBias: number) {
    const openness = clamp(this.speechOpen + Math.max(0, mouthBias) * 0.18, 0, 0.88);
    const roundness = clamp(this.speechRoundness * (0.4 + openness * 0.8), 0, 1);
    const wideBias = clamp((openness - roundness * 0.22) * 1.05, 0, 1);
    return { openness, roundness, wideBias };
  }

  private blendBlendshapes(
    from: Record<string, number> = {},
    to: Record<string, number> = {},
    weight: number
  ) {
    const out: Record<string, number> = {};
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of keys) {
      const start = from[key] || 0;
      const end = to[key] || 0;
      out[key] = start + (end - start) * weight;
    }
    return out;
  }

  private resolveConsonantPose(phoneme?: string) {
    const key = String(phoneme || "").toLowerCase().trim();
    if (["m", "b", "p"].includes(key)) return "closedPress" as const;
    if (["f", "v"].includes(key)) return "lipBite" as const;
    return null;
  }

  private resolveSpeechPlate(phoneme?: string) {
    const key = String(phoneme || "").toLowerCase().trim();
    if (["m", "b", "p"].includes(key)) return "closedPress" as const;
    if (["f", "v"].includes(key)) return "lipBite" as const;
    if (["th", "l"].includes(key)) return "tongue" as const;
    if (["s", "z", "t", "d", "n", "ch", "j", "sh"].includes(key)) return "sibilant" as const;
    if (["e", "i", "y"].includes(key)) return "ee" as const;
    if (["a", "h"].includes(key)) return "ah" as const;
    if (["o", "u", "w", "r"].includes(key)) return "oh" as const;
    return null;
  }

  private getBrowRegion(side: "left" | "right"): Region {
    if (side === "left") {
      return this.config.anchors.leftBrow || {
        x: this.config.anchors.leftEye.x - 0.008,
        y: this.config.anchors.leftEye.y - 0.056,
        w: this.config.anchors.leftEye.w + 0.016,
        h: this.config.anchors.leftEye.h * 0.92
      };
    }
    return this.config.anchors.rightBrow || {
      x: this.config.anchors.rightEye.x - 0.008,
      y: this.config.anchors.rightEye.y - 0.056,
      w: this.config.anchors.rightEye.w + 0.016,
      h: this.config.anchors.rightEye.h * 0.92
    };
  }

  private resolveScheduledSpeechProfile(timestampMs: number) {
    if (!this.isTalking || !this.lipsyncSequence || !this.lipsyncStartedAt) return null;
    const elapsed = timestampMs - this.lipsyncStartedAt;
    if (elapsed < 0 || elapsed > this.lipsyncSequence.totalDuration + 180) return null;

    const cues = Array.isArray(this.lipsyncSequence.sequences) ? this.lipsyncSequence.sequences : [];
    if (!cues.length) return null;

    const currentCue =
      cues.find(cue => cue.time <= elapsed && elapsed < cue.time + cue.duration) ||
      (elapsed >= this.lipsyncSequence.totalDuration ? cues[cues.length - 1] : null);

    if (!currentCue) return null;

    const nextCue = cues.find(cue => cue.time > elapsed) || null;
    const progress = clamp((elapsed - currentCue.time) / Math.max(currentCue.duration || 1, 1), 0, 1);
    const blendshapes = nextCue
      ? this.blendBlendshapes(currentCue.blendshapes || {}, nextCue.blendshapes || {}, progress)
      : (currentCue.blendshapes || {});
    const activePhoneme = progress > 0.72 && nextCue?.phoneme ? nextCue.phoneme : currentCue.phoneme;

    const mouthOpen = blendshapes.mouthOpen || 0;
    const jawOpen = blendshapes.jawOpen || 0;
    const mouthPucker = blendshapes.mouthPucker || 0;
    const mouthSmile = blendshapes.mouthSmile || 0;

    const openness = clamp(mouthOpen * 0.62 + jawOpen * 0.74 + mouthSmile * 0.08, 0, 0.92);
    const roundness = clamp(mouthPucker * 0.95 + jawOpen * 0.08 - mouthSmile * 0.12, 0, 1);
    const wideBias = clamp(openness + mouthSmile * 0.55 - roundness * 0.3, 0, 1);
    return {
      openness,
      roundness,
      wideBias,
      phoneme: activePhoneme || "",
      consonantPose: this.resolveConsonantPose(activePhoneme),
      speechPlate: this.resolveSpeechPlate(activePhoneme)
    };
  }

  private drawEyeZone(
    side: "left" | "right",
    layout: Layout,
    region: Region,
    translateX: number,
    translateY: number,
    portraitScale: number,
    blinkStrength: number,
    eyeBias: number,
    conversation: ConversationMotionProfile
  ) {
    const teasingSide = this.mood === "teasing" ? (side === "left" ? 1 : -0.35) : 0;
    const teaseSquint = this.mood === "teasing" ? (side === "left" ? 0.92 : 0.98) : 1;
    const gazeX = clamp(this.shiftX * 10 * conversation.gazeXScale + eyeBias * 0.15 + teasingSide * 0.016, -0.06, 0.06);
    const gazeY = clamp(this.shiftY * 12 * conversation.gazeYScale - eyeBias * 0.1 + conversation.gazeYOffset - (this.mood === "teasing" ? 0.006 : 0), -0.05, 0.05);

    if (this.image && blinkStrength < 0.82) {
      this.drawFeatureRegion(this.image, layout, region, translateX, translateY, portraitScale, 0.18 + (1 - blinkStrength) * 0.1, {
        clip: "ellipse",
        padX: 0.2,
        padY: 0.5,
        offsetX: gazeX,
        offsetY: gazeY,
        scaleX: 1.014,
        scaleY: 1.02 * teaseSquint
      });
    }

    if (this.variantImages.blink && blinkStrength > 0.01) {
      this.drawFeatureRegion(this.variantImages.blink, layout, region, translateX, translateY, portraitScale, blinkStrength * 0.98, {
        clip: "ellipse",
        padX: 0.2,
        padY: 0.5,
        offsetY: -blinkStrength * 0.02,
        scaleX: 1,
        scaleY: 1 + blinkStrength * 0.03
      });
    }
  }

  private drawBrowZones(
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number,
    browBias: number,
    speechEnergy: number,
    conversation: ConversationMotionProfile,
    t: number
  ) {
    const asymmetry = Math.sin(t * 1.6 + this.idleSeed) * 0.03;
    const teaseSwing = this.mood === "teasing" ? 0.12 + Math.sin(t * 1.35 + this.idleSeed * 0.7) * 0.06 : 0;
    const liftAlpha = clamp(Math.max(0, -browBias) * 3.4 + conversation.browLiftBoost + speechEnergy * 0.16, 0, 0.72);
    const knitAlpha = clamp(Math.max(0, browBias) * 3.8 + conversation.browKnitBoost + speechEnergy * 0.1, 0, 0.74);

    const leftBrow = this.getBrowRegion("left");
    const rightBrow = this.getBrowRegion("right");

    if (this.variantImages.browLift && liftAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.browLift, layout, leftBrow, translateX, translateY, portraitScale, clamp(liftAlpha + asymmetry + teaseSwing, 0, 0.82), {
        clip: "rect",
        padX: 0.22,
        padY: 0.52,
        offsetY: -0.024 - teaseSwing * 0.08,
        scaleY: 1.04
      });
      this.drawFeatureRegion(this.variantImages.browLift, layout, rightBrow, translateX, translateY, portraitScale, clamp(liftAlpha - asymmetry - teaseSwing * 0.28, 0, 0.76), {
        clip: "rect",
        padX: 0.22,
        padY: 0.52,
        offsetY: -0.024,
        scaleY: 1.04
      });
    }

    if (this.variantImages.browKnit && knitAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.browKnit, layout, leftBrow, translateX, translateY, portraitScale, clamp(knitAlpha - asymmetry * 0.4 - teaseSwing * 0.26, 0, 0.72), {
        clip: "rect",
        padX: 0.22,
        padY: 0.56,
        offsetY: 0.012,
        scaleY: 1.02
      });
      this.drawFeatureRegion(this.variantImages.browKnit, layout, rightBrow, translateX, translateY, portraitScale, clamp(knitAlpha + asymmetry * 0.4 + teaseSwing * 0.12, 0, 0.72), {
        clip: "rect",
        padX: 0.22,
        padY: 0.56,
        offsetY: 0.012,
        scaleY: 1.02
      });
    }
  }

  private drawSpeechZones(
    layout: Layout,
    translateX: number,
    translateY: number,
    portraitScale: number,
    speech: {
      openness: number;
      roundness: number;
      wideBias: number;
      consonantPose?: "closedPress" | "lipBite" | null;
      speechPlate?: "ee" | "ah" | "oh" | "sibilant" | "tongue" | "closedPress" | "lipBite" | null;
    }
  ) {
    const mouth = this.config.anchors.mouth;
    const consonantPose = speech.consonantPose || null;
    const speechPlate = speech.speechPlate || null;
    const closedPressAlpha = this.variantImages.mouthClosedPress && consonantPose === "closedPress"
      ? clamp(0.68 + (0.08 - speech.openness) * 1.8, 0.58, 0.92)
      : 0;
    const lipBiteAlpha = this.variantImages.mouthLipBite && consonantPose === "lipBite"
      ? clamp(0.52 + speech.roundness * 0.18 + speech.openness * 0.14, 0.46, 0.88)
      : 0;
    const opennessScale = consonantPose === "closedPress" ? 0.18 : consonantPose === "lipBite" ? 0.42 : 1;
    const softAlpha = this.variantImages.mouthSoft ? clamp((speech.openness - 0.03) / 0.16, 0, 0.74) * opennessScale : 0;
    const mediumAlpha = this.variantImages.mouthMedium ? clamp((speech.openness - 0.16) / 0.18, 0, 0.82) * opennessScale : 0;
    const wideAlpha = this.variantImages.mouthWide ? clamp((speech.wideBias - 0.34) / 0.34, 0, 0.9) * opennessScale : 0;
    const roundAlpha = this.variantImages.mouthRound
      ? clamp((speech.roundness - 0.45) / 0.26, 0, 0.84) * (consonantPose === "closedPress" ? 0.12 : 1)
      : 0;
    const eeAlpha = this.variantImages.mouthEe && speechPlate === "ee"
      ? clamp(0.44 + speech.wideBias * 0.28 + (1 - speech.roundness) * 0.08, 0, 0.82)
      : 0;
    const ahAlpha = this.variantImages.mouthAh && speechPlate === "ah"
      ? clamp(0.46 + speech.openness * 0.34, 0, 0.84)
      : 0;
    const ohAlpha = this.variantImages.mouthOh && speechPlate === "oh"
      ? clamp(0.44 + speech.roundness * 0.3 + speech.openness * 0.1, 0, 0.82)
      : 0;
    const sibilantAlpha = this.variantImages.mouthSibilant && speechPlate === "sibilant"
      ? clamp(0.42 + speech.wideBias * 0.16, 0, 0.78)
      : 0;
    const tongueAlpha = this.variantImages.mouthTongue && speechPlate === "tongue"
      ? clamp(0.4 + speech.openness * 0.22, 0, 0.76)
      : 0;

    const mouthLift = speech.openness * 0.045 - speech.roundness * 0.012;
    const mouthScaleX = 1 + speech.wideBias * 0.06 - speech.roundness * 0.03;
    const mouthScaleY = 1 + speech.openness * 0.16;

    if (this.variantImages.mouthSoft && softAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthSoft, layout, mouth, translateX, translateY, portraitScale, softAlpha, {
        clip: "ellipse",
        padX: 0.28,
        padY: 0.42,
        offsetY: mouthLift,
        scaleX: mouthScaleX,
        scaleY: mouthScaleY
      });
    }
    if (this.variantImages.mouthMedium && mediumAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthMedium, layout, mouth, translateX, translateY, portraitScale, mediumAlpha, {
        clip: "ellipse",
        padX: 0.3,
        padY: 0.44,
        offsetY: mouthLift,
        scaleX: mouthScaleX,
        scaleY: 1 + speech.openness * 0.2
      });
    }
    if (this.variantImages.mouthWide && wideAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthWide, layout, mouth, translateX, translateY, portraitScale, wideAlpha, {
        clip: "ellipse",
        padX: 0.34,
        padY: 0.42,
        offsetY: mouthLift,
        scaleX: 1 + speech.wideBias * 0.08,
        scaleY: 1 + speech.openness * 0.12
      });
    }
    if (this.variantImages.mouthRound && roundAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthRound, layout, mouth, translateX, translateY, portraitScale, roundAlpha, {
        clip: "ellipse",
        padX: 0.34,
        padY: 0.46,
        offsetY: mouthLift * 0.8,
        scaleX: 1 - speech.roundness * 0.04,
        scaleY: 1 + speech.roundness * 0.12 + speech.openness * 0.06
      });
    }
    if (this.variantImages.mouthClosedPress && closedPressAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthClosedPress, layout, mouth, translateX, translateY, portraitScale, closedPressAlpha, {
        clip: "ellipse",
        padX: 0.24,
        padY: 0.36,
        offsetY: -0.004,
        scaleX: 1.02,
        scaleY: 0.98
      });
    }
    if (this.variantImages.mouthLipBite && lipBiteAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthLipBite, layout, mouth, translateX, translateY, portraitScale, lipBiteAlpha, {
        clip: "ellipse",
        padX: 0.26,
        padY: 0.4,
        offsetY: mouthLift * 0.36,
        scaleX: 0.99,
        scaleY: 1.02
      });
    }
    if (this.variantImages.mouthEe && eeAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthEe, layout, mouth, translateX, translateY, portraitScale, eeAlpha, {
        clip: "ellipse",
        padX: 0.3,
        padY: 0.4,
        offsetY: mouthLift * 0.5,
        scaleX: 1.05,
        scaleY: 0.98
      });
    }
    if (this.variantImages.mouthAh && ahAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthAh, layout, mouth, translateX, translateY, portraitScale, ahAlpha, {
        clip: "ellipse",
        padX: 0.28,
        padY: 0.44,
        offsetY: mouthLift,
        scaleX: 1.01,
        scaleY: 1.08
      });
    }
    if (this.variantImages.mouthOh && ohAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthOh, layout, mouth, translateX, translateY, portraitScale, ohAlpha, {
        clip: "ellipse",
        padX: 0.28,
        padY: 0.44,
        offsetY: mouthLift * 0.72,
        scaleX: 0.98,
        scaleY: 1.06
      });
    }
    if (this.variantImages.mouthSibilant && sibilantAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthSibilant, layout, mouth, translateX, translateY, portraitScale, sibilantAlpha, {
        clip: "ellipse",
        padX: 0.26,
        padY: 0.34,
        offsetY: mouthLift * 0.34,
        scaleX: 1.04,
        scaleY: 0.96
      });
    }
    if (this.variantImages.mouthTongue && tongueAlpha > 0.01) {
      this.drawFeatureRegion(this.variantImages.mouthTongue, layout, mouth, translateX, translateY, portraitScale, tongueAlpha, {
        clip: "ellipse",
        padX: 0.24,
        padY: 0.38,
        offsetY: mouthLift * 0.52,
        scaleX: 0.98,
        scaleY: 1.02
      });
    }

    if (
      !this.variantImages.mouthSoft &&
      !this.variantImages.mouthMedium &&
      !this.variantImages.mouthWide &&
      !this.variantImages.mouthRound &&
      !this.variantImages.mouthClosedPress &&
      !this.variantImages.mouthLipBite &&
      !this.variantImages.mouthEe &&
      !this.variantImages.mouthAh &&
      !this.variantImages.mouthOh &&
      !this.variantImages.mouthSibilant &&
      !this.variantImages.mouthTongue
    ) {
      this.drawMouth(layout, speech.openness, speech.roundness);
    }
  }

  private draw(timestamp: number) {
    if (!this.idleEnabled || this.width === 0 || this.height === 0 || !this.image) return;

    const t = timestamp / 1000;
    const dt = this.lastFrameAt > 0 ? Math.min(0.05, Math.max(0.008, t - this.lastFrameAt)) : 1 / 60;
    this.lastFrameAt = t;
    this.updateConversationFx(dt, t);
    this.updateMicroMotion(t);
    const mood = this.getMoodState();
    this.updateMoodFx(dt);
    const conversation = this.getConversationMotion(t);
    const breath = Math.sin(t * 0.9 + this.idleSeed) * (0.009 + conversation.breathAmplitude);
    const portraitScale = 1 + breath + conversation.portraitScaleBoost;
    const translateX = this.shiftX * this.width;
    const translateY = (this.shiftY - breath * 1.8) * this.height;
    const layout = this.getLayout();
    const blinkStrength = this.getBlinkStrength(mood.eyeBias);
    const scheduledSpeech = this.resolveScheduledSpeechProfile(timestamp);
    if (!scheduledSpeech) {
      this.updateSpeechMotion(t, mood.mouthBias);
    }
    const speech = scheduledSpeech || this.getSpeechProfile(mood.mouthBias);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackdrop(t, mood.warmth, conversation);
    this.drawPortraitLayer(this.image, layout, translateX, translateY, portraitScale);
    this.drawSlicedLayers(layout, translateX, translateY, portraitScale, speech, conversation);
    this.drawRigDepthLayers(layout, translateX, translateY, portraitScale, speech, mood.warmth, conversation);

    if (mood.warmth !== 0) {
      this.drawFaceGrade(layout, mood.warmth);
    }

    this.drawEyeZone(
      "left",
      layout,
      this.config.anchors.leftEye,
      translateX,
      translateY,
      portraitScale,
      blinkStrength,
      mood.eyeBias,
      conversation
    );
    this.drawEyeZone(
      "right",
      layout,
      this.config.anchors.rightEye,
      translateX,
      translateY,
      portraitScale,
      blinkStrength,
      mood.eyeBias,
      conversation
    );
    if (!this.variantImages.blink && blinkStrength > 0.01) {
      this.drawBlink(layout, blinkStrength);
    }

    const shouldDrawSpeech =
      speech.openness > 0.02 ||
      speech.roundness > 0.08 ||
      Boolean((speech as { consonantPose?: string | null }).consonantPose);
    if (shouldDrawSpeech) {
      this.drawSpeechZones(
        layout,
        translateX,
        translateY,
        portraitScale,
        speech as {
          openness: number;
          roundness: number;
          wideBias: number;
          consonantPose?: "closedPress" | "lipBite" | null;
          speechPlate?: "ee" | "ah" | "oh" | "sibilant" | "tongue" | "closedPress" | "lipBite" | null;
        }
      );
    }

    const browSpeechEnergy = clamp(speech.openness * 0.55 + speech.wideBias * 0.2 + speech.roundness * 0.12, 0, 0.4);
    this.drawBrowZones(layout, translateX, translateY, portraitScale, mood.browBias, browSpeechEnergy, conversation, t);
    if (!this.variantImages.browLift && !this.variantImages.browKnit) {
      this.drawBrowAccent(layout, mood.browBias);
    }
    this.drawMoodCosmetics(layout, translateX, translateY, portraitScale);
    this.drawParallaxOverlay(this.variantImages.frontHair, layout, translateX, translateY, portraitScale, clamp(0.46 + conversation.hairOverlayBoost, 0.46, 0.58), {
      motionX: 1.18,
      motionY: 1.08,
      scale: 1.004
    });

    if (conversation.haloAlpha > 0.01) {
      this.drawListeningHalo(layout, t, conversation);
    }
  }

  private drawBackdrop(t: number, warmth: number, conversation: ConversationMotionProfile) {
    const base = this.ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.34,
      this.width * 0.08,
      this.width * 0.5,
      this.height * 0.5,
      this.width * 0.9
    );
    base.addColorStop(0, warmth > 0 ? "#28151a" : conversation.state === "interrupt" ? "#180d12" : "#120e12");
    base.addColorStop(0.5, "#0c0a10");
    base.addColorStop(1, "#050407");
    this.ctx.fillStyle = base;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.save();
    this.ctx.globalAlpha = clamp(0.12 + conversation.backdropBoost, 0.12, 0.18);
    for (let i = 0; i < 4; i += 1) {
      const pulse = 0.6 + Math.sin(t * 0.25 + i) * 0.4;
      this.ctx.beginPath();
      this.ctx.arc(this.width * 0.5, this.height * 0.42, this.width * (0.16 + i * 0.08), 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(170, 126, 140, ${0.06 * pulse})`;
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawFaceGrade(layout: { x: number; y: number; width: number; height: number }, warmth: number) {
    const face = this.regionRect(this.config.anchors.face || DEFAULT_CONFIG.anchors.face!, layout);
    this.ctx.save();
    this.ctx.globalAlpha = Math.min(0.18, Math.abs(warmth));
    this.ctx.fillStyle = warmth > 0 ? "rgba(182, 66, 82, 0.8)" : "rgba(74, 90, 122, 0.7)";
    this.ctx.beginPath();
    this.ctx.ellipse(face.x + face.w * 0.5, face.y + face.h * 0.5, face.w * 0.44, face.h * 0.48, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawBlink(layout: { x: number; y: number; width: number; height: number }, blinkStrength: number) {
    if (blinkStrength <= 0.01) return;

    const drawLid = (region: Region) => {
      const box = this.regionRect(region, layout);
      const lidHeight = box.h * (0.1 + blinkStrength * 0.78);
      const alpha = 0.25 + blinkStrength * 0.68;
      this.ctx.save();
      this.ctx.fillStyle = `rgba(229, 203, 195, ${alpha.toFixed(2)})`;
      this.ctx.beginPath();
      this.ctx.ellipse(box.x + box.w * 0.5, box.y + lidHeight * 0.6, box.w * 0.52, lidHeight, 0, Math.PI, 0, true);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.ellipse(box.x + box.w * 0.5, box.y + box.h - lidHeight * 0.45, box.w * 0.52, lidHeight * 0.76, 0, 0, Math.PI, true);
      this.ctx.closePath();
      this.ctx.fill();
      if (blinkStrength > 0.72) {
        this.ctx.strokeStyle = "rgba(48, 21, 27, 0.65)";
        this.ctx.lineWidth = Math.max(1.2, box.h * 0.06);
        this.ctx.beginPath();
        this.ctx.moveTo(box.x + box.w * 0.14, box.y + box.h * 0.54);
        this.ctx.quadraticCurveTo(box.x + box.w * 0.5, box.y + box.h * 0.48, box.x + box.w * 0.86, box.y + box.h * 0.54);
        this.ctx.stroke();
      }
      this.ctx.restore();
    };

    drawLid(this.config.anchors.leftEye);
    drawLid(this.config.anchors.rightEye);
  }

  private drawMouth(layout: { x: number; y: number; width: number; height: number }, mouthOpen: number, roundness = 0) {
    if (mouthOpen <= 0.02) return;

    const box = this.regionRect(this.config.anchors.mouth, layout);
    const cx = box.x + box.w * 0.5;
    const cy = box.y + box.h * 0.58;
    const innerW = box.w * (0.24 + mouthOpen * 0.3 - roundness * 0.1);
    const innerH = box.h * (0.08 + mouthOpen * 0.42);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, innerW, innerH, 0, 0, Math.PI * 2);
    this.ctx.clip();
    const mouthGradient = this.ctx.createLinearGradient(cx, cy - innerH, cx, cy + innerH);
    mouthGradient.addColorStop(0, "rgba(24, 8, 11, 0.95)");
    mouthGradient.addColorStop(0.6, "rgba(74, 18, 30, 0.86)");
    mouthGradient.addColorStop(1, "rgba(148, 56, 74, 0.4)");
    this.ctx.fillStyle = mouthGradient;
    this.ctx.fillRect(cx - innerW - 2, cy - innerH - 2, innerW * 2 + 4, innerH * 2 + 4);
    if (mouthOpen > 0.18) {
      this.ctx.fillStyle = "rgba(240, 224, 220, 0.72)";
      this.ctx.fillRect(cx - innerW * 0.72, cy - innerH * 0.82, innerW * 1.44, innerH * 0.28);
    }
    this.ctx.restore();

    this.ctx.save();
    this.ctx.strokeStyle = this.config.lipTint || DEFAULT_CONFIG.lipTint!;
    this.ctx.lineWidth = Math.max(1.2, box.h * 0.06);
    this.ctx.beginPath();
    this.ctx.moveTo(box.x + box.w * 0.18, box.y + box.h * (0.52 + mouthOpen * 0.05));
    this.ctx.quadraticCurveTo(cx, box.y + box.h * (0.82 + mouthOpen * 0.05), box.x + box.w * 0.82, box.y + box.h * (0.52 + mouthOpen * 0.05));
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawBrowAccent(layout: { x: number; y: number; width: number; height: number }, browBias: number) {
    if (Math.abs(browBias) < 0.01) return;
    const left = this.regionRect(this.config.anchors.leftEye, layout);
    const right = this.regionRect(this.config.anchors.rightEye, layout);
    const lift = browBias * left.h * 1.8;

    const drawBrow = (box: { x: number; y: number; w: number; h: number }, direction: 1 | -1) => {
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(25, 16, 20, 0.42)";
      this.ctx.lineWidth = Math.max(1.4, box.h * 0.07);
      this.ctx.beginPath();
      this.ctx.moveTo(box.x + box.w * 0.1, box.y - box.h * 0.38 - lift);
      this.ctx.quadraticCurveTo(
        box.x + box.w * 0.5,
        box.y - box.h * (0.82 + browBias * 0.6 * direction),
        box.x + box.w * 0.9,
        box.y - box.h * 0.28 + lift * 0.4
      );
      this.ctx.stroke();
      this.ctx.restore();
    };

    drawBrow(left, 1);
    drawBrow(right, -1);
  }

  private drawListeningHalo(
    layout: { x: number; y: number; width: number; height: number },
    t: number,
    conversation: ConversationMotionProfile
  ) {
    if (conversation.haloAlpha <= 0.01) return;
    const face = this.regionRect(this.config.anchors.face || DEFAULT_CONFIG.anchors.face!, layout);
    const pulseRate = conversation.state === "interrupt" ? 5.8 : conversation.state === "thinking" ? 1.6 : 2.4;
    const pulse = 0.58 + Math.sin(t * pulseRate) * 0.12;
    this.ctx.save();
    this.ctx.globalAlpha = clamp(conversation.haloAlpha, 0.04, 0.28);
    this.ctx.strokeStyle =
      conversation.state === "thinking"
        ? `rgba(120, 116, 164, ${pulse})`
        : conversation.state === "interrupt"
          ? `rgba(214, 78, 108, ${pulse})`
          : `rgba(186, 65, 97, ${pulse})`;
    this.ctx.lineWidth = conversation.state === "interrupt" ? 3.4 : 3;
    this.ctx.beginPath();
    this.ctx.ellipse(face.x + face.w * 0.5, face.y + face.h * 0.5, face.w * 0.64, face.h * 0.8, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }
}
