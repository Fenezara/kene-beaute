"use client";
// Kènè — Descente de Peau, scène 3D (t. 82, vague 2). Trois couches
// traversées verticalement par la caméra ; les indicateurs RÉELS du
// diagnostic deviennent des orbes lumineuses (couleur scoreColor, pulsation)
// suspendues le long du voyage. ~10k triangles, tout procédural, frameloop
// piloté par le wrapper.
import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Indicator } from "@/lib/kene/types";
import { scoreColor } from "@/lib/kene/format";

type ProgressRef = React.RefObject<number>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ───────────────────────── Épiderme — surface bombée ───────────────────────── */
const surfaceNoise = (x: number, y: number) =>
  Math.sin(x * 3.1) * Math.sin(y * 2.7 + 0.8) * 0.05 + Math.sin(x * 7.3 + y * 5.1) * 0.015;

function Epidermis({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(6.4, 4.4, 96, 64);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      pos.setZ(i, surfaceNoise(v.x, v.y));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame(() => {
    const p = progressRef.current ?? 0;
    // L'épiderme est la PREMIÈRE couche : visible dès p=0 (on part DESSUS),
    // puis s'efface quand la caméra descend dans le derme.
    const vis = 1 - seg(p, 0.42, 0.62);
    if (group.current) group.current.visible = vis > 0.01;
    if (mat.current) mat.current.opacity = vis;
  });

  return (
    <group ref={group} position={[0, 0, 0]} rotation={[-0.55, 0, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial ref={mat} color="#8D5524" roughness={0.85} metalness={0.05} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 1.4, 1.2]} color="#FFD98A" intensity={6} distance={5} decay={2} />
    </group>
  );
}

/* ───────────────────────── Derme — fibres de collagène ───────────────────────── */
function Dermis({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const fibers = useRef<(THREE.Mesh | null)[]>([]);

  const tubes = useMemo(() => {
    const colors = ["#E8C9A0", "#D9A87C", "#F8F1E4", "#C99B6E"];
    return Array.from({ length: 14 }, (_, i) => {
      const x0 = -3 + (i % 7) * 0.95 + (Math.random() - 0.5) * 0.3;
      const z0 = -0.8 + Math.floor(i / 7) * 1.6 + (Math.random() - 0.5) * 0.4;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        pts.push(new THREE.Vector3(x0 + Math.sin(t * Math.PI * 1.4 + i) * 0.5, -2.1 + t * 2.2, z0 + Math.cos(t * Math.PI + i * 1.7) * 0.3));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
      return {
        geometry: new THREE.TubeGeometry(curve, 40, 0.035, 6, false),
        color: colors[i % colors.length],
      };
    });
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const vis = seg(p, 0.3, 0.55) * (1 - seg(p, 0.66, 0.85));
    if (group.current) group.current.visible = vis > 0.01;
    fibers.current.forEach((m, i) => {
      if (!m) return;
      (m.material as THREE.MeshStandardMaterial).opacity = 0.9 * vis;
      m.rotation.y = Math.sin(state.clock.elapsedTime * 0.24 + i) * 0.05;
    });
  });

  return (
    <group ref={group}>
      {tubes.map((t, i) => (
        <mesh
          key={i}
          ref={(el) => {
            fibers.current[i] = el;
          }}
          geometry={t.geometry}
        >
          <meshStandardMaterial color={t.color} roughness={0.6} metalness={0.1} transparent opacity={0} />
        </mesh>
      ))}
      <pointLight position={[1.5, -1.4, 1.5]} color="#E8A05C" intensity={7} distance={6} decay={2} />
      <pointLight position={[-2, -0.8, 0.8]} color="#B0567A" intensity={4} distance={5} decay={2} />
    </group>
  );
}

/* ───────────────────────── Hypoderme — cellules adipeuses ───────────────────────── */
function Hypodermis({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);

  const { geometry, matrices, count } = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.26, 12, 10);
    const count = 52;
    const matrices: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 5.4;
      const y = -4.5 + Math.random() * 1.8;
      const z = (Math.random() - 0.5) * 2.6;
      const s = 0.75 + Math.random() * 0.7;
      m.makeScale(s, s * 0.92, s);
      m.setPosition(x, y, z);
      matrices.push(m.clone());
    }
    return { geometry, matrices, count };
  }, []);

  // InstancedMesh : les matrices se posent UNE fois au montage (setMatrixAt,
  // puis instanceMatrix.needsUpdate) — jamais via attach par enfant.
  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const vis = seg(p, 0.6, 0.85) * (1 - seg(p, 0.96, 1.0) * 0.55);
    if (group.current) group.current.visible = vis > 0.01;
    if (mesh.current) {
      (mesh.current.material as THREE.MeshStandardMaterial).opacity = 0.95 * vis;
      mesh.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.04;
    }
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[geometry, undefined, count]}>
        <meshStandardMaterial color="#F0DFC2" roughness={0.35} metalness={0.08} transparent opacity={0} />
      </instancedMesh>
      <pointLight position={[0, -3.6, 2]} color="#FFE9C4" intensity={8} distance={6} decay={2} />
    </group>
  );
}

