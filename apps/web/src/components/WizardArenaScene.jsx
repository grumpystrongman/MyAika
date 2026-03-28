import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const DEFAULT_PALETTE = {
  fog: 0x070b13,
  key: 0x6ac6ff,
  rim: 0xff9a5e,
  ambient: 0x7d94c7
};

const ACTION_BY_PIECE = {
  p: "thrust",
  n: "slash",
  b: "prayer",
  r: "smash",
  q: "cast",
  k: "command"
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + ((b - a) * t);
}

function safeHexColor(value, fallbackHex) {
  try {
    return new THREE.Color(String(value || "")).getHex();
  } catch {
    return fallbackHex;
  }
}

function createFighter({ side = "attacker", base = 0x8db5ff, accent = 0x9de4ff }) {
  const root = new THREE.Group();
  root.position.set(side === "attacker" ? -1.45 : 1.45, -0.32, 0);

  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.22;
  root.add(bodyPivot);

  const matte = new THREE.MeshStandardMaterial({
    color: base,
    roughness: 0.62,
    metalness: 0.42
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x2b303a,
    roughness: 0.26,
    metalness: 0.88
  });
  const glow = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.3,
    transparent: true,
    opacity: 0.75
  });

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.44, 0.14, 28),
    metal
  );
  pedestal.position.y = 0.06;
  root.add(pedestal);

  const boots = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.08, 0.24),
    metal
  );
  boots.position.y = 0.14;
  bodyPivot.add(boots);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 0.38, 6, 12),
    matte
  );
  torso.position.y = 0.43;
  bodyPivot.add(torso);

  const shoulderPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.12, 18),
    metal
  );
  shoulderPlate.position.y = 0.62;
  bodyPivot.add(shoulderPlate);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 14, 14),
    matte
  );
  head.position.y = 0.77;
  bodyPivot.add(head);

  const helm = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.16, 12),
    metal
  );
  helm.position.y = 0.88;
  bodyPivot.add(helm);

  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(0.095, 0.015, 8, 18),
    glow
  );
  crown.position.y = 0.92;
  crown.rotation.x = Math.PI / 2;
  bodyPivot.add(crown);

  const mitre = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.22, 8),
    matte
  );
  mitre.position.y = 0.94;
  bodyPivot.add(mitre);

  const rookCrest = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.13, 0.15),
    metal
  );
  rookCrest.position.y = 0.94;
  bodyPivot.add(rookCrest);

  const armL = new THREE.Group();
  armL.position.set(-0.14, 0.58, 0);
  bodyPivot.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.14, 0.58, 0);
  bodyPivot.add(armR);

  const leftUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 6, 8), matte);
  leftUpperArm.rotation.z = 0.1;
  armL.add(leftUpperArm);

  const rightUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 6, 8), matte);
  rightUpperArm.rotation.z = -0.1;
  armR.add(rightUpperArm);

  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.035, 20),
    metal
  );
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.02, -0.16, 0.09);
  armL.add(shield);

  const weaponGrip = new THREE.Group();
  weaponGrip.position.set(0, -0.16, 0);
  armR.add(weaponGrip);

  const swordBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.34, 0.04),
    metal
  );
  swordBlade.position.y = -0.23;
  weaponGrip.add(swordBlade);

  const maceHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 10),
    metal
  );
  maceHead.position.y = -0.34;
  weaponGrip.add(maceHead);

  const staff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.44, 12),
    matte
  );
  staff.position.y = -0.24;
  weaponGrip.add(staff);

  const staffOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 10),
    glow
  );
  staffOrb.position.y = -0.46;
  weaponGrip.add(staffOrb);

  const prayerHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.012, 10, 20),
    glow
  );
  prayerHalo.position.y = 0.98;
  prayerHalo.rotation.x = Math.PI / 2;
  bodyPivot.add(prayerHalo);

  const legL = new THREE.Group();
  legL.position.set(-0.07, 0.28, 0);
  bodyPivot.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.07, 0.28, 0);
  bodyPivot.add(legR);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 6, 8), matte);
  leftLeg.rotation.z = 0.04;
  legL.add(leftLeg);
  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 6, 8), matte);
  rightLeg.rotation.z = -0.04;
  legR.add(rightLeg);

  const cape = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.44, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: side === "attacker" ? 0x2a3e63 : 0x5e2b2b,
      roughness: 0.74,
      metalness: 0.18,
      side: THREE.DoubleSide
    })
  );
  cape.position.y = 0.53;
  cape.position.z = -0.08;
  cape.rotation.x = Math.PI;
  bodyPivot.add(cape);

  return {
    root,
    bodyPivot,
    armL,
    armR,
    legL,
    legR,
    shield,
    swordBlade,
    maceHead,
    staff,
    staffOrb,
    crown,
    mitre,
    rookCrest,
    prayerHalo,
    helm
  };
}

