import type { AvatarEngine, AvatarMood } from "./AvatarEngine";

type MoodMap = Record<AvatarMood, string | number>;

export class Live2DWebEngine implements AvatarEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private model: any = null;
  private moodMap: MoodMap;
  private isTalking = false;
  private talkIntensity = 0.5;
  private isListening = false;
  private idleEnabled = true;
  private rafId: number | null = null;

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
    this.gl = this.canvas.getContext("webgl");
    if (!this.gl) throw new Error("webgl_not_supported");

    const w = window as any;
    const Cubism = w?.Live2DCubismFramework || w?.Cubism || w?.Live2D;
    if (!Cubism) {
      throw new Error("live2d_sdk_missing");
    }

    // This is a minimal integration shell. Wire your Cubism SDK loader here.
    // Expecting a model3.json (Cubism 4) entry at modelUrl.
    this.model = await Cubism.loadModel?.(modelUrl, this.gl);
    if (!this.model) throw new Error("live2d_model_load_failed");

    this.startLoop();
  }

  setMood(mood: AvatarMood): void {
    const expression = this.moodMap[mood] ?? "neutral";
    if (this.model?.setExpression) {
      this.model.setExpression(expression);
    } else if (this.model?.setExpressionByName) {
      this.model.setExpressionByName(expression);
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
  }

  resize(width: number, height: number): void {
    this.canvas.width = Math.max(1, Math.floor(width));
    this.canvas.height = Math.max(1, Math.floor(height));
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.model?.destroy) this.model.destroy();
    this.model = null;
  }

  private startLoop() {
    const tick = () => {
      if (!this.gl || !this.model) return;

      // Basic auto-updates: eye blink + breath typically handled inside the SDK.
      if (this.model?.setParameterValueById) {
        const mouth = this.isTalking ? this.talkIntensity : 0;
        this.model.setParameterValueById("ParamMouthOpenY", mouth);
        this.model.setParameterValueById("ParamEyeBallX", this.isListening ? 0.2 : 0);
      }

      if (this.model?.update) this.model.update();
      if (this.model?.draw) this.model.draw(this.gl);

      if (this.idleEnabled) this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }
}
