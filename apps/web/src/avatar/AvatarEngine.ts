export type AvatarMood =
  | "neutral"
  | "happy"
  | "thinking"
  | "concerned"
  | "surprised";

export interface AvatarEngine {
  load(modelUrl: string): Promise<void>;
  setMood(mood: AvatarMood): void;
  setTalking(isTalking: boolean, intensity?: number): void;
  setListening(isListening: boolean): void;
  setIdle(enabled: boolean): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
