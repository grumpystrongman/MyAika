import type { AvatarEngine, Mood } from "./AvatarEngine";

export class PngAvatarEngine implements AvatarEngine {
  private container: HTMLElement;
  private img: HTMLImageElement;
  private mood: Mood = "neutral";
  private isTalking = false;
  private isListening = false;
  private idleEnabled = true;

  constructor(container: HTMLElement, imageUrl: string) {
    this.container = container;
    this.img = document.createElement("img");
    this.img.src = imageUrl;
    this.img.alt = "Aika avatar";
    this.img.style.width = "100%";
    this.img.style.height = "auto";
    this.img.style.display = "block";
    this.img.style.borderRadius = "20px";
    this.img.style.boxShadow = "0 18px 60px rgba(0,0,0,0.18)";
    this.container.innerHTML = "";
    this.container.appendChild(this.img);
  }

  async load(_modelUrl?: string): Promise<void> {
    return;
  }

  setMood(mood: Mood): void {
    this.mood = mood;
    this.updateStyle();
  }

  setTalking(isTalking: boolean): void {
    this.isTalking = isTalking;
    this.updateStyle();
  }

  setListening(isListening: boolean): void {
    this.isListening = isListening;
    this.updateStyle();
  }

  setIdle(enabled: boolean): void {
    this.idleEnabled = enabled;
    this.updateStyle();
  }

  resize(): void {
    // no-op for img
  }

  destroy(): void {
    this.container.innerHTML = "";
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