function applyRoleVisual(fighter, piece = "p") {
  const key = String(piece || "p").toLowerCase();
  fighter.crown.visible = key === "k" || key === "q";
  fighter.mitre.visible = key === "b";
  fighter.rookCrest.visible = key === "r";
  fighter.shield.visible = key === "r" || key === "k";
  fighter.swordBlade.visible = key === "n" || key === "k" || key === "q";
  fighter.maceHead.visible = key === "p" || key === "r";
  fighter.staff.visible = key === "b" || key === "q";
  fighter.staffOrb.visible = key === "b" || key === "q";
  fighter.prayerHalo.visible = key === "b";

  const scaleByPiece = {
    p: 0.92,
    n: 1.04,
    b: 1,
    r: 1.08,
    q: 1.12,
    k: 1.15
  };
  const scale = scaleByPiece[key] || 1;
  fighter.root.scale.setScalar(scale);
}

function resolveBattleCue(cue) {
  if (!cue || typeof cue !== "object") return null;
  const id = String(cue.id || "");
  const attackerPiece = String(cue.attacker?.piece || "p").toLowerCase();
  const defenderPiece = String(cue.defender?.piece || "p").toLowerCase();
  return {
    id,
    attackerPiece,
    defenderPiece,
    action: ACTION_BY_PIECE[attackerPiece] || "thrust"
  };
}

