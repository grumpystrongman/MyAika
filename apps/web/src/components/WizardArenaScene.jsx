import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const DEFAULT_PALETTE = {
  fog: 0x070b13,
  key: 0x6ac6ff,
  rim: 0xff9a5e,
  ambient: 0x7d94c7
};

export default function WizardArenaScene({
  pulse = "idle",
  palette = DEFAULT_PALETTE,
  cinematicIntensity = 0.78
}) {
  const [fallbackMode, setFallbackMode] = useState(false);
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(0);
  const pulseRef = useRef(pulse);
  const paletteRef = useRef(DEFAULT_PALETTE);
  const intensityRef = useRef(0.78);

  useEffect(() => {
    pulseRef.current = pulse;
  }, [pulse]);

  useEffect(() => {
    const value = Number(cinematicIntensity);
    intensityRef.current = Number.isFinite(value)
      ? Math.max(0.2, Math.min(1.2, value))
      : 0.78;
  }, [cinematicIntensity]);

  useEffect(() => {
    paletteRef.current = {
      fog: Number(palette?.fog) || DEFAULT_PALETTE.fog,
      key: Number(palette?.key) || DEFAULT_PALETTE.key,
      rim: Number(palette?.rim) || DEFAULT_PALETTE.rim,
      ambient: Number(palette?.ambient) || DEFAULT_PALETTE.ambient
    };
  }, [palette]);

  useEffect(() => {
    if (fallbackMode) return undefined;
    const host = mountRef.current;
    if (!host) return;

    try {
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(paletteRef.current.fog, 0.08);
      const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
      camera.position.set(0, 2.6, 4.3);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      rendererRef.current = renderer;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);

      const onContextLost = ev => {
        ev.preventDefault?.();
        setFallbackMode(true);
      };
      renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);

      const ambient = new THREE.AmbientLight(paletteRef.current.ambient, 0.35);
      scene.add(ambient);

      const keyLight = new THREE.PointLight(paletteRef.current.key, 1.2, 12, 2);
      keyLight.position.set(-2.2, 2.6, 1.6);
      scene.add(keyLight);

      const rimLight = new THREE.PointLight(paletteRef.current.rim, 0.9, 12, 2);
      rimLight.position.set(2.4, 1.7, -1.8);
      scene.add(rimLight);

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(2.25, 2.6, 0.55, 48),
        new THREE.MeshStandardMaterial({
          color: 0x131726,
          roughness: 0.84,
          metalness: 0.18
        })
      );
      pedestal.position.y = -0.45;
      scene.add(pedestal);

      const runeRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.56, 0.09, 28, 120),
        new THREE.MeshStandardMaterial({
          color: 0x67d3ff,
          emissive: 0x215486,
          emissiveIntensity: 0.8,
          roughness: 0.26,
          metalness: 0.9
        })
      );
      runeRing.rotation.x = Math.PI / 2;
      runeRing.position.y = -0.16;
      scene.add(runeRing);

      const crown = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.72, 0.2, 180, 32),
        new THREE.MeshStandardMaterial({
          color: 0x7ac8ff,
          emissive: 0x2a4f8a,
          emissiveIntensity: 0.7,
          roughness: 0.25,
          metalness: 0.78
        })
      );
      crown.position.y = 0.55;
      crown.rotation.x = 0.28;
      scene.add(crown);

      const sparksGeometry = new THREE.BufferGeometry();
      const sparkCount = 220;
      const sparkPositions = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i += 1) {
        const radius = 1.15 + Math.random() * 1.85;
        const angle = Math.random() * Math.PI * 2;
        sparkPositions[i * 3] = Math.cos(angle) * radius;
        sparkPositions[i * 3 + 1] = -0.3 + Math.random() * 1.8;
        sparkPositions[i * 3 + 2] = Math.sin(angle) * radius;
      }
      sparksGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
      const sparks = new THREE.Points(
        sparksGeometry,
        new THREE.PointsMaterial({
          color: 0x9ddaff,
          size: 0.028,
          transparent: true,
          opacity: 0.55
        })
      );
      scene.add(sparks);

      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 40, 40),
        new THREE.MeshBasicMaterial({
          color: 0x50b8ff,
          transparent: true,
          opacity: 0.1
        })
      );
      aura.position.y = 0.58;
      scene.add(aura);

      function resize() {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }

      function animate() {
        const now = performance.now() * 0.001;
        const pulseState = pulseRef.current;
        const activePalette = paletteRef.current;
        const baseIntensity = 0.7 + intensityRef.current * 0.65;
        const captureBoost = pulseState === "capture" ? 1.35 : 1;
        const checkBoost = pulseState === "check" ? 1.5 : 1;
        const winBoost = pulseState === "checkmate" ? 1.8 : 1;
        const intensity = Math.max(captureBoost, checkBoost, winBoost) * baseIntensity;

        if (scene.fog) {
          scene.fog.color.setHex(activePalette.fog);
        }
        ambient.color.setHex(activePalette.ambient);
        keyLight.color.setHex(activePalette.key);
        rimLight.color.setHex(activePalette.rim);

        crown.rotation.y = now * 0.24 * intensity;
        crown.rotation.z = Math.sin(now * 0.7) * (0.16 + 0.08 * baseIntensity);
        crown.position.y = 0.55 + Math.sin(now * 1.18) * (0.06 + 0.06 * baseIntensity);

        runeRing.rotation.z = now * 0.1 * intensity;
        runeRing.material.emissiveIntensity = 0.58 + Math.sin(now * 2.2) * 0.22 * intensity;
        aura.scale.setScalar(1 + Math.sin(now * 1.8) * (0.02 + 0.03 * baseIntensity) * intensity);
        aura.material.opacity = 0.08 + Math.sin(now * 1.4) * (0.02 + 0.02 * baseIntensity) * intensity;
        sparks.rotation.y = -now * 0.05 * intensity;
        keyLight.intensity = 1.05 + Math.sin(now * 2.1) * 0.18 * intensity;
        rimLight.intensity = 0.82 + Math.cos(now * 1.7) * 0.2 * intensity;
        camera.position.x = Math.sin(now * 0.28) * (0.06 * baseIntensity);
        camera.position.y = 2.58 + Math.cos(now * 0.22) * (0.03 * baseIntensity);

        renderer.render(scene, camera);
        frameRef.current = window.requestAnimationFrame(animate);
      }

      resize();
      animate();
      window.addEventListener("resize", resize);

      return () => {
        window.removeEventListener("resize", resize);
        if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
        renderer.domElement.removeEventListener("webglcontextlost", onContextLost, false);
        if (rendererRef.current) {
          rendererRef.current.dispose();
        }
        scene.traverse(object => {
          if (object.geometry) object.geometry.dispose?.();
          if (object.material) {
            if (Array.isArray(object.material)) object.material.forEach(item => item.dispose?.());
            else object.material.dispose?.();
          }
        });
        if (renderer.domElement?.parentNode === host) host.removeChild(renderer.domElement);
      };
    } catch {
      setFallbackMode(true);
      return undefined;
    }
  }, [fallbackMode]);

  if (fallbackMode) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(320px 200px at 50% 65%, rgba(111, 194, 255, 0.15), transparent 72%), radial-gradient(240px 170px at 52% 40%, rgba(139, 118, 255, 0.12), transparent 72%), linear-gradient(180deg, rgba(10, 12, 20, 0.82), rgba(8, 12, 20, 0.94))"
        }}
      />
    );
  }

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}
