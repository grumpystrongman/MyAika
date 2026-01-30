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

    const [{ Application }, { Live2DModel }] = await Promise.all([
      import("pixi.js"),
      import("pixi-live2d-display/cubism4")
    ]);

    this.app = new Application({
      view: this.canvas,
      autoStart: true,
      backgroundAlpha: 0
    });

    this.model = await Live2DModel.from(modelUrl);
    this.app.stage.addChild(this.model);
    this.layoutModel();

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
  }

  private layoutModel() {
    if (!this.app || !this.model) return;
    const width = this.app.renderer?.width || this.canvas.clientWidth || 1;
    const height = this.app.renderer?.height || this.canvas.clientHeight || 1;
    const bounds = this.model.getBounds();
    const scale = Math.min(width / (bounds.width || 1), height / (bounds.height || 1)) * 0.95;
    this.model.scale.set(scale);
    this.model.x = width * 0.5;
    this.model.y = height * 0.98;
    this.model.pivot.set(bounds.width / 2, bounds.height);
  }
}