export default function WizardArenaScene({
  pulse = "idle",
  palette = DEFAULT_PALETTE,
  cinematicIntensity = 0.78,
  battleCue = null,
  accent = "#6ac6ff",
  impact = "#ff9a5e"
}) {
  const [fallbackMode, setFallbackMode] = useState(false);
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(0);
  const pulseRef = useRef(pulse);
  const paletteRef = useRef(DEFAULT_PALETTE);
  const intensityRef = useRef(0.78);
  const cueRef = useRef(null);
  const accentRef = useRef({
    accentHex: safeHexColor(accent, 0x6ac6ff),
    impactHex: safeHexColor(impact, 0xff9a5e)
  });

  useEffect(() => {
    pulseRef.current = pulse;
  }, [pulse]);

  useEffect(() => {
    const value = Number(cinematicIntensity);
    intensityRef.current = Number.isFinite(value)
      ? Math.max(0.2, Math.min(1.25, value))
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
    cueRef.current = resolveBattleCue(battleCue);
  }, [battleCue]);

  useEffect(() => {
    accentRef.current = {
      accentHex: safeHexColor(accent, 0x6ac6ff),
      impactHex: safeHexColor(impact, 0xff9a5e)
    };
  }, [accent, impact]);

  useEffect(() => {
    if (fallbackMode) return undefined;
    const host = mountRef.current;
    if (!host) return undefined;

    try {
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(paletteRef.current.fog, 0.09);

      const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
      camera.position.set(0, 2.4, 4.6);

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

      const ambient = new THREE.AmbientLight(paletteRef.current.ambient, 0.34);
      scene.add(ambient);

      const keyLight = new THREE.PointLight(paletteRef.current.key, 1.22, 14, 2);
      keyLight.position.set(-2.4, 2.7, 1.8);
      scene.add(keyLight);

      const rimLight = new THREE.PointLight(paletteRef.current.rim, 0.92, 14, 2);
      rimLight.position.set(2.6, 1.8, -1.7);
      scene.add(rimLight);

      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(2.45, 2.72, 0.56, 52),
        new THREE.MeshStandardMaterial({
          color: 0x121826,
          roughness: 0.83,
          metalness: 0.2
        })
      );
      floor.position.y = -0.48;
      scene.add(floor);

      const runeRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.085, 20, 120),
        new THREE.MeshStandardMaterial({
          color: accentRef.current.accentHex,
          emissive: accentRef.current.accentHex,
          emissiveIntensity: 0.7,
          roughness: 0.24,
          metalness: 0.8,
          transparent: true,
          opacity: 0.7
        })
      );
      runeRing.rotation.x = Math.PI / 2;
      runeRing.position.y = -0.14;
      scene.add(runeRing);

      const sparksGeometry = new THREE.BufferGeometry();
      const sparkCount = 260;
      const sparkPositions = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i += 1) {
        const radius = 1.1 + Math.random() * 1.95;
        const angle = Math.random() * Math.PI * 2;
        sparkPositions[i * 3] = Math.cos(angle) * radius;
        sparkPositions[i * 3 + 1] = -0.35 + Math.random() * 1.9;
        sparkPositions[i * 3 + 2] = Math.sin(angle) * radius;
      }
      sparksGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
      const sparks = new THREE.Points(
        sparksGeometry,
        new THREE.PointsMaterial({
          color: 0x9ddaff,
          size: 0.024,
          transparent: true,
          opacity: 0.58
        })
      );
      scene.add(sparks);

      const attacker = createFighter({ side: "attacker", base: 0x9bb4d8, accent: accentRef.current.accentHex });
      const defender = createFighter({ side: "defender", base: 0xb18a8a, accent: accentRef.current.impactHex });
      scene.add(attacker.root);
      scene.add(defender.root);
      applyRoleVisual(attacker, "q");
      applyRoleVisual(defender, "k");

      const impactPulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 18, 18),
        new THREE.MeshBasicMaterial({
          color: accentRef.current.impactHex,
          transparent: true,
          opacity: 0
        })
      );
      impactPulse.position.set(0, 0.62, 0);
      scene.add(impactPulse);

      const spellBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.88, 12),
        new THREE.MeshBasicMaterial({
          color: accentRef.current.accentHex,
          transparent: true,
          opacity: 0
        })
      );
      spellBeam.rotation.z = Math.PI / 2;
      spellBeam.position.set(0, 0.66, 0);
      scene.add(spellBeam);

      const actionState = {
        lastCueId: "",
        startAt: 0,
        duration: 1.55,
        mode: "thrust",
        active: false
      };

      function resetCombatPose() {
        attacker.root.position.x = -1.45;
        defender.root.position.x = 1.45;
        attacker.bodyPivot.rotation.z = 0;
        defender.bodyPivot.rotation.z = 0;
        attacker.armR.rotation.x = -0.1;
        attacker.armL.rotation.x = -0.05;
        defender.armR.rotation.x = -0.08;
        defender.armL.rotation.x = -0.04;
        impactPulse.material.opacity = 0;
        spellBeam.material.opacity = 0;
      }

      resetCombatPose();

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
        const baseIntensity = 0.72 + intensityRef.current * 0.62;
        const captureBoost = pulseState === "capture" ? 1.34 : 1;
        const checkBoost = pulseState === "check" ? 1.42 : 1;
        const winBoost = pulseState === "checkmate" ? 1.7 : 1;
        const intensity = Math.max(captureBoost, checkBoost, winBoost) * baseIntensity;
        const cue = cueRef.current;

        if (cue?.id && cue.id !== actionState.lastCueId) {
          actionState.lastCueId = cue.id;
          actionState.startAt = now;
          actionState.mode = cue.action;
          actionState.active = true;
          applyRoleVisual(attacker, cue.attackerPiece);
          applyRoleVisual(defender, cue.defenderPiece);
        }

        if (scene.fog) scene.fog.color.setHex(activePalette.fog);
        ambient.color.setHex(activePalette.ambient);
        keyLight.color.setHex(activePalette.key);
        rimLight.color.setHex(activePalette.rim);
        runeRing.material.color.setHex(accentRef.current.accentHex);
        runeRing.material.emissive.setHex(accentRef.current.accentHex);
        impactPulse.material.color.setHex(accentRef.current.impactHex);
        spellBeam.material.color.setHex(accentRef.current.accentHex);

        const gaitA = Math.sin(now * 6.2) * 0.24;
        const gaitB = Math.sin(now * 6.2 + Math.PI) * 0.24;
        const bob = Math.sin(now * 4.2) * 0.03;

        attacker.legL.rotation.x = gaitA * 0.6;
        attacker.legR.rotation.x = -gaitA * 0.6;
        defender.legL.rotation.x = gaitB * 0.6;
        defender.legR.rotation.x = -gaitB * 0.6;
        attacker.bodyPivot.position.y = 0.22 + bob;
        defender.bodyPivot.position.y = 0.22 + bob * 0.9;
        attacker.prayerHalo.rotation.z += 0.018;
        runeRing.rotation.z = now * 0.11 * intensity;
        runeRing.material.emissiveIntensity = 0.44 + Math.sin(now * 2.4) * 0.2 * intensity;
        sparks.rotation.y = -now * 0.07 * intensity;
        keyLight.intensity = 1 + Math.sin(now * 2.0) * 0.16 * intensity;
        rimLight.intensity = 0.84 + Math.cos(now * 1.6) * 0.22 * intensity;
        camera.position.x = Math.sin(now * 0.25) * 0.08 * baseIntensity;

        if (actionState.active) {
          const p = clamp((now - actionState.startAt) / actionState.duration, 0, 1);
          const approach = smoothStep(0, 0.42, p);
          const strike = smoothStep(0.36, 0.68, p);
          const fade = smoothStep(0.68, 1, p);
          const strikeArc = Math.sin(Math.PI * strike);

          attacker.root.position.x = mix(-1.45, -0.3, approach) - (fade * 0.12);
          defender.root.position.x = mix(1.45, 0.54, approach) + (fade * 0.55);
          defender.bodyPivot.rotation.z = strikeArc * 0.18 - fade * 0.12;

          attacker.armL.rotation.x = -0.06 + strikeArc * 0.28;
          attacker.armR.rotation.x = -0.12;
          defender.armL.rotation.x = -0.1;
          defender.armR.rotation.x = -0.1;

          const mode = actionState.mode;
          if (mode === "cast" || mode === "prayer") {
            attacker.armR.rotation.x = -1.55 + strikeArc * 0.45;
            attacker.armL.rotation.x = -1.35 + strikeArc * 0.38;
            spellBeam.material.opacity = (0.12 + strikeArc * 0.88) * (1 - fade * 0.84);
            spellBeam.scale.y = 0.8 + strikeArc * 0.4;
            impactPulse.material.opacity = (0.18 + strikeArc * 0.72) * (1 - fade * 0.88);
            impactPulse.scale.setScalar(0.7 + strikeArc * 1.25);
          } else if (mode === "smash") {
            attacker.armR.rotation.x = -0.65 + strikeArc * 2.5;
            attacker.bodyPivot.rotation.z = -strikeArc * 0.2;
            impactPulse.material.opacity = (0.1 + strikeArc * 0.85) * (1 - fade * 0.8);
            impactPulse.scale.setScalar(0.65 + strikeArc * 1.45);
            spellBeam.material.opacity = 0;
          } else if (mode === "slash" || mode === "command") {
            attacker.armR.rotation.x = -0.55 + strikeArc * 2.2;
            attacker.armR.rotation.z = -0.16 + strikeArc * 0.7;
            impactPulse.material.opacity = (0.1 + strikeArc * 0.75) * (1 - fade * 0.84);
            impactPulse.scale.setScalar(0.6 + strikeArc * 1.2);
            spellBeam.material.opacity = 0;
          } else {
            attacker.armR.rotation.x = -0.22 + strikeArc * 1.6;
            impactPulse.material.opacity = (0.08 + strikeArc * 0.6) * (1 - fade * 0.84);
            impactPulse.scale.setScalar(0.55 + strikeArc * 1.05);
            spellBeam.material.opacity = 0;
          }

          if (p >= 0.995) {
            actionState.active = false;
            resetCombatPose();
          }
        } else {
          resetCombatPose();
        }

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
        renderer.dispose();
        scene.traverse(object => {
          if (object.geometry) object.geometry.dispose?.();
          if (object.material) {
            if (Array.isArray(object.material)) object.material.forEach(item => item.dispose?.());
            else object.material.dispose?.();
          }
        });
        if (renderer.domElement?.parentNode === host) {
          host.removeChild(renderer.domElement);
        }
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
          zIndex: 4,
          pointerEvents: "none",
          background:
            "radial-gradient(320px 220px at 50% 68%, rgba(111, 194, 255, 0.16), transparent 72%), radial-gradient(240px 170px at 52% 40%, rgba(139, 118, 255, 0.13), transparent 72%), linear-gradient(180deg, rgba(10, 12, 20, 0.76), rgba(8, 12, 20, 0.88))"
        }}
      />
    );
  }

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }} />;
}
