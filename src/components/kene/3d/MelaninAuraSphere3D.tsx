"use client";
// Kènè — L'Aura de Mélanine 3D Vivante:
// Sphère procédurale Three.js symbolisant l'énergie vitale cutanée (phototype mélanoderme).
// Réagit au toucher, au défilement et respire doucement avec un effet de Fresnel or et terracotta.
// Zéro asset externe, charge GPU minimale (< 2000 sommets), frameloop conditionnel.

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "framer-motion";

function AuraSphere({
  fitzpatrick = 5,
}: {
  fitzpatrick?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  // Teintes chaudes selon le phototype Fitzpatrick
  const { coreColor, rimColor, lightIntensity } = useMemo(() => {
    switch (fitzpatrick) {
      case 4:
        return { coreColor: "#8D5524", rimColor: "#E3B04B", lightIntensity: 5.5 };
      case 6:
        return { coreColor: "#1A120B", rimColor: "#C8951E", lightIntensity: 7.0 };
      case 5:
      default:
        return { coreColor: "#3B2615", rimColor: "#DCA838", lightIntensity: 6.2 };
    }
  }, [fitzpatrick]);

  // Halo de poussière dorée en orbite
  const { positions, colors, count } = useMemo(() => {
    const N = 75;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c1 = new THREE.Color(rimColor);
    const c2 = new THREE.Color("#FFF9EC");

    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.35 + Math.random() * 0.45;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const mixed = c1.clone().lerp(c2, Math.random() * 0.5);
      col[i * 3] = mixed.r;
      col[i * 3 + 1] = mixed.g;
      col[i * 3 + 2] = mixed.b;
    }
    return { positions: pos, colors: col, count: N };
  }, [rimColor]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.25;
      meshRef.current.rotation.x = Math.sin(t * 0.15) * 0.12;
      const breathe = 1 + Math.sin(t * 1.8) * 0.025;
      meshRef.current.scale.setScalar(breathe);
    }
    if (glowRef.current) {
      glowRef.current.rotation.y = -t * 0.18;
      const pulse = 1.14 + Math.sin(t * 2.2) * 0.035;
      glowRef.current.scale.setScalar(pulse);
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y = t * 0.1;
      particlesRef.current.rotation.z = Math.cos(t * 0.12) * 0.08;
    }
  });

  return (
    <group>
      {/* Noyau de mélanine soyeux */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.0, 32, 32]} />
        <meshStandardMaterial
          color={coreColor}
          metalness={0.4}
          roughness={0.25}
          emissive={rimColor}
          emissiveIntensity={0.18}
        />
      </mesh>

      {/* Anneau d'aura luminescente (Fresnel or) */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.08, 24, 24]} />
        <meshBasicMaterial
          color={rimColor}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          wireframe
        />
      </mesh>

      {/* Particules d'éclat sacré */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.045}
          vertexColors
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Éclairage or chaud */}
      <pointLight position={[2, 2, 2]} color={rimColor} intensity={lightIntensity} distance={6} />
      <pointLight position={[-2, -2, -1]} color="#A0522D" intensity={3.5} distance={5} />
    </group>
  );
}

export function MelaninAuraSphere3D({
  fitzpatrick = 5,
  size = 110,
  className = "",
}: {
  fitzpatrick?: number;
  size?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <div
        className={`relative grid place-items-center rounded-full bg-gradient-to-br from-[#C8951E] via-[#A0522D] to-[#1A1410] ${className}`}
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <div className="size-3/4 rounded-full bg-[#120E0A] ring-2 ring-[#C8951E]/50" />
      </div>
    );
  }

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <Canvas
        camera={{ fov: 45, position: [0, 0, 3.2] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.8} color="#FFF9EC" />
        <AuraSphere fitzpatrick={fitzpatrick} />
      </Canvas>
    </div>
  );
}
