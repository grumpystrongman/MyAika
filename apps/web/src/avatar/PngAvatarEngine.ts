import type { AvatarEngine, Mood } from "./AvatarEngine";

type PngMoodFrames = Partial<Record<Mood, string[]>>;

export type PngAvatarSet = {
  basePath?: string;
  moods?: PngMoodFrames;
  frameMs?: number;
};

export class PngAvatarEngine implements AvatarEngine {
  private container: HTMLElement;
  private img: HTMLImageElement;
  private mood: Mood = "neutral";
  private isTalking = false;
  private isListening = false;
  private idleEnabled = true;
  private defaultUrl: string;
  private basePath: string;
  private framesByMood: Record<Mood, string[]>;
  private frameMs: number;
  private frameTimer: number | null = null;
  private frameIndex = 0;

  constructor(container: HTMLElement, imageUrl: string, set?: PngAvatarSet) {
    this.container = container;
    this.defaultUrl = imageUrl;
    this.basePath = normalizeBasePath(set?.basePath || inferBasePath(imageUrl));
    this.framesByMood = buildFramesByMood(set?.moods, this.basePath);
    this.frameMs = Number.isFinite(set?.frameMs) ? Math.max(80, Number(set?.frameMs)) : 240;
    this.img = document.createElement("img");
    this.img.src = this.resolveFrameUrl(this.mood) || imageUrl;
    this.img.alt = "Aika avatar";
    this.img.style.width = "100%";
    this.img.style.height = "auto";
    this.img.style.display = "block";
    this.img.style.borderRadius = "20px";
    this.img.style.boxShadow = "0 18px 60px rgba(0,0,0,0.18)";
    this.container.innerHTML = "";
    this.container.appendChild(this.img);
    this.restartAnimation();
  }

  async load(_modelUrl?: string): Promise<void> {
    return;
  }

  setMood(mood: Mood): void {
    this.mood = mood;
    this.frameIndex = 0;
    this.applyFrame();
    this.restartAnimation();
    this.updateStyle();
  }

  setTalking(isTalking: boolean): void {
    this.isTalking = isTalking;
    this.restartAnimation();
    this.updateStyle();
  }

  setListening(isListening: boolean): void {
    this.isListening = isListening;
    this.restartAnimation();
    this.updateStyle();
  }

  setIdle(enabled: boolean): void {
    this.idleEnabled = enabled;
    this.restartAnimation();
    this.updateStyle();
  }

  resize(): void {
    // no-op for img
  }

  destroy(): void {
    if (this.frameTimer) {
      window.clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
    this.container.innerHTML = "";
  }

  private resolveFrameUrl(mood: Mood): string {
    const frames = this.framesByMood[mood] || [];
    if (frames.length > 0) return frames[0];
    return this.defaultUrl;
  }

  private getCurrentFrames(): string[] {
    const frames = this.framesByMood[this.mood] || [];
    if (frames.length) return frames;
    return this.defaultUrl ? [this.defaultUrl] : [];
  }

  private applyFrame() {
    const frames = this.getCurrentFrames();
    if (!frames.length) return;
    const index = Math.max(0, Math.min(frames.length - 1, this.frameIndex));
    const next = frames[index];
    if (next && this.img.src !== next) {
      this.img.src = next;
    }
  }

  private getFrameIntervalMs() {
    const base = this.frameMs;
    if (this.isTalking) return Math.max(80, Math.round(base * 0.6));
    if (this.isListening) return Math.max(100, Math.round(base * 0.8));
    return base;
  }

  private restartAnimation() {
    if (this.frameTimer) {
      window.clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
    if (!this.idleEnabled) return;
    const frames = this.getCurrentFrames();
    if (frames.length <= 1) return;
    const interval = this.getFrameIntervalMs();
    this.frameTimer = window.setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % frames.length;
      this.applyFrame();
    }, interval);
  }

  private updateStyle() {
    const scale = this.isTalking ? 1.02 : 1;
    const ring = this.isListening ? "0 0 0 2px rgba(16,185,129,0.5)" : "none";
    const float = this.idleEnabled ? "translateY(-2px)" : "translateY(0px)";
    this.img.style.transform = `${float} scale(${scale})`;
    this.img.style.transition = "transform 120ms ease";
    this.img.style.outline = ring;
  }
}

function buildFramesByMood(moods: PngMoodFrames | undefined, basePath: string) {
  const result: Record<Mood, string[]> = {
    neutral: [],
    happy: [],
    thinking: [],
    concerned: [],
    surprised: []
  };
  if (!moods || typeof moods !== "object") return result;
  (Object.keys(result) as Mood[]).forEach(mood => {
    const frames = Array.isArray(moods[mood]) ? moods[mood] : [];
    result[mood] = frames
      .map(frame => resolveFrameUrl(basePath, frame))
      .filter(Boolean);
  });
  return result;
}

function resolveFrameUrl(basePath: string, frame: string) {
  const value = String(frame || "").trim();
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith("data:") || value.startsWith("http")) return value;
  if (!basePath) return value;
  return `${basePath}/${value}`;
}

function normalizeBasePath(pathValue: string) {
  const value = String(pathValue || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function inferBasePath(url: string) {
  const value = String(url || "");
  const idx = value.lastIndexOf("/");
  if (idx === -1) return "";
  return value.slice(0, idx);
}
