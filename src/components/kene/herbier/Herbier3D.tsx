"use client";
// Kènè — Herbier des Grandes-Mères, scène 3D (t. 83-d) : un jardin botanique
// africain entièrement procédural (zéro asset externe — offline-friendly).
// 8 plantes DISTINCTES en arc de cercle doux sur un sol ocre ; la caméra
// avance le long de l'arc au fil du scroll interne de la vue (pilotage par
// progressRef, rig Descent3D). Tap sur une plante (sphère de hit élargie,
// gardée anti-drag par ev.delta) → la carte HTML change. Halo doré rétro
// derrière la plante regardée, lampe chaude qui suit la promeneuse, pollen
// doré en suspension. Budget : ~3 500 triangles, DPR ≤ 1,5, frameloop coupé
// hors écran (pattern LoomSection). Toutes les animations vivent dans UNE
// seule boucle useFrame (Garden) + le rig caméra.
import { useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { HERBIER_PLANTS } from "./plants";

const N = HERBIER_PLANTS.length;
const STEP = THREE.MathUtils.degToRad(24); // écart angulaire entre plantes
const A0 = -((N - 1) / 2) * STEP; // angle de la 1re plante (arc ±84°)
const ARC_R = 5.4; // rayon de l'arc des plantes
const CAM_R = 2.1; // rayon de l'arc de la caméra (promenade intérieure)

const arcAngle = (i: number) => A0 + i * STEP;
const plantXZ = (i: number): [number, number] => [Math.sin(arcAngle(i)) * ARC_R, Math.cos(arcAngle(i)) * ARC_R];

type ProgressRef = React.RefObject<number>;
type ActiveRef = React.RefObject<number>;
type PointerRef = React.RefObject<{ x: number; y: number }>;

/* ───────────────────────── Sol ocre + caillasse ───────────────────────── */
function Ground() {
  const rocks = useMemo(() => {
    const out: { pos: [number, number, number]; s: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const a = A0 + Math.random() * (N - 1) * STEP;
      const r = 3.2 + Math.random() * 4.6;
      out.push({ pos: [Math.sin(a) * r, 0.03, Math.cos(a) * r], s: 0.09 + Math.random() * 0.1 });
    }
    return out;
  }, []);
  const tufts = useMemo(() => {
    const out: { pos: [number, number, number]; rot: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = A0 + Math.random() * (N - 1) * STEP;
      const r = 2.6 + Math.random() * 5.4;
      out.push({ pos: [Math.sin(a) * r, 0.07, Math.cos(a) * r], rot: Math.random() * Math.PI });
    }
    return out;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[13.5, 28]} />
        <meshStandardMaterial color="#6B4A26" roughness={1} metalness={0} />
      </mesh>
      {rocks.map((r, i) => (
        <mesh key={`r${i}`} position={r.pos} scale={r.s} rotation={[0.3 * i, 0.7 * i, 0]}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#7A6A50" roughness={0.95} flatShading />
        </mesh>
      ))}
      {tufts.map((t, i) => (
        <mesh key={`t${i}`} position={t.pos} rotation={[0, t.rot, 0.12]}>
          <coneGeometry args={[0.05, 0.16, 4, 1, true]} />
          <meshStandardMaterial color="#8A7A3A" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── Les 8 plantes (géométries distinctes) ───────────────────────── */

/** Karité — tronc + canopée d'icosphères vert sombre + fruits ocre. */
function Karite({ color }: { color: string }) {
  const fruits = useMemo(
    () =>
      [
        [0.3, 0.92, 0.34],
        [-0.36, 0.86, 0.28],
        [0.12, 1.02, -0.38],
        [-0.22, 1.1, -0.3],
        [0.42, 1.16, 0.1],
        [-0.05, 0.8, 0.44],
        [0.2, 1.26, -0.1],
        [-0.4, 1.0, -0.05],
      ] as [number, number, number][],
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.09, 0.14, 0.7, 7]} />
        <meshStandardMaterial color="#5A4030" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <icosahedronGeometry args={[0.62, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.36, 1.14, 0.2]}>
        <icosahedronGeometry args={[0.38, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.32, 1.06, -0.18]}>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
      {fruits.map((f, i) => (
        <mesh key={i} position={f}>
          <sphereGeometry args={[0.065, 6, 4]} />
          <meshStandardMaterial color="#D9A03C" roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/** Aloès — rosette de feuilles coniques charnues + rejets. */
function Aloe({ color }: { color: string }) {
  const leaves = useMemo(() => {
    const out: { rotY: number; tilt: number; h: number; r: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const ring = i % 3; // 0 debout, 1 inclinée, 2 ouverte
      out.push({
        rotY: (i / 12) * Math.PI * 2 + ring * 0.22,
        tilt: 0.3 + ring * 0.24,
        h: 0.85 - ring * 0.16,
        r: 0.14 - ring * 0.02,
      });
    }
    return out;
  }, []);
  return (
    <group>
      {leaves.map((l, i) => (
        <group key={i} rotation-y={l.rotY}>
          <mesh position={[0, l.h * 0.42, 0.17]} rotation={[-l.tilt, 0, 0]}>
            <coneGeometry args={[l.r, l.h, 6]} />
            <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
          </mesh>
        </group>
      ))}
      {/* rejets de la touffe mère */}
      {[0.3, 2.4, 4.5].map((a, i) => (
        <mesh key={`p${i}`} position={[Math.cos(a) * 0.34, 0.14, Math.sin(a) * 0.34]} rotation={[-0.45, 0, 0]}>
          <coneGeometry args={[0.08, 0.34, 5]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Moringa — tronc fin + plumets en cônes aplatis superposés + folioles. */
function Moringa({ color }: { color: string }) {
  const tiers = [0.62, 0.88, 1.1, 1.28];
  const leaflets = useMemo(() => {
    const out: { pos: [number, number, number]; rot: [number, number, number] }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      out.push({ pos: [Math.cos(a) * 0.42, 1.16 + (i % 2) * 0.12, Math.sin(a) * 0.42], rot: [Math.cos(a) * 0.9, -a, -Math.sin(a) * 0.9] });
    }
    return out;
  }, []);
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.045, 0.07, 1.1, 6, 3]} />
        <meshStandardMaterial color="#8A7A62" roughness={0.9} />
      </mesh>
      {tiers.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.52 - i * 0.09, 0.2, 8]} />
          <meshStandardMaterial color={color} roughness={0.8} flatShading />
        </mesh>
      ))}
      {leaflets.map((l, i) => (
        <mesh key={`l${i}`} position={l.pos} rotation={l.rot}>
          <coneGeometry args={[0.045, 0.24, 4]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Baobab — tronc renflé (lathe) + branches courtes + maigre feuillage. */
function Baobab({ color }: { color: string }) {
  const trunk = useMemo(() => {
    // profil renflé à la base, étranglé vers la cime
    const profile: [number, number][] = [
      [0.5, 0],
      [0.44, 0.1],
      [0.36, 0.28],
      [0.3, 0.5],
      [0.26, 0.75],
      [0.2, 1.0],
      [0.14, 1.2],
      [0.1, 1.38],
    ];
    return new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      12,
    );
  }, []);
  const branches = useMemo(() => {
    const out: { pos: [number, number, number]; rot: [number, number, number] }[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      out.push({
        pos: [Math.cos(a) * 0.12, 1.34, Math.sin(a) * 0.12],
        rot: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8],
      });
    }
    return out;
  }, []);
  return (
    <group scale={1.18}>
      <mesh geometry={trunk}>
        <meshStandardMaterial color="#7A5A3A" roughness={0.95} />
      </mesh>
      {branches.map((b, i) => (
        <mesh key={i} position={b.pos} rotation={b.rot}>
          <cylinderGeometry args={[0.02, 0.05, 0.5, 5, 1, true]} />
          <meshStandardMaterial color="#7A5A3A" roughness={0.95} />
        </mesh>
      ))}
      {[
        [0.32, 1.62, 0.1],
        [-0.24, 1.56, -0.2],
        [0.05, 1.7, -0.32],
      ].map((p, i) => (
        <mesh key={`c${i}`} position={p as [number, number, number]}>
          <icosahedronGeometry args={[0.17, 0]} />
          <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Bissap — tiges dressées + calices rouges écrasés (la fleur qui boit). */
function Bissap({ color }: { color: string }) {
  const stems = useMemo(() => {
    const out: { pos: [number, number, number]; lean: [number, number, number] }[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      out.push({
        pos: [Math.cos(a) * 0.14, 0.45, Math.sin(a) * 0.14],
        lean: [Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14],
      });
    }
    return out;
  }, []);
  const calices = useMemo(() => {
    const out: { pos: [number, number, number]; s: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 0.12 + (i % 3) * 0.11;
      out.push({ pos: [Math.cos(a) * r, 0.62 + (i % 4) * 0.22, Math.sin(a) * r], s: 0.85 + (i % 3) * 0.18 });
    }
    return out;
  }, []);
  return (
    <group>
      {stems.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.lean}>
          <cylinderGeometry args={[0.018, 0.024, 0.92, 5, 2, true]} />
          <meshStandardMaterial color="#7A8A4A" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {calices.map((c, i) => (
        <mesh key={`c${i}`} position={c.pos} scale={[c.s, c.s * 0.55, c.s]}>
          <sphereGeometry args={[0.075, 6, 4]} />
          <meshStandardMaterial color={color} roughness={0.45} />
        </mesh>
      ))}
      {[
        [0.24, 0.34, 0.1],
        [-0.2, 0.4, -0.18],
        [0.02, 0.3, 0.26],
      ].map((p, i) => (
        <mesh key={`f${i}`} position={p as [number, number, number]} rotation={[0.4, i * 1.2, 0.2]}>
          <planeGeometry args={[0.14, 0.18]} />
          <meshStandardMaterial color="#7A8A4A" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** Néré — canopée sombre + gousses pendantes en capsules allongées. */
function Nere({ color }: { color: string }) {
  const pods = useMemo(() => {
    const out: { pos: [number, number, number]; len: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const r = 0.28 + (i % 2) * 0.14;
      out.push({ pos: [Math.cos(a) * r, 0.46 - (i % 3) * 0.07, Math.sin(a) * r], len: 0.8 + (i % 3) * 0.25 });
    }
    return out;
  }, []);
  return (
    <group>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.07, 0.11, 0.85, 6, 2]} />
        <meshStandardMaterial color="#6A5240" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <icosahedronGeometry args={[0.58, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.3, 0.82, 0.16]}>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
      {pods.map((p, i) => (
        <mesh key={i} position={p.pos} scale={[0.5, p.len, 0.5]}>
          <sphereGeometry args={[0.06, 5, 4]} />
          <meshStandardMaterial color="#8B5E2A" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** Neem — tronc clair + canopée feuillue haute et lumineuse. */
function Neem({ color }: { color: string }) {
  const canopy = useMemo(
    () =>
      [
        [0, 1.06, 0, 0.5],
        [0.34, 0.92, 0.22, 0.36],
        [-0.3, 0.98, -0.2, 0.38],
        [0.1, 1.22, -0.24, 0.3],
      ] as [number, number, number, number][],
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.05, 0.09, 0.95, 6, 2]} />
        <meshStandardMaterial color="#9A8A6E" roughness={0.9} />
      </mesh>
      <mesh position={[0.16, 0.7, 0.06]} rotation={[0, 0, -0.6]}>
        <cylinderGeometry args={[0.02, 0.04, 0.5, 5, 1, true]} />
        <meshStandardMaterial color="#9A8A6E" roughness={0.9} />
      </mesh>
      {canopy.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={i % 2 === 0 ? color : "#6E9A55"} roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Plantain — stipe + grandes feuilles pliées en V le long de la nervure. */
function Plantain({ color }: { color: string }) {
  const leafGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.5, 1.25, 4, 3);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // pli en V (nervure centrale) + léger effilement vers la pointe
      pos.setZ(i, Math.abs(x) * 0.42);
      pos.setX(i, x * (1 - Math.max(0, y) * 0.28));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);
  const leaves = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ rotY: (i / 6) * Math.PI * 2, tilt: -0.35 - (i % 2) * 0.22, y: 0.85 + (i % 3) * 0.14 })),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.62, 6, 2]} />
        <meshStandardMaterial color="#7C9A4E" roughness={0.85} />
      </mesh>
      {leaves.map((l, i) => (
        <group key={i} rotation-y={l.rotY}>
          <mesh geometry={leafGeo} position={[0, l.y, 0.3]} rotation={[l.tilt + Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color={color} roughness={0.75} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const PLANT_SHAPES = [Karite, Aloe, Moringa, Baobab, Bissap, Nere, Neem, Plantain];

/* ───────────────────────── Jardin : arc + boucle unique ───────────────────────── */
function Garden({ activeRef, angleRef, onSelect }: { activeRef: ActiveRef; angleRef: React.RefObject<number>; onSelect: (i: number) => void }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  const pollen = useRef<THREE.Points>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const _v = useRef(new THREE.Vector3());

  const pollenGeo = useMemo(() => {
    const n = 170;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = A0 + Math.random() * (N - 1) * STEP;
      const r = 2.2 + Math.random() * 4.2;
      pos[i * 3] = Math.sin(a) * r;
      pos[i * 3 + 1] = 0.25 + Math.random() * 2.4;
      pos[i * 3 + 2] = Math.cos(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  // UNE boucle : bruissement, plante active agrandie, halo rétro, pollen, lampe.
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const active = activeRef.current ?? 0;
    const k = Math.min(1, delta * 3.2);
    groups.current.forEach((g, i) => {
      if (!g) return;
      const target = i === active ? 1.12 : 0.96;
      const s = THREE.MathUtils.lerp(g.scale.x, target, k);
      g.scale.setScalar(s);
      g.rotation.z = Math.sin(t * 0.6 + i * 0.9) * 0.012;
    });
    if (halo.current) {
      const a = angleRef.current ?? 0;
      _v.current.set(Math.sin(a) * (ARC_R + 1.05), 1.45, Math.cos(a) * (ARC_R + 1.05));
      halo.current.position.lerp(_v.current, Math.min(1, delta * 3.4));
      halo.current.lookAt(state.camera.position);
    }
    if (pollen.current) {
      pollen.current.rotation.y = t * 0.015;
      pollen.current.position.y = Math.sin(t * 0.3) * 0.1;
    }
    if (lamp.current) {
      const cam = state.camera;
      const len = Math.max(0.001, Math.hypot(cam.position.x, cam.position.z));
      const k3 = 3.5 / len;
      lamp.current.position.set(cam.position.x * k3, cam.position.y + 0.55, cam.position.z * k3);
    }
  });

  return (
    <group>
      <Ground />
      {HERBIER_PLANTS.map((p, i) => {
        const Shape = PLANT_SHAPES[i];
        const [x, z] = plantXZ(i);
        return (
          <group
            key={p.id}
            ref={(el) => {
              groups.current[i] = el;
            }}
            position={[x, 0, z]}
            rotation-y={Math.atan2(-x, -z)} // face au centre (côté caméra)
          >
            <Shape color={p.couleur} />
            {/* Zone de hit élargie — invisible, traversée par le raycast tap */}
            <mesh
              position={[0, 0.75, 0]}
              onClick={(ev: ThreeEvent<MouseEvent>) => {
                ev.stopPropagation();
                if (ev.delta > 12) return; // c'était un scroll/drag, pas un tap
                onSelect(i);
              }}
              onPointerOver={(ev: ThreeEvent<PointerEvent>) => {
                ev.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
              }}
            >
              <sphereGeometry args={[0.82, 6, 5]} />
              <meshBasicMaterial colorWrite={false} depthWrite={false} />
            </mesh>
          </group>
        );
      })}

      {/* Halo rétro doré derrière la plante regardée (billboard additif) */}
      <mesh ref={halo} position={[Math.sin(A0) * (ARC_R + 1.05), 1.45, Math.cos(A0) * (ARC_R + 1.05)]}>
        <circleGeometry args={[1.75, 24]} />
        <meshBasicMaterial color="#C8951E" transparent opacity={0.13} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Pollen doré en suspension discrète */}
      <points ref={pollen} geometry={pollenGeo}>
        <pointsMaterial color="#E8C078" size={0.035} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>

      {/* Lampe de la promeneuse — chaude, suit la caméra */}
      <pointLight ref={lamp} color="#FFC868" intensity={7} distance={6} decay={2} />
    </group>
  );
}

/* ───────────────────────── Rig caméra : l'arc au scroll ───────────────────────── */
function GardenRig({ progressRef, angleRef, pointerRef }: { progressRef: ProgressRef; angleRef: React.RefObject<number>; pointerRef: PointerRef | null }) {
  const smoothed = useRef(0);
  const _target = useRef(new THREE.Vector3());
  useFrame((state, delta) => {
    const p = progressRef.current ?? 0;
    smoothed.current += (p - smoothed.current) * Math.min(1, delta * 3.2);
    const a = A0 + smoothed.current * (N - 1) * STEP;
    angleRef.current = a; // partagé avec le halo (une seule vérité)
    const t = state.clock.elapsedTime;
    const px = pointerRef?.current?.x ?? 0;
    const py = pointerRef?.current?.y ?? 0;
    const cam = state.camera;
    cam.position.set(
      Math.sin(a) * CAM_R + px * 0.4,
      1.45 + Math.sin(t * 0.45) * 0.05 - py * 0.25,
      Math.cos(a) * CAM_R,
    );
    _target.current.set(Math.sin(a) * ARC_R, 1.05, Math.cos(a) * ARC_R);
    cam.lookAt(_target.current);
  });
  return null;
}

/* ───────────────────────── Canvas racine ───────────────────────── */
export default function Herbier3D({
  progressRef,
  activeRef,
  pointerRef,
  active,
  onSelect,
}: {
  progressRef: ProgressRef;
  activeRef: ActiveRef;
  pointerRef: PointerRef | null;
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const angleRef = useRef(0);
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ fov: 46, position: [0, 1.45, CAM_R], near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#0F0B07"]} />
      <fog attach="fog" args={["#0F0B07", 6, 15]} />
      <ambientLight intensity={0.52} color="#F3E0C0" />
      <hemisphereLight args={["#E8D5B0", "#3A2A18", 0.55]} />
      <directionalLight position={[4, 6, 3]} intensity={1.15} color="#FFD98A" />
      <GardenRig progressRef={progressRef} angleRef={angleRef} pointerRef={pointerRef} />
      <Garden activeRef={activeRef} angleRef={angleRef} onSelect={onSelect} />
    </Canvas>
  );
}
