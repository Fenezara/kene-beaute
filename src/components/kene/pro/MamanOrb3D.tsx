"use client";
// Kènè Pro — L'Orbe d'Or & Cauri Sacré 3D (Assistante Maman)
// Inspiré des symboles royaux Akan, du Cauri sacré (prospérité & parole féconde)
// et du tissage Kente. Rendu 100 % procédural WebGL / Three.js sans asset externe.
// Zéro lag, DPR borné à 1.5, réactif au toucher et à la voix.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "analyzing" | "speaking" | "success";

export interface MamanOrb3DProps {
  state: OrbState;
  onClick?: () => void;
  className?: string;
  size?: number;
  interactive?: boolean;
  audioLevel?: number;
}

/* ───────────────────────── Géométrie Procédurale du Cauri ───────────────────────── */

function createCowrieGeometry(): THREE.BufferGeometry {
  const widthSegments = 48;
  const heightSegments = 32;
  const geo = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Forme allongée le long de Y (ovale royal)
    v.y *= 1.35;
    // Profil ovoïde : plus large au sommet qu'à la base
    const yNorm = (v.y + 1.35) / 2.7; // 0..1
    const eggFactor = 0.86 + 0.28 * Math.sin(Math.max(0, Math.min(1, yNorm)) * Math.PI);
    v.x *= eggFactor;

    // Face ventrale (Z > 0) : fente du cauri sacré
    if (v.z > 0) {
      v.z *= 0.72; // aplatissement ventral
      const distFromCenter = Math.abs(v.x);
      // Fente médiane rentrante
      const slitDepth = 0.44 * Math.exp(-(distFromCenter * distFromCenter) / 0.052);
      v.z -= slitDepth;

      // Dentelures délicates le long des lèvres de la fente
      if (distFromCenter < 0.36 && Math.abs(v.y) < 1.05) {
        const teethFreq = 16.0;
        const teeth = 0.042 * Math.cos(v.y * teethFreq) * (1.0 - distFromCenter / 0.36);
        v.z += teeth;
      }
    } else {
      // Face dorsale (Z < 0) : dôme bombé de nacre
      v.z *= 0.96;
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

/* ───────────────────────── Particules d'Or & Harmattan ───────────────────────── */

function HarmattanParticles({ state }: { state: OrbState }) {
  const count = 160;
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, initialPositions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const initPos = new Float32Array(count * 3);
    const spd = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribution sphérique autour de l'orbe
      const radius = 1.35 + Math.random() * 1.15;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      initPos[i * 3] = x;
      initPos[i * 3 + 1] = y;
      initPos[i * 3 + 2] = z;

      spd[i] = 0.4 + Math.random() * 0.8;
    }

    return [pos, initPos, spd];
  }, []);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime();
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;

    const isListening = state === "listening";
    const isAnalyzing = state === "analyzing";
    const isSuccess = state === "success";

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const origX = initialPositions[idx];
      const origY = initialPositions[idx + 1];
      const origZ = initialPositions[idx + 2];
      const s = speeds[i];

      // Rotation orbitale continue
      const angle = t * 0.35 * s * (isAnalyzing ? 3.0 : 1.0);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      let curX = origX * cosA - origZ * sinA;
      let curZ = origX * sinA + origZ * cosA;
      let curY = origY + Math.sin(t * 1.5 + i) * 0.08;

      if (isListening) {
        // Ondulation harmonique réactive à la voix
        const pulse = 1.0 + Math.sin(t * 8 + i * 0.5) * 0.18;
        curX *= pulse;
        curY *= pulse;
        curZ *= pulse;
      } else if (isAnalyzing) {
        // Vortex de tissage : convergence vers le cauri
        const converge = 0.72 + Math.sin(t * 4 + i) * 0.12;
        curX *= converge;
        curY *= converge;
        curZ *= converge;
      } else if (isSuccess) {
        // Éclat d'or triomphal
        const burst = 1.35 + Math.sin(t * 5 + i) * 0.1;
        curX *= burst;
        curY *= burst;
        curZ *= burst;
      }

      array[idx] = curX;
      array[idx + 1] = curY;
      array[idx + 2] = curZ;
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        color={state === "listening" ? "#FFC107" : state === "analyzing" ? "#E07A2B" : "#FFDF80"}
        size={state === "listening" ? 0.055 : 0.042}
        transparent
        opacity={state === "analyzing" ? 0.85 : 0.65}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ───────────────────────── Anneaux Solaires Akan & Adinkra ───────────────────────── */

