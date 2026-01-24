export function getCubismRuntime() {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.Live2DCubismFramework || w.Cubism || w.Live2D || null;
}
