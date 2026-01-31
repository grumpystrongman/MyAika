import type { AvatarEngine, Mood } from "./AvatarEngine";

type MoodMap = Record<Mood, string | number>;

export class Live2DWebEngine implements AvatarEngine {
  private canvas: HTMLCanvasElement;
  private app: any = null;
  private model: any = null;
  private moodMap: MoodMap;
  private isTalking = false;
  private talkIntensity = 0.5;
  private isListening = false;
  private idleEnabled = true;
  private motionList: Array<{ group: string; index: number }> = [];
  private motionTimer: number | null = null;

  constructor(canvas: HTMLCanvasElement, moodMap?: Partial<MoodMap>) {
    this.canvas = canvas;
    this.moodMap = {
      neutral: "neutral",
      happy: "happy",
      thinking: "thinking",
      concerned: "concerned",
      surprised: "surprised",
      ...moodMap
    };
  }

  async load(modelUrl: string): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("live2d_client_only");
    }
    if (!this.canvas.getContext("webgl")) throw new Error("webgl_not_supported");

    await ensureCubismCore();
    const w = window as any;
    const { PIXI, Live2DModel } = await ensurePixiLive2D();

    this.app = new PIXI.Application({
      view: this.canvas,
      autoStart: true,
      backgroundAlpha: 0
    });

    this.model = await Live2DModel.from(modelUrl);
    this.app.stage.addChild(this.model);
    this.layoutModel();
    this.motionList = this.buildMotionList();
    this.scheduleRandomMotion();

    this.app.ticker.add((delta: number) => {
      if (!this.model) return;
      const core = this.model.internalModel?.coreModel;
      if (core?.setParameterValueById) {
        const mouth = this.isTalking ? this.talkIntensity : 0;
        core.setParameterValueById("ParamMouthOpenY", mouth);
        if (this.isListening) {
          core.setParameterValueById("ParamEyeBallX", 0.2);
        }
        const blink = Math.abs(Math.sin(Date.now() / 1200));
        core.setParameterValueById("ParamEyeLOpen", blink);
        core.setParameterValueById("ParamEyeROpen", blink);
      }
      if (this.model?.update) this.model.update(delta);
    });
  }

  setMood(mood: Mood): void {
    const expression = this.moodMap[mood] ?? "neutral";
    if (!this.model) return;
    if (this.model.expression && typeof expression === "string") {
      this.model.expression(expression).catch(() => {});
    } else if (this.model?.internalModel?.expressionManager?.setExpression) {
      this.model.internalModel.expressionManager.setExpression(expression);
    }
  }

  setTalking(isTalking: boolean, intensity = 0.5): void {
    this.isTalking = isTalking;
    this.talkIntensity = Math.max(0, Math.min(1, intensity));
  }

  setListening(isListening: boolean): void {
    this.isListening = isListening;
  }

  setIdle(enabled: boolean): void {
    this.idleEnabled = enabled;
    if (!this.app?.ticker) return;
    if (enabled) this.app.ticker.start();
    else this.app.ticker.stop();
  }

  resize(width: number, height: number): void {
    if (!this.app?.renderer) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.app.renderer.resize(w, h);
    this.layoutModel();
  }

  destroy(): void {
    if (this.model?.destroy) this.model.destroy();
    this.model = null;
    if (this.app?.destroy) this.app.destroy(true, { children: true });
    this.app = null;
    if (this.motionTimer) window.clearTimeout(this.motionTimer);
    this.motionTimer = null;
  }

  private layoutModel() {
    if (!this.app || !this.model) return;
    const width = this.app.renderer?.width || this.canvas.clientWidth || 1;
    const height = this.app.renderer?.height || this.canvas.clientHeight || 1;
    const modelWidth = this.model.width || this.model.getBounds?.().width || 1;
    const modelHeight = this.model.height || this.model.getBounds?.().height || 1;
    const scale = Math.min(width / modelWidth, height / modelHeight) * 0.95;
    this.model.scale.set(scale);
    if (this.model.anchor?.set) {
      this.model.anchor.set(0.5, 1);
    } else if (this.model.pivot?.set) {
      this.model.pivot.set(modelWidth / 2, modelHeight);
    }
    this.model.x = width * 0.5;
    this.model.y = height * 0.98;
  }

  private buildMotionList() {
    const list: Array<{ group: string; index: number }> = [];
    const defs = this.model?.internalModel?.motionManager?.definitions;
    if (defs && typeof defs === "object") {
      for (const [group, motions] of Object.entries(defs)) {
        if (Array.isArray(motions)) {
          motions.forEach((_, index) => list.push({ group, index }));
        }
      }
    }
    return list;
  }

  private scheduleRandomMotion() {
    if (!this.model || !this.motionList.length) return;
    const play = () => {
      if (!this.model || !this.motionList.length) return;
      const pick = this.motionList[Math.floor(Math.random() * this.motionList.length)];
      this.model.motion(pick.group, pick.index).catch(() => {});
      const delay = 6000 + Math.random() * 7000;
      this.motionTimer = window.setTimeout(play, delay);
    };
    const firstDelay = 1500 + Math.random() * 2000;
    this.motionTimer = window.setTimeout(play, firstDelay);
  }
}

async function ensureCubismCore() {
  const w = window as any;
  if (w.Live2DCubismCore) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/assets/aika/live2d/live2dcubismcore.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("live2d_core_missing"));
    document.head.appendChild(script);
  });
  if (!w.Live2DCubismCore) {
    throw new Error("live2d_core_missing");
  }
}

async function ensurePixiLive2D() {
  const w = window as any;
  if (!w.__aikaPixiPromise) {
    w.__aikaPixiPromise = loadScriptOnce("/vendor/pixi.min.js", "PIXI");
  }
  await w.__aikaPixiPromise;
  const PIXI = w.PIXI;
  if (!PIXI) throw new Error("pixi_missing");
  if (!w.__aikaPixiExtensionsPatched && PIXI?.extensions?.add) {
    const origAdd = PIXI.extensions.add.bind(PIXI.extensions);
    PIXI.extensions.add = (...args: any[]) => {
      try {
        return origAdd(...args);
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (msg.includes("already has a handler")) return;
        throw err;
      }
    };
    w.__aikaPixiExtensionsPatched = true;
  }
  if (!w.__aikaPixiRegisterPatched && PIXI?.Renderer?.registerPlugin) {
    const origRegister = PIXI.Renderer.registerPlugin.bind(PIXI.Renderer);
    PIXI.Renderer.registerPlugin = (name: string, ctor: any) => {
      try {
        return origRegister(name, ctor);
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (msg.includes("already has a handler") || msg.includes("already has a plugin")) return;
        throw err;
      }
    };
    w.__aikaPixiRegisterPatched = true;
  }

  if (!w.__aikaLive2DScriptPromise) {
    w.__aikaLive2DScriptPromise = loadScriptOnce("/vendor/cubism4.min.js", "PIXI.live2d");
  }
  await w.__aikaLive2DScriptPromise;
  const Live2DModel = w.PIXI?.live2d?.Live2DModel;
  if (!Live2DModel) throw new Error("live2d_model_unavailable");
  return { PIXI, Live2DModel };
}

function loadScriptOnce(src: string, globalName: string) {
  const w = window as any;
  if (globalName && resolveGlobal(globalName, w)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.scripts).find(s => s.src.includes(src));
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`load_failed:${src}`)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`load_failed:${src}`));
    document.head.appendChild(script);
  });
}

function resolveGlobal(path: string, root: any) {
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), root);
}