/* ───────────────────────── Orbes des indicateurs réels ───────────────────────── */
function ScoreOrbs({ progressRef, indicators }: { progressRef: ProgressRef; indicators: Indicator[] }) {
  const group = useRef<THREE.Group>(null);
  const orbs = useRef<(THREE.Mesh | null)[]>([]);
  const lights = useRef<(THREE.PointLight | null)[]>([]);

  // positionner les orbes le long de la descente : les 3 premières vers
  // l'épiderme, les suivantes descendent vers derme/hypoderme.
  const items = useMemo(() => {
    const sorted = [...indicators].sort((a, b) => b.pourcentage - a.pourcentage).slice(0, 6);
    return sorted.map((ind, i) => {
      const depth = i < 2 ? -0.9 : i < 4 ? -2.4 : -4.0;
      const angle = (i / Math.max(sorted.length, 1)) * Math.PI * 2;
      const x = Math.cos(angle) * (1.15 + (i % 2) * 0.35);
      const z = Math.sin(angle) * (0.9 + (i % 2) * 0.3);
      return { ind, pos: [x, depth, z] as [number, number, number], phase: i };
    });
  }, [indicators]);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const t = state.clock.elapsedTime;
    items.forEach((it, i) => {
      const mesh = orbs.current[i];
      const light = lights.current[i];
      // l'orbe s'illumine quand la descente APPROCHE sa profondeur : chaque
      // indicateur a son instant de lecture le long du voyage.
      const moment = 0.16 + i * 0.13;
      const lit = clamp01(1 - Math.abs(p - moment) * 3.1) + 0.22;
      const pulse = 0.9 + Math.sin(t * 2.2 + it.phase * 1.4) * 0.14;
      if (mesh) {
        mesh.visible = lit > 0.05;
        mesh.scale.setScalar(pulse * (0.85 + lit * 0.5));
        const m = mesh.material as THREE.MeshBasicMaterial;
        m.opacity = 0.35 + lit * 0.6;
      }
      if (light) {
        light.intensity = (0.8 + lit * 4.5) * pulse;
      }
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => {
        const c = scoreColor(it.ind.pourcentage);
        return (
          <group key={i} position={it.pos}>
            <mesh
              ref={(el) => {
                orbs.current[i] = el;
              }}
            >
              <sphereGeometry args={[0.11, 14, 12]} />
              <meshBasicMaterial color={c} transparent opacity={0.5} />
            </mesh>
            <mesh scale={1.9}>
              <sphereGeometry args={[0.11, 12, 10]} />
              <meshBasicMaterial color={c} transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            <pointLight
              ref={(el) => {
                lights.current[i] = el;
              }}
              color={c}
              intensity={1}
              distance={2.6}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
}

/* ───────────────────────── Poussière en suspension ───────────────────────── */
function Motes({ progressRef }: { progressRef: ProgressRef }) {
  const points = useRef<THREE.Points>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  const geometry = useMemo(() => {
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5.6;
      pos[i * 3 + 1] = 0.6 - Math.random() * 5.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    if (mat.current) mat.current.opacity = 0.4;
    if (points.current) points.current.rotation.y = state.clock.elapsedTime * 0.02;
    void p;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial ref={mat} color="#E8C9A0" size={0.03} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/* ───────────────────────── Caméra descendante ───────────────────────── */
function DescentRig({ progressRef }: { progressRef: ProgressRef }) {
  const smoothed = useRef(0);
  useFrame((state, delta) => {
    const p = progressRef.current ?? 0;
    smoothed.current += (p - smoothed.current) * Math.min(1, delta * 3.4);
    const sp = easedSeg(smoothed.current);
    const cam = state.camera;
    cam.position.y = 0.9 - sp * 5.2;
    cam.position.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    cam.position.z = 2.6 - sp * 0.5;
    cam.lookAt(Math.sin(state.clock.elapsedTime * 0.14) * 0.15, cam.position.y - 0.9, -0.4);
  });
  return null;
}

/** p → descente avec paliers doux aux frontières de couches. */
function easedSeg(p: number): number {
  const d = easeInOut(clamp01((p - 0.08) / 0.84));
  return d;
}

/* ───────────────────────── Canvas racine ───────────────────────── */
export default function Descent3D({
  progressRef,
  indicators,
  active,
}: {
  progressRef: ProgressRef;
  indicators: Indicator[];
  active: boolean;
}) {
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ fov: 46, position: [0, 0.9, 2.6], near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#100C08"]} />
      <fog attach="fog" args={["#100C08", 3.5, 9]} />
      <ambientLight intensity={0.5} color="#F3E0C0" />
      <directionalLight position={[2, 4, 4]} intensity={1.2} color="#FFD98A" />
      <DescentRig progressRef={progressRef} />
      <Epidermis progressRef={progressRef} />
      <Dermis progressRef={progressRef} />
      <Hypodermis progressRef={progressRef} />
      <ScoreOrbs progressRef={progressRef} indicators={indicators} />
      <Motes progressRef={progressRef} />
    </Canvas>
  );
}
