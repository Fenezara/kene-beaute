"use client";
// Kènè Cliente — L'Orbe Sacré de Consultation de Dermo Kènè (Émeraude Botanique & Cauri d'Or 3D)
// Incarnation visuelle et vivante de Dermo Kènè :
// • Cœur Émeraude Végétale (Moringa, Aloe Vera, régénération cellulaire cutanée)
// • Double Anneau Gyroscopique d'Or Akan (noblesse, protection mélanique et éclat du teint)
// • Cauri Sacré de Nacre Céleste en lévitation centrale
// • 180 particules de rosée cellulaire bioluminescentes réactives au volume vocal
// Rendu 100 % procédural Three.js / WebGL sans asset externe, DPR borné à 1.5, zéro lag.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type DrKeneOrbState = "idle" | "listening" | "analyzing" | "speaking" | "success";

export interface DrKeneOrb3DProps {
  state: DrKeneOrbState;
  onClick?: () => void;
  className?: string;
  size?: number;
  interactive?: boolean;
  audioLevel?: number; // 0..1 pour l'ondulation au son de la voix
}

/* ───────────────────────── Géométrie Procédurale du Cauri Sacré ───────────────────────── */

function createCowrieGeometry(): THREE.BufferGeometry {
  const widthSegments = 56;
  const heightSegments = 36;
  const geo = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Forme allongée le long de Y (ovale royal protecteur)
    v.y *= 1.36;
    // Profil ovoïde : sommet plus harmonieux
    const yNorm = (v.y + 1.36) / 2.72; // 0..1
    const eggFactor = 0.9 + 0.28 * Math.sin(Math.max(0, Math.min(1, yNorm)) * Math.PI);
    v.x *= eggFactor;

    // Face ventrale (Z > 0) : fente médiane sacrée du Cauri
    if (v.z > 0) {
      v.z *= 0.68;
      const distFromCenter = Math.abs(v.x);
      const slitDepth = 0.44 * Math.exp(-(distFromCenter * distFromCenter) / 0.046);
      v.z -= slitDepth;

      // Dentelures sculptées le long des lèvres de la fente
      if (distFromCenter < 0.36 && Math.abs(v.y) < 1.05) {
        const teethFreq = 18.0;
        const teeth = 0.044 * Math.cos(v.y * teethFreq) * (1.0 - distFromCenter / 0.36);
        v.z += teeth;
      }
    } else {
      // Face dorsale (Z < 0) : dôme bombé de nacre ivoire polie
      v.z *= 0.96;
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

/* ───────────────────────── Particules de Rosée Cellulaire & Éclat Botanique ───────────────────────── */

function CellularDewParticles({
  state,
  audioLevel = 0,
}: {
  state: DrKeneOrbState;
  audioLevel?: number;
}) {
  const count = 180;
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    // Palette émeraude végétale & or céleste
    const emerald = new THREE.Color("#10B981");
    const mint = new THREE.Color("#34D399");
    const gold = new THREE.Color("#FFD700");
    const warmAmber = new THREE.Color("#F59E0B");

    for (let i = 0; i < count; i++) {
      // Distribution sphérique autour de l'Orbe (rayon 1.55 à 2.85)
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 1.55 + Math.random() * 1.3;

      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // Dégradé aléatoire émeraude / menthe / or
      const choice = Math.random();
      const c = new THREE.Color();
      if (choice < 0.45) {
        c.lerpColors(emerald, mint, Math.random());
      } else if (choice < 0.8) {
        c.lerpColors(gold, warmAmber, Math.random());
      } else {
        c.set("#FAF5E4"); // Perles de nacre
      }

      col[i * 3 + 0] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    return [pos, col];
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const pts = pointsRef.current;

    // Vitesse de rotation orbitale des particules selon l'état clinique
    let speed = 0.18;
    if (state === "listening") speed = 0.5 + audioLevel * 1.2;
    if (state === "analyzing") speed = 1.4;
    if (state === "speaking") speed = 0.65;
    if (state === "success") speed = 0.35;

    pts.rotation.y += delta * speed;
    pts.rotation.x += delta * (speed * 0.4);

    // Pulsation d'amplitude
    const baseScale = 1.0 + Math.sin(Date.now() * 0.002) * 0.04;
    const pulseFactor = state === "listening" ? baseScale + audioLevel * 0.28 : baseScale;
    pts.scale.set(pulseFactor, pulseFactor, pulseFactor);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.062}
        vertexColors
        transparent
        opacity={0.88}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ───────────────────────── Cauri Sacré de Guérison ───────────────────────── */

function SacredCowrieNodule({
  state,
  audioLevel = 0,
}: {
  state: DrKeneOrbState;
  audioLevel?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => createCowrieGeometry(), []);

  // Matériau nacre ivoire & translucidité perlière
  const material = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#FAF6EC"),
      emissive: new THREE.Color("#059669"),
      emissiveIntensity: 0.22,
      roughness: 0.18,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transmission: 0.45,
      thickness: 1.2,
      ior: 1.54,
      reflectivity: 0.85,
    });
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const m = meshRef.current;

    // Respiration et micro-rotation vivante
    m.rotation.y += delta * 0.35;
    m.rotation.x = Math.sin(Date.now() * 0.0014) * 0.12;

    // Teinte et émissivité selon l'activité de Dermo Kènè
    const mat = m.material as THREE.MeshPhysicalMaterial;
    if (state === "listening") {
      mat.emissive.set("#10B981");
      mat.emissiveIntensity = 0.5 + audioLevel * 0.9;
    } else if (state === "analyzing") {
      mat.emissive.set("#34D399");
      mat.emissiveIntensity = 0.8 + Math.sin(Date.now() * 0.012) * 0.3;
    } else if (state === "speaking") {
      mat.emissive.set("#F59E0B");
      mat.emissiveIntensity = 0.55 + Math.sin(Date.now() * 0.008) * 0.25;
    } else if (state === "success") {
      mat.emissive.set("#10B981");
      mat.emissiveIntensity = 0.75;
    } else {
      mat.emissive.set("#059669");
      mat.emissiveIntensity = 0.22 + Math.sin(Date.now() * 0.002) * 0.08;
    }

    // Échelle réactive
    const scaleBase = 0.88;
    const dynScale =
      state === "listening"
        ? scaleBase + audioLevel * 0.16
        : scaleBase + Math.sin(Date.now() * 0.0025) * 0.03;
    m.scale.set(dynScale, dynScale, dynScale);
  });

  return <mesh ref={meshRef} geometry={geo} material={material} />;
}

