export type Mood =
  | "neutral"
  | "happy"
  | "teasing"
  | "thinking"
  | "concerned"
  | "surprised";

export type AvatarLipsyncCue = {
  time: number;
  duration: number;
  blendshapes: Record<string, number>;
  phoneme?: string;
};

export type AvatarLipsyncSequence = {
  sequences: AvatarLipsyncCue[];
  totalDuration: number;
  interpolationMethod?: string;
  fallbackMethod?: string;
};

export interface AvatarEngine {
  load(modelUrl: string): Promise<void>;
  setMood(mood: Mood): void;
  setTalking(isTalking: boolean, intensity?: number): void;
  setLipSyncSequence?(sequence: AvatarLipsyncSequence | null, startedAtMs?: number): void;
  setListening(isListening: boolean): void;
  setIdle(enabled: boolean): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