function AkanSolarRings({ state }: { state: OrbState }) {
  const innerRingRef = useRef<THREE.Group>(null);
  const outerRingRef = useRef<THREE.Group>(null);

  // Perles d'or Akan réparties sur les anneaux (symboles de clans Abusua)
  const innerBeads = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return [Math.cos(angle) * 1.48, Math.sin(angle) * 1.48, 0] as [number, number, number];
    });
  }, []);

  const outerBeads = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      return [Math.cos(angle) * 1.76, Math.sin(angle) * 1.76, 0] as [number, number, number];
    });
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speedMult = state === "analyzing" ? 2.6 : state === "listening" ? 1.4 : 0.8;

    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = t * 0.45 * speedMult;
      innerRingRef.current.rotation.x = Math.PI / 3.8 + Math.sin(t * 0.6) * 0.08;
    }

    if (outerRingRef.current) {
      outerRingRef.current.rotation.y = -t * 0.35 * speedMult;
      outerRingRef.current.rotation.z = Math.PI / 4 + Math.cos(t * 0.5) * 0.07;
    }
  });

  const goldMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: state === "listening" ? "#FFC107" : "#C8951E",
        emissive: state === "listening" ? "#8B5A00" : "#3D2600",
        metalness: 0.88,
        roughness: 0.22,
      }),
    [state]
  );

  return (
    <>
      {/* Anneau intérieur Akan */}
      <group ref={innerRingRef}>
        <mesh>
          <torusGeometry args={[1.48, 0.02, 16, 64]} />
          <primitive object={goldMat} attach="material" />
        </mesh>
        {innerBeads.map((pos, idx) => (
          <mesh key={idx} position={pos}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <primitive object={goldMat} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Anneau extérieur Adinkra (gyroscopique) */}
      <group ref={outerRingRef}>
        <mesh>
          <torusGeometry args={[1.76, 0.016, 16, 64]} />
          <primitive object={goldMat} attach="material" />
        </mesh>
        {outerBeads.map((pos, idx) => (
          <mesh key={idx} position={pos}>
            <sphereGeometry args={[0.038, 12, 12]} />
            <primitive object={goldMat} attach="material" />
          </mesh>
        ))}
      </group>
    </>
  );
}

/* ───────────────────────── Cœur du Cauri Sacré ───────────────────────── */

function SacredCowrieCore({ state, audioLevel = 0 }: { state: OrbState; audioLevel?: number }) {
  const cowrieGeo = useMemo(() => createCowrieGeometry(), []);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowLightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    // Respiration organique du cauri & pulsation réactive à la voix
    let scalePulse = 1.0;
    if (state === "listening") {
      const voiceBoost = Math.min(audioLevel * 0.45, 0.4);
      scalePulse = 1.0 + voiceBoost + Math.sin(t * 7) * 0.08 + Math.cos(t * 11) * 0.03;
    } else if (state === "analyzing") {
      scalePulse = 0.94 + Math.sin(t * 14) * 0.04;
    } else if (state === "speaking") {
      scalePulse = 1.02 + Math.sin(t * 4.5) * 0.05;
    } else {
      scalePulse = 1.0 + Math.sin(t * 1.8) * 0.03;
    }

    meshRef.current.scale.set(scalePulse, scalePulse, scalePulse);

    // Oscillation douce en veille, orientation vivante
    meshRef.current.rotation.y = Math.sin(t * 0.5) * 0.18;
    meshRef.current.rotation.x = Math.cos(t * 0.4) * 0.12;

    if (glowLightRef.current) {
      if (state === "listening") {
        const lightBoost = audioLevel * 3.5;
        glowLightRef.current.intensity = 3.6 + lightBoost + Math.sin(t * 8) * 0.9;
      } else if (state === "analyzing") {
        glowLightRef.current.intensity = 4.2 + Math.sin(t * 15) * 1.2;
      } else if (state === "speaking") {
        glowLightRef.current.intensity = 2.8 + Math.sin(t * 5) * 0.6;
      } else {
        glowLightRef.current.intensity = 1.8 + Math.sin(t * 2) * 0.4;
      }
    }
  });

  const cowrieMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: state === "listening" ? "#FFF8E7" : "#FBF7EF", // Nacre royale d'ivoire
      emissive:
        state === "listening"
          ? "#B87333"
          : state === "analyzing"
          ? "#E07A2B"
          : state === "speaking"
          ? "#A0522D"
          : "#664422",
      roughness: 0.18,
      metalness: 0.32,
    });
  }, [state]);

  return (
    <group>
      {/* Cœur lumineux intérieur pulsant par la fente */}
      <pointLight
        ref={glowLightRef}
        color={state === "listening" ? "#FFC107" : state === "analyzing" ? "#FF8C00" : "#FFDF80"}
        distance={4.5}
        decay={2}
      />

      {/* Orbe Cauri principal */}
      <mesh ref={meshRef} geometry={cowrieGeo} material={cowrieMaterial} />

      {/* Halo interne incandescent (feu de forge d'or) */}
      <mesh scale={0.48}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          color={state === "listening" ? "#FFD700" : state === "analyzing" ? "#FF6F00" : "#C8951E"}
          transparent
          opacity={state === "listening" ? 0.75 : 0.55}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/* ───────────────────────── Scène Principale & Suivi Gyroscopique ───────────────────────── */

function SceneContent({ state, audioLevel = 0 }: { state: OrbState; audioLevel?: number }) {
  const rootGroup = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame(() => {
    if (!rootGroup.current) return;
    // Parallaxe subtile suivant le pointeur / doigt de l'utilisatrice
    rootGroup.current.rotation.y = THREE.MathUtils.lerp(rootGroup.current.rotation.y, pointer.x * 0.35, 0.05);
    rootGroup.current.rotation.x = THREE.MathUtils.lerp(rootGroup.current.rotation.x, -pointer.y * 0.35, 0.05);
  });

  return (
    <group ref={rootGroup} position={[0, 0, 0]}>
      {/* Lumière ambiante chaude terracotta / or */}
      <ambientLight color="#FFF3E0" intensity={0.9} />
      {/* Éclairage directionnel zénithal (Soleil d'Abidjan) */}
      <directionalLight position={[3, 4, 3]} color="#FFE0B2" intensity={1.4} />
      {/* Lumière de contre-jour Kente pourpre royale */}
      <pointLight position={[-3, -2, -2]} color="#8B1A3B" intensity={1.8} distance={6} />

      {/* 1. Le Cœur Cauri Sacré */}
      <SacredCowrieCore state={state} audioLevel={audioLevel} />

      {/* 2. Les Anneaux Solaires Akan & Adinkra */}
      <AkanSolarRings state={state} />

      {/* 3. Le Nuage de Particules Harmattan */}
      <HarmattanParticles state={state} />
    </group>
  );
}

/* ───────────────────────── Composant Exporté ───────────────────────── */

export function MamanOrb3D({
  state,
  onClick,
  className,
  size = 280,
  interactive = true,
  audioLevel = 0,
}: MamanOrb3DProps) {
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) setHasWebGL(false);
    } catch {
      setHasWebGL(false);
    }
  }, []);

  return (
    <div
      onClick={interactive ? onClick : undefined}
      style={{ width: size, height: size }}
      className={cn(
        "relative flex items-center justify-center select-none",
        interactive && "cursor-pointer group",
        className
      )}
      role="button"
      tabIndex={0}
      aria-label="Orbe Sacré de l'Assistante Maman — Toucher pour dicter"
    >
      {/* ─── Halo d'ambiance cosmique d'arrière-plan ─── */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-2xl transition-all duration-700 pointer-events-none",
          state === "listening" && "bg-gradient-to-tr from-[#FFC107]/40 via-[#FF9800]/30 to-[#8B1A3B]/40 scale-125 animate-pulse",
          state === "analyzing" && "bg-gradient-to-tr from-[#E07A2B]/45 via-[#C8951E]/40 to-[#8B1A3B]/35 scale-115",
          state === "speaking" && "bg-gradient-to-tr from-[#C8951E]/35 via-[#4A90E2]/25 to-[#FAF3E0]/30 scale-110",
          state === "success" && "bg-gradient-to-tr from-[#10B981]/40 via-[#FFD700]/40 to-[#C8951E]/30 scale-130",
          state === "idle" && "bg-gradient-to-tr from-[#C8951E]/20 via-[#A0522D]/15 to-transparent scale-100 group-hover:scale-110"
        )}
      />

      {/* ─── Rendu 3D WebGL (Three.js) ─── */}
      {hasWebGL ? (
        <div className="w-full h-full relative z-10 transition-transform duration-300 group-hover:scale-[1.03] group-active:scale-95">
          <Canvas
            camera={{ position: [0, 0, 4.3], fov: 46 }}
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          >
            <SceneContent state={state} audioLevel={audioLevel} />
          </Canvas>
        </div>
      ) : (
        /* Fallback 2D gracieux si WebGL non supporté */
        <div className="relative z-10 w-44 h-44 rounded-full bg-gradient-to-br from-[#FFE4A0] via-[#C8951E] to-[#8B1A3B] p-1 shadow-2xl animate-pulse flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-card flex flex-col items-center justify-center p-4 text-center">
            <span className="text-4xl mb-1">🐚</span>
            <span className="text-xs font-bold text-foreground">Orbe Cauri Sacré</span>
          </div>
        </div>
      )}

      {/* ─── Onde Sonore Pulsante en mode écoute (SVG Réactif) ─── */}
      {state === "listening" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
          <span className="absolute w-full h-full rounded-full border-2 border-[#FFC107]/60 animate-ping opacity-75" />
          <span className="absolute w-[85%] h-[85%] rounded-full border border-[#E07A2B]/40 animate-pulse" />
        </div>
      )}
    </div>
  );
}