/* ───────────────────────── Anneaux Gyroscopiques Bio-Mélaniques ───────────────────────── */

function GyroscopicBioRings({
  state,
  audioLevel = 0,
}: {
  state: DrKeneOrbState;
  audioLevel?: number;
}) {
  const outerRingRef = useRef<THREE.Mesh>(null);
  const midRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);

  // Géométries de tore ciselé
  const outerGeo = useMemo(() => new THREE.TorusGeometry(1.68, 0.038, 20, 100), []);
  const midGeo = useMemo(() => new THREE.TorusGeometry(1.42, 0.032, 20, 100), []);
  const innerGeo = useMemo(() => new THREE.TorusGeometry(1.18, 0.026, 20, 90), []);

  // Matériau Or Akan & Émeraude
  const goldMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFD700"),
        metalness: 0.92,
        roughness: 0.18,
        emissive: new THREE.Color("#C8951E"),
        emissiveIntensity: 0.25,
      }),
    []
  );

  const emeraldMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#10B981"),
        metalness: 0.65,
        roughness: 0.22,
        emissive: new THREE.Color("#059669"),
        emissiveIntensity: 0.35,
      }),
    []
  );

  useFrame((_, delta) => {
    // Vitesse selon l'état
    let mult = 1.0;
    if (state === "analyzing") mult = 3.5;
    if (state === "listening") mult = 1.4 + audioLevel * 2.2;
    if (state === "speaking") mult = 1.8;

    if (outerRingRef.current) {
      outerRingRef.current.rotation.x += delta * 0.42 * mult;
      outerRingRef.current.rotation.y += delta * 0.28 * mult;
    }
    if (midRingRef.current) {
      midRingRef.current.rotation.y -= delta * 0.52 * mult;
      midRingRef.current.rotation.z += delta * 0.36 * mult;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.x += delta * 0.64 * mult;
      innerRingRef.current.rotation.z -= delta * 0.48 * mult;
    }
  });

  return (
    <group>
      <mesh ref={outerRingRef} geometry={outerGeo} material={goldMaterial} />
      <mesh ref={midRingRef} geometry={midGeo} material={emeraldMaterial} />
      <mesh ref={innerRingRef} geometry={innerGeo} material={goldMaterial} />
    </group>
  );
}

/* ───────────────────────── Noyau Bioluminescent Dermo-Cellulaire ───────────────────────── */

function BioLuminescentCore({
  state,
  audioLevel = 0,
}: {
  state: DrKeneOrbState;
  audioLevel?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(0.72, 36, 36), []);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#10B981"),
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useFrame(() => {
    if (!meshRef.current) return;
    const m = meshRef.current;
    const basePulse = Math.sin(Date.now() * 0.003) * 0.06;
    const factor =
      state === "listening"
        ? 1.0 + basePulse + audioLevel * 0.45
        : state === "speaking"
        ? 1.0 + Math.sin(Date.now() * 0.009) * 0.15
        : 1.0 + basePulse;
    m.scale.set(factor, factor, factor);
  });

  return <mesh ref={meshRef} geometry={geo} material={material} />;
}

/* ───────────────────────── Scène 3D Intérieure ───────────────────────── */

