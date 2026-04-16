import type { AvatarEngine, AvatarLipsyncSequence, Mood } from "./AvatarEngine";

const SKIN = "#f2e6e2";
const SKIN_SHADOW = "rgba(64, 36, 48, 0.24)";
const HAIR = "#0b0a0e";
const HAIR_SHEEN = "rgba(117, 89, 99, 0.24)";
const LIP = "#7f1024";
const LINER = "#07070b";
const GLOW = "rgba(139, 25, 49, 0.2)";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class CinematicAvatarEngine implements AvatarEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private mood: Mood = "neutral";
  private isTalking = false;
  private talkIntensity = 0.5;
  private isListening = false;
  private idleEnabled = true;
  private frameId: number | null = null;
  private nextBlinkAt = 0;
  private blinkAmount = 0;
  private nextGazeAt = 0;
  private gazeX = 0;
  private gazeY = 0;
  private targetGazeX = 0;
  private targetGazeY = 0;
  private idleSeed = Math.random() * 1000;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_context_unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.resize(canvas.clientWidth || 320, canvas.clientHeight || 480);
  }

  async load(_modelUrl: string): Promise<void> {
    return;
  }

  setMood(mood: Mood): void {
    this.mood = mood;
  }

  setTalking(isTalking: boolean, intensity = 0.5): void {
    this.isTalking = isTalking;
    this.talkIntensity = clamp(intensity, 0, 1);
  }

  setLipSyncSequence(_sequence: AvatarLipsyncSequence | null, _startedAtMs = 0): void {
    return;
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
    const clampedWidth = Math.max(1, Math.floor(width));
    const clampedHeight = Math.max(1, Math.floor(height));
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = clampedWidth * this.dpr;
    this.canvas.height = clampedHeight * this.dpr;
    this.canvas.style.width = `${clampedWidth}px`;
    this.canvas.style.height = `${clampedHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = clampedWidth;
    this.height = clampedHeight;
    this.draw(performance.now());
  }

  destroy(): void {
    this.stopLoop();
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  private startLoop(): void {
    if (this.frameId !== null) return;
    const loop = (timestamp: number) => {
      this.draw(timestamp);
      this.frameId = window.requestAnimationFrame(loop);
    };
    this.frameId = window.requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private updateMicroMotion(t: number): void {
    if (this.nextBlinkAt <= t) {
      this.nextBlinkAt = t + 2.5 + Math.random() * 3.4;
    }

    const blinkPhase = this.nextBlinkAt - t;
    if (blinkPhase < 0.16) {
      this.blinkAmount = clamp(1 - Math.abs(blinkPhase - 0.08) / 0.08, 0, 1);
    } else {
      this.blinkAmount = 0;
    }

    if (this.nextGazeAt <= t) {
      this.nextGazeAt = t + 2.2 + Math.random() * 3.5;
      const rangeX = this.isListening ? 0.33 : 0.22;
      const rangeY = this.isListening ? 0.16 : 0.1;
      this.targetGazeX = (Math.random() * 2 - 1) * rangeX;
      this.targetGazeY = (Math.random() * 2 - 1) * rangeY;
    }

    this.gazeX += (this.targetGazeX - this.gazeX) * 0.04;
    this.gazeY += (this.targetGazeY - this.gazeY) * 0.05;
  }

  private draw(timestamp: number): void {
    if (!this.idleEnabled || this.width === 0 || this.height === 0) return;

    const t = timestamp / 1000;
    this.updateMicroMotion(t);

    const breath = Math.sin(t * 1.05 + this.idleSeed) * 3.6;
    const shoulder = Math.sin(t * 0.6 + this.idleSeed * 0.4) * 1.8;
    const headTurn = (Math.sin(t * 0.35 + this.idleSeed) * 0.03) + this.gazeX * 0.03;
    const headTilt = Math.sin(t * 0.55 + this.idleSeed * 0.7) * 0.015;

    const centerX = this.width * 0.5;
    const centerY = this.height * 0.55 + breath;
    const headX = this.width * 0.22;
    const headY = this.height * 0.3;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(t);
    this.drawAura(centerX, centerY - headY * 0.28, headX * 1.4);
    this.drawGarment(centerX, centerY + headY * 0.72 + shoulder, headX * 1.48, headY * 1.18);

    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate(headTilt);
    this.ctx.translate(headTurn * this.width, 0);

    this.drawHair(0, -headY * 0.08, headX, headY);
    this.drawFace(0, 0, headX, headY, t);
    this.drawNecklace(0, headY * 0.58, headX * 0.58);
    this.ctx.restore();

    if (this.isListening) {
      this.drawListeningGlow(centerX, centerY - headY * 0.1, headX * 1.34, t);
    }
  }

  private drawBackground(t: number): void {
    const { ctx, width, height } = this;

    const base = ctx.createRadialGradient(width * 0.5, height * 0.34, width * 0.08, width * 0.5, height * 0.48, width * 0.92);
    base.addColorStop(0, "#1d151b");
    base.addColorStop(0.46, "#0c0a10");
    base.addColorStop(1, "#050407");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const haze = ctx.createLinearGradient(0, 0, width, height);
    haze.addColorStop(0, "rgba(127, 16, 36, 0.08)");
    haze.addColorStop(0.45, "rgba(17, 12, 20, 0)");
    haze.addColorStop(1, "rgba(74, 22, 45, 0.1)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 4; i += 1) {
      const radius = width * (0.28 + i * 0.09);
      const pulse = 0.6 + Math.sin(t * 0.3 + i) * 0.4;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.35, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(188, 151, 163, ${0.05 * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, width * 0.78);
    vignette.addColorStop(0.66, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.68)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  private drawAura(x: number, y: number, radius: number): void {
    const { ctx } = this;
    const aura = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
    aura.addColorStop(0, "rgba(167, 34, 70, 0.2)");
    aura.addColorStop(0.6, "rgba(70, 20, 40, 0.08)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGarment(x: number, y: number, width: number, height: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-width * 0.9, 0);
    ctx.quadraticCurveTo(-width * 0.62, -height * 0.08, -width * 0.54, -height * 0.67);
    ctx.lineTo(-width * 0.36, -height * 0.98);
    ctx.quadraticCurveTo(-width * 0.06, -height * 1.14, 0, -height * 1.04);
    ctx.quadraticCurveTo(width * 0.06, -height * 1.14, width * 0.36, -height * 0.98);
    ctx.lineTo(width * 0.54, -height * 0.67);
    ctx.quadraticCurveTo(width * 0.62, -height * 0.08, width * 0.9, 0);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(-width, 0, width, height);
    gradient.addColorStop(0, "#0a080b");
    gradient.addColorStop(0.5, "#161018");
    gradient.addColorStop(1, "#060508");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = "rgba(120, 71, 84, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawHair(x: number, y: number, headRadiusX: number, headRadiusY: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    const sway = Math.sin(performance.now() / 1200 + this.idleSeed) * 0.04;
    const hairPath = new Path2D();
    hairPath.moveTo(-headRadiusX * 0.96, -headRadiusY * 0.22);
    hairPath.quadraticCurveTo(-headRadiusX * 1.28, -headRadiusY * 0.64, -headRadiusX * 1.06, headRadiusY * 0.58);
    hairPath.quadraticCurveTo(-headRadiusX * 0.92, headRadiusY * 1.04, -headRadiusX * 0.2, headRadiusY * 1.01);
    hairPath.quadraticCurveTo(-headRadiusX * 0.06, headRadiusY * 0.7, 0, headRadiusY * 0.82);
    hairPath.quadraticCurveTo(headRadiusX * 0.28, headRadiusY * 1.02, headRadiusX * 0.94, headRadiusY * 0.54);
    hairPath.quadraticCurveTo(headRadiusX * 1.24, -headRadiusY * 0.66, headRadiusX * 0.88, -headRadiusY * 0.22 + sway * headRadiusY);
    hairPath.closePath();

    ctx.fillStyle = HAIR;
    ctx.fill(hairPath);

    ctx.save();
    ctx.clip(hairPath);
    const sheen = ctx.createLinearGradient(-headRadiusX, -headRadiusY, headRadiusX, headRadiusY);
    sheen.addColorStop(0, "transparent");
    sheen.addColorStop(0.58, HAIR_SHEEN);
    sheen.addColorStop(1, "transparent");
    ctx.fillStyle = sheen;
    ctx.fillRect(-headRadiusX * 1.1, -headRadiusY * 1.1, headRadiusX * 2.2, headRadiusY * 2.3);
    ctx.restore();

    ctx.restore();
  }

  private getExpression() {
    const expression = {
      eyeOpenness: 0.34,
      mouthCurve: 0,
      mouthOpen: 0.07,
      browAngle: -0.06,
      irisGlow: "rgba(230, 217, 220, 0.9)"
    };

    switch (this.mood) {
      case "happy":
        expression.eyeOpenness = 0.39;
        expression.mouthCurve = 0.16;
        expression.mouthOpen = 0.08;
        expression.browAngle = -0.12;
        expression.irisGlow = "rgba(244, 220, 201, 0.9)";
        break;
      case "thinking":
        expression.eyeOpenness = 0.29;
        expression.mouthCurve = -0.04;
        expression.mouthOpen = 0.1;
        expression.browAngle = 0.08;
        break;
      case "concerned":
        expression.eyeOpenness = 0.27;
        expression.mouthCurve = -0.16;
        expression.mouthOpen = 0.06;
        expression.browAngle = 0.18;
        expression.irisGlow = "rgba(205, 164, 174, 0.88)";
        break;
      case "surprised":
        expression.eyeOpenness = 0.47;
        expression.mouthCurve = 0.01;
        expression.mouthOpen = 0.21;
        expression.browAngle = -0.26;
        expression.irisGlow = "rgba(240, 230, 246, 0.94)";
        break;
      default:
        break;
    }

    const talkingBoost = this.isTalking ? clamp(this.talkIntensity * 0.34, 0.05, 0.32) : 0;
    const mouthPulse = this.isTalking
      ? Math.abs(Math.sin(performance.now() / 70)) * 0.2
      : Math.abs(Math.sin(performance.now() / 420)) * 0.04;

    expression.mouthOpen = clamp(expression.mouthOpen + talkingBoost + mouthPulse, 0.04, 0.74);
    return expression;
  }

  private drawFace(x: number, y: number, headRadiusX: number, headRadiusY: number, t: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    const facePath = new Path2D();
    facePath.ellipse(0, 0, headRadiusX, headRadiusY, 0, 0, Math.PI * 2);

    const faceGradient = ctx.createRadialGradient(-headRadiusX * 0.2, -headRadiusY * 0.25, headRadiusX * 0.2, 0, headRadiusY * 0.2, headRadiusX * 1.3);
    faceGradient.addColorStop(0, "#fbf4f1");
    faceGradient.addColorStop(0.52, SKIN);
    faceGradient.addColorStop(1, "#d5c3be");

    ctx.fillStyle = faceGradient;
    ctx.fill(facePath);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = headRadiusX * 0.18;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.ellipse(-headRadiusX * 0.22, -headRadiusY * 0.12, headRadiusX * 0.3, headRadiusY * 0.2, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const expression = this.getExpression();
    const eyeY = -headRadiusY * 0.16;
    const eyeSpacing = headRadiusX * 0.62;
    const eyeWidth = headRadiusX * 0.24;
    const eyeHeight = headRadiusY * expression.eyeOpenness * (1 - this.blinkAmount * 0.86);

    this.drawEye(-eyeSpacing * 0.5, eyeY, eyeWidth, eyeHeight, expression.irisGlow);
    this.drawEye(eyeSpacing * 0.5, eyeY, eyeWidth, eyeHeight, expression.irisGlow);
    this.drawBrows(expression.browAngle);
    this.drawNose(headRadiusX * 0.07, headRadiusY * 0.1);
    this.drawMouth(expression.mouthCurve, expression.mouthOpen, headRadiusX, headRadiusY);

    ctx.save();
    ctx.fillStyle = SKIN_SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, headRadiusY * 0.92, headRadiusX * 0.72, headRadiusY * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (this.isTalking) {
      const sparkle = 0.1 + Math.sin(t * 8) * 0.08;
      ctx.beginPath();
      ctx.arc(0, -headRadiusY * 0.58, headRadiusX * 1.02, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 136, 150, ${clamp(sparkle, 0.04, 0.2)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawEye(cx: number, cy: number, width: number, height: number, glow: string): void {
    const { ctx } = this;
    const open = Math.max(0.05, height);

    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    ctx.ellipse(0, 0, width, open, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f6efec";
    ctx.fill();

    const irisX = this.gazeX * width * 0.3;
    const irisY = this.gazeY * open * 0.5;

    ctx.beginPath();
    ctx.ellipse(irisX, irisY, width * 0.5, open * 0.58, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#2a1b25";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(irisX * 0.95, irisY * 0.92, width * 0.22, open * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#a88e98";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(irisX - width * 0.1, irisY - open * 0.18, width * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();

    if (this.isListening) {
      ctx.beginPath();
      ctx.arc(0, 0, width * 0.34, 0, Math.PI * 2);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(-width * 1.05, 0);
    ctx.quadraticCurveTo(0, -open * 1.05, width * 1.05, 0);
    ctx.strokeStyle = LINER;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  private drawBrows(browAngle: number): void {
    const { ctx } = this;
    const browY = -this.height * 0.055;
    const browWidth = this.width * 0.16;
    const leftX = this.width * 0.5 - this.width * 0.24;
    const rightX = this.width * 0.5 + this.width * 0.24;

    ctx.save();
    ctx.strokeStyle = "rgba(14, 10, 14, 0.95)";
    ctx.lineWidth = this.width * 0.016;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(leftX - browWidth * 0.36, browY);
    ctx.quadraticCurveTo(leftX, browY + browWidth * browAngle, leftX + browWidth * 0.34, browY - browWidth * 0.06);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rightX + browWidth * 0.36, browY);
    ctx.quadraticCurveTo(rightX, browY - browWidth * browAngle, rightX - browWidth * 0.34, browY - browWidth * 0.06);
    ctx.stroke();

    ctx.restore();
  }

  private drawMouth(curve: number, openness: number, headRadiusX: number, headRadiusY: number): void {
    const { ctx } = this;
    const mouthY = this.height * 0.5 + headRadiusY * 0.36;
    const mouthWidth = headRadiusX * 0.58;
    const mouthHeight = headRadiusY * 0.24;
    const mouthOpen = clamp(openness, 0.03, 0.8) * mouthHeight;

    ctx.save();
    ctx.translate(this.width * 0.5, mouthY);

    ctx.beginPath();
    ctx.moveTo(-mouthWidth, 0);
    ctx.quadraticCurveTo(0, mouthHeight * curve, mouthWidth, 0);
    ctx.strokeStyle = LIP;
    ctx.lineWidth = this.width * 0.013;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-mouthWidth * 0.82, 0);
    ctx.quadraticCurveTo(0, -mouthHeight * 0.2, mouthWidth * 0.82, 0);
    ctx.strokeStyle = "rgba(127, 16, 36, 0.75)";
    ctx.lineWidth = this.width * 0.007;
    ctx.stroke();

    if (mouthOpen > 0.02) {
      ctx.beginPath();
      ctx.ellipse(0, mouthOpen * 0.34, mouthWidth * 0.36, mouthOpen * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(103, 13, 30, 0.92)";
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(0, mouthOpen * 0.08, mouthWidth * 0.24, mouthOpen * 0.42, 0, 0, Math.PI);
      ctx.fillStyle = "rgba(232, 174, 169, 0.86)";
      ctx.fill();
    }

    ctx.restore();
  }

  private drawNose(offsetX: number, offsetY: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(this.width * 0.5, this.height * 0.5 - offsetY * 0.45);
    ctx.strokeStyle = "rgba(31, 20, 27, 0.62)";
    ctx.lineWidth = this.width * 0.007;
    ctx.beginPath();
    ctx.moveTo(0, -offsetY * 0.58);
    ctx.quadraticCurveTo(-offsetX * 0.28, 0, 0, offsetY);
    ctx.stroke();
    ctx.restore();
  }

  private drawNecklace(x: number, y: number, radius: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI * 0.06, Math.PI * 0.94);
    ctx.strokeStyle = "rgba(173, 142, 156, 0.76)";
    ctx.lineWidth = radius * 0.08;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, radius * 0.1);
    ctx.lineTo(-radius * 0.12, radius * 0.28);
    ctx.lineTo(0, radius * 0.44);
    ctx.lineTo(radius * 0.12, radius * 0.28);
    ctx.closePath();
    ctx.fillStyle = "rgba(127, 16, 36, 0.9)";
    ctx.fill();

    ctx.restore();
  }

  private drawListeningGlow(x: number, y: number, radius: number, t: number): void {
    const { ctx } = this;
    ctx.save();
    const pulse = Math.sin(t * 4.2) * 0.5 + 0.5;
    ctx.strokeStyle = `rgba(123, 182, 219, ${0.14 + pulse * 0.16})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(x, y, radius * (0.96 + pulse * 0.02), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
