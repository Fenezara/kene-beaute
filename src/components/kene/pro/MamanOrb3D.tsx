"use client";
// Kènè Pro — L'Orbe d'Or & Cauri Sacré 3D Majestueux (Secrétaire IA Maman)
// Inspiré des symboles royaux Akan (Ashanti), du Cauri sacré (prospérité & parole féconde),
// des astrolabes royaux d'or et du tissage Kente.
// Rendu 100 % procédural WebGL / Three.js sans asset externe.
// Zéro lag, DPR borné à 1.5, réactif au toucher, au regard et au timbre de voix en direct.

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

/* ───────────────────────── Géométrie Procédurale du Cauri Sacré ───────────────────────── */

function createCowrieGeometry(): THREE.BufferGeometry {
  const widthSegments = 56;
  const heightSegments = 36;
  const geo = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Forme allongée le long de Y (ovale royal Ashanti)
    v.y *= 1.38;
    // Profil ovoïde : sommet plus large et arrondi que la base
    const yNorm = (v.y + 1.38) / 2.76; // 0..1
    const eggFactor = 0.88 + 0.3 * Math.sin(Math.max(0, Math.min(1, yNorm)) * Math.PI);
    v.x *= eggFactor;

    // Face ventrale (Z > 0) : fente médiane sacrée du Cauri
    if (v.z > 0) {
      v.z *= 0.7; // aplatissement ventral délicat
      const distFromCenter = Math.abs(v.x);
      // Fente médiane rentrante profonde
      const slitDepth = 0.46 * Math.exp(-(distFromCenter * distFromCenter) / 0.048);
      v.z -= slitDepth;

      // Dentelures ciselées le long des lèvres de la fente (symbole de parole)
      if (distFromCenter < 0.38 && Math.abs(v.y) < 1.1) {
        const teethFreq = 18.0;
        const teeth = 0.046 * Math.cos(v.y * teethFreq) * (1.0 - distFromCenter / 0.38);
        v.z += teeth;
      }
    } else {
      // Face dorsale (Z < 0) : dôme bombé de nacre ivoire polie
      v.z *= 0.98;
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

/* ───────────────────────── Particules d'Or & Brume de l'Harmattan ───────────────────────── */

function HarmattanParticles({
  state,
  audioLevel = 0,
}: {
  state: OrbState;
  audioLevel?: number;
}) {
  const count = 220;
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, initialPositions, speeds, phases] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const initPos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    const phs = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribution sphérique stratifiée autour de l'orbe
      const radius = 1.3 + Math.random() * 1.35;
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

      spd[i] = 0.35 + Math.random() * 0.9;
      phs[i] = Math.random() * Math.PI * 2;
    }

    return [pos, initPos, spd, phs];
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
    const isSpeaking = state === "speaking";

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const origX = initialPositions[idx];
      const origY = initialPositions[idx + 1];
      const origZ = initialPositions[idx + 2];
      const s = speeds[i];
      const p = phases[i];

      // Rotation orbitale gyroscopique continue
      const speedMult = isAnalyzing ? 3.2 : isListening ? 1.6 : 0.9;
      const angle = t * 0.32 * s * speedMult + p * 0.1;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      let curX = origX * cosA - origZ * sinA;
      let curZ = origX * sinA + origZ * cosA;
      let curY = origY + Math.sin(t * 1.6 + p) * 0.09;

      if (isListening) {
        // Ondulation harmonique réactive au volume sonore de la voix
        const voiceBoost = audioLevel * 0.55;
        const pulse = 1.0 + voiceBoost + Math.sin(t * 9 + i * 0.4) * 0.16;
        curX *= pulse;
        curY *= pulse;
        curZ *= pulse;
      } else if (isAnalyzing) {
        // Vortex de tissage : convergence centrifuge vers le cauri
        const converge = 0.74 + Math.sin(t * 5 + i * 0.3) * 0.14;
        curX *= converge;
        curY *= converge;
        curZ *= converge;
      } else if (isSpeaking) {
        // Ondes de transmission bienveillante
        const wave = 1.05 + Math.sin(t * 4 + i * 0.6) * 0.08;
        curX *= wave;
        curY *= wave;
        curZ *= wave;
      } else if (isSuccess) {
        // Éclat d'or triomphal scellé
        const burst = 1.38 + Math.sin(t * 6 + i) * 0.12;
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
        color={
          state === "listening"
            ? "#FFD700"
            : state === "analyzing"
            ? "#FF8C00"
            : state === "success"
            ? "#10B981"
            : "#FFDF80"
        }
        size={state === "listening" ? 0.058 : 0.046}
        transparent
        opacity={state === "analyzing" ? 0.9 : 0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ───────────────────────── Astrolabe Royal : Triple Anneau Gyroscopique Akan & Ashanti ───────────────────────── */

function RoyalAkanSolarRings({
  state,
  audioLevel = 0,
}: {
  state: OrbState;
  audioLevel?: number;
}) {
  const innerRingRef = useRef<THREE.Group>(null);
  const midRingRef = useRef<THREE.Group>(null);
  const outerRingRef = useRef<THREE.Group>(null);

  // Perles d'or Akan (symboles de clans royaux Ashanti & perles de fertilité)
  const innerBeads = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return [Math.cos(angle) * 1.46, Math.sin(angle) * 1.46, 0] as [number, number, number];
    });
  }, []);

  const midBeads = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      return [Math.cos(angle) * 1.72, Math.sin(angle) * 1.72, 0] as [number, number, number];
    });
  }, []);

  const outerBeads = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      return [Math.cos(angle) * 1.98, Math.sin(angle) * 1.98, 0] as [number, number, number];
    });
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speedMult = state === "analyzing" ? 2.8 : state === "listening" ? 1.6 : 0.85;
    const voiceExpansion = 1.0 + (state === "listening" ? audioLevel * 0.18 : 0);

    // 1. Anneau intérieur Akan
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = t * 0.48 * speedMult;
      innerRingRef.current.rotation.x = Math.PI / 3.6 + Math.sin(t * 0.6) * 0.08;
      innerRingRef.current.scale.set(voiceExpansion, voiceExpansion, voiceExpansion);
    }

    // 2. Anneau équatorial médian Ashanti (orbite transversale)
    if (midRingRef.current) {
      midRingRef.current.rotation.x = -t * 0.38 * speedMult;
      midRingRef.current.rotation.y = Math.PI / 4 + Math.cos(t * 0.5) * 0.1;
      midRingRef.current.scale.set(voiceExpansion * 1.02, voiceExpansion * 1.02, voiceExpansion * 1.02);
    }

    // 3. Anneau extérieur Adinkra (gyroscopique souverain)
    if (outerRingRef.current) {
      outerRingRef.current.rotation.y = t * 0.32 * speedMult;
      outerRingRef.current.rotation.z = Math.PI / 5 + Math.sin(t * 0.4) * 0.08;
      outerRingRef.current.scale.set(voiceExpansion * 1.04, voiceExpansion * 1.04, voiceExpansion * 1.04);
    }
  });

  const goldMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color:
          state === "listening"
            ? "#FFD700"
            : state === "analyzing"
            ? "#FF9800"
            : state === "success"
            ? "#10B981"
            : "#C8951E",
        emissive:
          state === "listening"
            ? "#996515"
            : state === "analyzing"
            ? "#8B4500"
            : state === "success"
            ? "#065F46"
            : "#3D2600",
        metalness: 0.92,
        roughness: 0.18,
      }),
    [state]
  );

  return (
    <>
      {/* Anneau 1 : Intérieur Akan */}
      <group ref={innerRingRef}>
        <mesh>
          <torusGeometry args={[1.46, 0.022, 16, 64]} />
          <primitive object={goldMat} attach="material" />
        </mesh>
        {innerBeads.map((pos, idx) => (
          <mesh key={idx} position={pos}>
            <sphereGeometry args={[0.048, 14, 14]} />
            <primitive object={goldMat} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Anneau 2 : Équatorial Médian Ashanti (12 joyaux) */}
      <group ref={midRingRef}>
        <mesh>
          <torusGeometry args={[1.72, 0.018, 16, 64]} />
          <primitive object={goldMat} attach="material" />
        </mesh>
        {midBeads.map((pos, idx) => (
          <mesh key={idx} position={pos}>
            <sphereGeometry args={[0.04, 14, 14]} />
            <primitive object={goldMat} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Anneau 3 : Extérieur Adinkra (gyroscopique) */}
      <group ref={outerRingRef}>
        <mesh>
          <torusGeometry args={[1.98, 0.015, 16, 64]} />
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

/* ───────────────────────── Cœur du Cauri Sacré Sublime ───────────────────────── */

function SacredCowrieCore({
  state,
  audioLevel = 0,
}: {
  state: OrbState;
  audioLevel?: number;
}) {
  const cowrieGeo = useMemo(() => createCowrieGeometry(), []);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowLightRef = useRef<THREE.PointLight>(null);
  const secondaryLightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    // Respiration organique vivante du Cauri & pulsation au rythme de la voix
    let scalePulse = 1.0;
    if (state === "listening") {
      const voiceBoost = Math.min(audioLevel * 0.55, 0.45);
      scalePulse = 1.0 + voiceBoost + Math.sin(t * 7.5) * 0.07 + Math.cos(t * 11) * 0.03;
    } else if (state === "analyzing") {
      scalePulse = 0.94 + Math.sin(t * 15) * 0.045;
    } else if (state === "speaking") {
      scalePulse = 1.03 + Math.sin(t * 4.8) * 0.055;
    } else if (state === "success") {
      scalePulse = 1.06 + Math.sin(t * 3.0) * 0.03;
    } else {
      scalePulse = 1.0 + Math.sin(t * 2.0) * 0.035;
    }

    meshRef.current.scale.set(scalePulse, scalePulse, scalePulse);

    // Oscillation magnétique douce et vivante
    meshRef.current.rotation.y = Math.sin(t * 0.55) * 0.19;
    meshRef.current.rotation.x = Math.cos(t * 0.45) * 0.13;

    // Lumière intérieure dorée émanant de la fente
    if (glowLightRef.current) {
      if (state === "listening") {
        const lightBoost = audioLevel * 4.2;
        glowLightRef.current.intensity = 3.8 + lightBoost + Math.sin(t * 8) * 0.8;
      } else if (state === "analyzing") {
        glowLightRef.current.intensity = 4.5 + Math.sin(t * 16) * 1.3;
      } else if (state === "speaking") {
        glowLightRef.current.intensity = 3.0 + Math.sin(t * 5.5) * 0.7;
      } else if (state === "success") {
        glowLightRef.current.intensity = 4.2 + Math.sin(t * 4) * 0.5;
      } else {
        glowLightRef.current.intensity = 2.0 + Math.sin(t * 2.2) * 0.4;
      }
    }

    if (secondaryLightRef.current) {
      secondaryLightRef.current.intensity =
        state === "listening" ? 2.5 + audioLevel * 2 : state === "analyzing" ? 3.0 : 1.4;
    }
  });

  const cowrieMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color:
        state === "listening"
          ? "#FFF9E6"
          : state === "success"
          ? "#F0FDF4"
          : "#FBF7EF", // Nacre royale d'ivoire poli
      emissive:
        state === "listening"
          ? "#C8861E"
          : state === "analyzing"
          ? "#E07A2B"
          : state === "speaking"
          ? "#A0522D"
          : state === "success"
          ? "#059669"
          : "#664422",
      roughness: 0.14,
      metalness: 0.38,
    });
  }, [state]);

  return (
    <group>
      {/* 1. Cœur lumineux intérieur pulsant par la fente sacrée */}
      <pointLight
        ref={glowLightRef}
        color={
          state === "listening"
            ? "#FFD700"
            : state === "analyzing"
            ? "#FF8C00"
            : state === "success"
            ? "#34D399"
            : "#FFDF80"
        }
        distance={4.8}
        decay={2}
      />

      {/* 2. Lumière secondaire zénithale de nacre */}
      <pointLight
        ref={secondaryLightRef}
        position={[0, 1.2, 0.8]}
        color={state === "listening" ? "#FFF3C4" : "#FFE0B2"}
        distance={3.2}
        decay={2}
      />

      {/* 3. Orbe Cauri principal */}
      <mesh ref={meshRef} geometry={cowrieGeo} material={cowrieMaterial} />

      {/* 4. Halo interne incandescent (feu de forge d'or) */}
      <mesh scale={0.52}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          color={
            state === "listening"
              ? "#FFD700"
              : state === "analyzing"
              ? "#FF6F00"
              : state === "success"
              ? "#10B981"
              : "#C8951E"
          }
          transparent
          opacity={state === "listening" ? 0.8 : 0.58}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/* ───────────────────────── Scène Principale & Suivi Gyroscopique ───────────────────────── */

function SceneContent({
  state,
  audioLevel = 0,
}: {
  state: OrbState;
  audioLevel?: number;
}) {
  const rootGroup = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame(() => {
    if (!rootGroup.current) return;
    // Parallaxe gyroscopique fluide et magnétique suivant le pointeur / toucher
    rootGroup.current.rotation.y = THREE.MathUtils.lerp(
      rootGroup.current.rotation.y,
      pointer.x * 0.38,
      0.06
    );
    rootGroup.current.rotation.x = THREE.MathUtils.lerp(
      rootGroup.current.rotation.x,
      -pointer.y * 0.38,
      0.06
    );
  });

  return (
    <group ref={rootGroup} position={[0, 0, 0]}>
      {/* Lumière d'ambiance chaude terracotta & or royal */}
      <ambientLight color="#FFF5EB" intensity={0.95} />
      {/* Éclairage directionnel zénithal (Soleil éclatant d'Abidjan) */}
      <directionalLight position={[3.5, 4.5, 3.5]} color="#FFE8CC" intensity={1.5} />
      {/* Contre-jour Kente pourpre royale */}
      <pointLight position={[-3.5, -2.5, -2]} color="#8B1A3B" intensity={2.0} distance={7} />

      {/* 1. Le Cœur Cauri Sacré Sublime */}
      <SacredCowrieCore state={state} audioLevel={audioLevel} />

      {/* 2. L'Astrolabe Royal : Triple Anneau Gyroscopique Akan */}
      <RoyalAkanSolarRings state={state} audioLevel={audioLevel} />

      {/* 3. L'Essaim de Particules d'Or Harmattan */}
      <HarmattanParticles state={state} audioLevel={audioLevel} />
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
      aria-label="Orbe Sacré de la Secrétaire IA Maman — Toucher pour dicter"
    >
      {/* ─── Halo d'ambiance cosmique royal d'arrière-plan ─── */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-3xl transition-all duration-700 pointer-events-none",
          state === "listening" &&
            "bg-gradient-to-tr from-[#FFC107]/50 via-[#FF9800]/40 to-[#8B1A3B]/45 scale-135 animate-pulse",
          state === "analyzing" &&
            "bg-gradient-to-tr from-[#E07A2B]/55 via-[#C8951E]/45 to-[#8B1A3B]/40 scale-125",
          state === "speaking" &&
            "bg-gradient-to-tr from-[#C8951E]/40 via-[#4A90E2]/30 to-[#FAF3E0]/35 scale-120",
          state === "success" &&
            "bg-gradient-to-tr from-[#10B981]/50 via-[#FFD700]/45 to-[#C8951E]/35 scale-140",
          state === "idle" &&
            "bg-gradient-to-tr from-[#C8951E]/25 via-[#A0522D]/20 to-transparent scale-105 group-hover:scale-115"
        )}
      />

      {/* ─── Rendu 3D WebGL (Three.js) ─── */}
      {hasWebGL ? (
        <div className="w-full h-full relative z-10 transition-transform duration-300 group-hover:scale-[1.04] group-active:scale-95">
          <Canvas
            camera={{ position: [0, 0, 4.4], fov: 46 }}
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          >
            <SceneContent state={state} audioLevel={audioLevel} />
          </Canvas>
        </div>
      ) : (
        /* Fallback 2D gracieux si WebGL indisponible */
        <div className="relative z-10 w-48 h-48 rounded-full bg-gradient-to-br from-[#FFE4A0] via-[#C8951E] to-[#8B1A3B] p-1 shadow-2xl animate-pulse flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-card flex flex-col items-center justify-center p-4 text-center">
            <span className="text-5xl mb-1">🐚</span>
            <span className="text-xs font-bold text-foreground">Orbe Cauri Sacré</span>
          </div>
        </div>
      )}

      {/* ─── Ondes Sonores Réactives en mode écoute (SVG Pulsant) ─── */}
      {state === "listening" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
          <span className="absolute w-full h-full rounded-full border-2 border-[#FFC107]/70 animate-ping opacity-75" />
          <span className="absolute w-[88%] h-[88%] rounded-full border border-[#E07A2B]/50 animate-pulse" />
        </div>
      )}
    </div>
  );
}