function DrKeneScene({
  state,
  audioLevel = 0,
}: {
  state: DrKeneOrbState;
  audioLevel?: number;
}) {
  const { mouse } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    // Légère inclinaison réactive au curseur / toucher
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      mouse.y * 0.22,
      0.06
    );
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      mouse.x * 0.28,
      0.06
    );
  });

  return (
    <group ref={groupRef}>
      {/* Éclairage d'ambiance clinique d'or & d'émeraude */}
      <ambientLight intensity={1.1} />
      <pointLight position={[4, 5, 4]} intensity={2.4} color="#FFF8E7" />
      <pointLight position={[-4, -3, -3]} intensity={1.8} color="#10B981" />
      <pointLight position={[0, -4, 3]} intensity={1.5} color="#FFD700" />

      {/* Cœur & Cauri */}
      <BioLuminescentCore state={state} audioLevel={audioLevel} />
      <SacredCowrieNodule state={state} audioLevel={audioLevel} />

      {/* Anneaux gyroscopiques */}
      <GyroscopicBioRings state={state} audioLevel={audioLevel} />

      {/* Particules de rosée */}
      <CellularDewParticles state={state} audioLevel={audioLevel} />
    </group>
  );
}

/* ───────────────────────── Fallback 2D de Sécurité ───────────────────────── */

function DrKeneOrbFallback2D({
  state,
  audioLevel = 0,
}: {
  state: DrKeneOrbState;
  audioLevel?: number;
}) {
  return (
    <div className="relative size-full flex items-center justify-center">
      {/* Halos concentriques émeraude & or */}
      <div
        className={cn(
          "absolute inset-3 rounded-full blur-2xl transition-all duration-700 opacity-60",
          state === "listening" && "bg-gradient-to-tr from-emerald-500 via-teal-400 to-amber-400 scale-125 animate-pulse",
          state === "analyzing" && "bg-gradient-to-tr from-teal-400 via-emerald-600 to-amber-500 scale-115 animate-spin",
          state === "speaking" && "bg-gradient-to-tr from-amber-400 via-emerald-500 to-emerald-300 scale-120 animate-pulse",
          state === "success" && "bg-gradient-to-tr from-emerald-400 via-green-500 to-amber-300 scale-130",
          state === "idle" && "bg-gradient-to-tr from-emerald-600/40 via-amber-500/30 to-teal-700/20"
        )}
      />
      <div className="relative size-32 rounded-full border-2 border-emerald-400/60 bg-gradient-to-tr from-emerald-800 via-teal-700 to-emerald-900 shadow-2xl flex items-center justify-center">
        <div className="size-20 rounded-full border border-amber-400/50 bg-amber-500/10 flex items-center justify-center shadow-inner">
          <span className="text-3xl animate-bounce">🌿</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Composant Principal Exporté ───────────────────────── */

export function DrKeneOrb3D({
  state,
  onClick,
  className,
  size = 280,
  interactive = true,
  audioLevel = 0,
}: DrKeneOrb3DProps) {
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      setHasWebGL(Boolean(gl));
    } catch {
      setHasWebGL(false);
    }
  }, []);

  return (
    <div
      onClick={interactive ? onClick : undefined}
      style={{ width: size, height: size }}
      className={cn(
        "relative flex items-center justify-center select-none mx-auto",
        interactive && "cursor-pointer group",
        className
      )}
      role="button"
      tabIndex={0}
      aria-label="Orbe Sacré de Dermo Kènè — Toucher pour parler"
    >
      {/* ─── Halo d'ambiance clinique émeraude & or ─── */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-3xl transition-all duration-700 pointer-events-none",
          state === "listening" &&
            "bg-gradient-to-tr from-emerald-500/50 via-teal-400/40 to-amber-400/45 scale-135 animate-pulse",
          state === "analyzing" &&
            "bg-gradient-to-tr from-teal-500/55 via-emerald-600/45 to-amber-500/40 scale-125",
          state === "speaking" &&
            "bg-gradient-to-tr from-amber-400/40 via-emerald-500/35 to-teal-300/35 scale-120",
          state === "success" &&
            "bg-gradient-to-tr from-emerald-400/50 via-green-500/45 to-amber-300/35 scale-140",
          state === "idle" &&
            "bg-gradient-to-tr from-emerald-600/25 via-teal-700/20 to-transparent scale-105 group-hover:scale-115"
        )}
      />

      {/* Rendu 3D Canvas ou Repli 2D */}
      {hasWebGL ? (
        <Canvas
          camera={{ position: [0, 0, 4.3], fov: 42 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          className="relative z-10 !w-full !h-full pointer-events-none"
        >
          <DrKeneScene state={state} audioLevel={audioLevel} />
        </Canvas>
      ) : (
        <DrKeneOrbFallback2D state={state} audioLevel={audioLevel} />
      )}
    </div>
  );
}
