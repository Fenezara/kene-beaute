"use client";
// Kènè — Le Marché vivant, scène 3D (t. 83-c, vague 3). Le haut de la
// boutique devient un marché africain : 4 échoppes procédurales (poteaux,
// étals, auvents pyramidaux, ballots de tissu instanciés), guirlandes de
// lanternes chaudes en caténaire, poussière en suspension, lumière de fin
// d'après-midi. ~2,5k triangles, 100 % procédural (zéro asset, offline),
// DPR ≤ 1,5, frameloop piloté par le wrapper (rendu coupé hors écran).
// Boucle : R3F n'a qu'UN rAF — chaque sous-composant s'y abonne (useFrame)
// et n'anime que SES propres objets (refs locales), en lisant les refs
// mutables du wrapper (pattern Phase A/D de threads.ts, zéro re-render).
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

/* ───────────────────────── Contrat avec le wrapper ───────────────────────── */

export interface MarketStallDef {
  category: string;
  name: string;
  color: string; // couleur de l'auvent
}

export interface MarketRefs {
  /** pivot horizontal du drag : -1..1 (±10°) — écrit par le wrapper, lu ici */
  drag: { target: number };
  /** échoppe sélectionnée : -1 = aucune — écrit par le wrapper, lu ici */
  selected: { index: number };
}

/** PRNG mulberry32 — disposition stable des ballots d'une échoppe à l'autre. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────── Les 4 échoppes ─────────────────────────
   En arc face caméra : les corps tiennent dans le cadre mobile, les
   pointes d'auvent dépassent à peine (le marché est plus grand que le
   cadre — il respire au-delà des bords). */

const STALL_SPOTS: { pos: [number, number, number]; rotY: number }[] = [
  { pos: [-2.2, 0, 0.3], rotY: 0.3 },
  { pos: [-0.78, 0, 0.95], rotY: 0.1 },
  { pos: [0.78, 0, 0.95], rotY: -0.1 },
  { pos: [2.2, 0, 0.3], rotY: -0.3 },
];

const WOOD_DARK = "#53341E";
const WOOD = "#6B4630";
const BALLOT_COLORS = ["#C8951E", "#A0522D", "#8B1A3B", "#3F7D3F", "#E07A2B", "#E3B04B", "#F8F1E4"];

function Stall({
  def,
  spot,
  index,
  refs,
  onTap,
}: {
  def: MarketStallDef;
  spot: { pos: [number, number, number]; rotY: number };
  index: number;
  refs: RefObject<MarketRefs>;
  onTap: (index: number) => (e: ThreeEvent<MouseEvent>) => void;
}) {
  const lift = useRef<THREE.Group>(null);
  const liftY = useRef(0);
  const ballotMesh = useRef<THREE.InstancedMesh>(null);

  /* L'échoppe tapée se soulève légèrement puis retombe douce (lecture de la
     ref partagée, animation de MA ref locale — rien d'autre ne bouge). */
  useFrame((_, delta) => {
    const g = lift.current;
    if (!g) return;
    const target = refs.current.selected.index === index ? 0.13 : 0;
    liftY.current += (target - liftY.current) * Math.min(1, delta * 5);
    g.position.y = liftY.current;
  });

  /* Ballots de tissu — piles instanciées sur l'étal (matrices + couleurs
     posées UNE fois au montage via setMatrixAt/setColorAt, jamais d'attach
     d'enfant par matrice). */
  const { ballotGeo, ballots, count } = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.17, 0.115, 0.13);
    const rnd = mulberry32(index * 97 + 11);
    const count = 12;
    const ballots: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const m = new THREE.Matrix4();
    for (let pile = 0; pile < 3; pile++) {
      const px = -0.55 + pile * 0.55 + (rnd() - 0.5) * 0.06;
      const pz = 0.12 - rnd() * 0.3;
      const stack = 3 + Math.floor(rnd() * 2);
      for (let k = 0; k < stack && ballots.length < count; k++) {
        const s = 0.85 + rnd() * 0.3;
        m.makeScale(s, s, s);
        m.setPosition(px + (rnd() - 0.5) * 0.03, 0.76 + k * 0.12, pz);
        ballots.push({ m: m.clone(), c: new THREE.Color(BALLOT_COLORS[Math.floor(rnd() * BALLOT_COLORS.length)]) });
      }
    }
    return { ballotGeo: geo, ballots, count: ballots.length };
  }, [index]);

  useLayoutEffect(() => {
    const inst = ballotMesh.current;
    if (!inst) return;
    ballots.forEach((b, i) => {
      inst.setMatrixAt(i, b.m);
      inst.setColorAt(i, b.c);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [ballots]);

  return (
    <group position={spot.pos} rotation={[0, spot.rotY, 0]}>
      <group ref={lift}>
        {/* poteaux */}
        {[
          [-0.85, -0.52],
          [0.85, -0.52],
          [-0.85, 0.52],
          [0.85, 0.52],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.78, z]}>
            <cylinderGeometry args={[0.045, 0.05, 1.56, 6]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
          </mesh>
        ))}
        {/* étal */}
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[1.9, 0.44, 1.15]} />
          <meshStandardMaterial color={WOOD} roughness={0.85} />
        </mesh>
        {/* auvent — cône tronqué 4 faces (pyramide) */}
        <mesh position={[0, 1.74, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[1.22, 0.92, 0.34, 4, 1, true]} />
          <meshStandardMaterial color={def.color} roughness={0.75} side={THREE.DoubleSide} />
        </mesh>
        {/* ballots de tissu sur l'étal */}
        <instancedMesh ref={ballotMesh} args={[ballotGeo, undefined, count]}>
          <meshStandardMaterial color="#FFF9EC" roughness={0.6} />
        </instancedMesh>
        {/* Zone de tap invisible et généreuse : suit le soulèvement et le
            pivot — le raycast R3F tape l'échoppe entière, pas ses petits fils. */}
        <mesh position={[0, 0.95, 0]} onClick={onTap(index)}>
          <boxGeometry args={[2.05, 1.9, 1.35]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ───────────────────────── Guirlandes de lanternes ─────────────────────────
   Deux caténaires tendues entre les poteaux ; les lanternes (sphères
   émissives chaudes) pendent le long du fil. Tout est instancié, matrices
   posées au montage. Le fil oscille et le halo pulse — objets locaux. */

const GARLANDS: { from: [number, number, number]; to: [number, number, number]; sag: number; lanterns: number }[] = [
  { from: [-2.35, 1.95, 1.32], to: [2.35, 1.95, 1.32], sag: 0.3, lanterns: 7 },
  { from: [-2.9, 2.2, -0.15], to: [2.9, 2.2, -0.15], sag: 0.42, lanterns: 7 },
];

function catenary(from: THREE.Vector3, to: THREE.Vector3, sag: number, samples: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = from.clone().lerp(to, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

function Lanterns() {
  const lanternMesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const garlandGroups = useRef<(THREE.Group | null)[]>([]);

  const { wires, lanternMatrices, count } = useMemo(() => {
    const wires = GARLANDS.map((g) => {
      const curve = new THREE.CatmullRomCurve3(
        catenary(new THREE.Vector3(...g.from), new THREE.Vector3(...g.to), g.sag, 12),
        false,
        "catmullrom",
        0.5,
      );
      return new THREE.TubeGeometry(curve, 22, 0.008, 4, false);
    });
    const lanternMatrices: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    GARLANDS.forEach((g) => {
      const from = new THREE.Vector3(...g.from);
      const to = new THREE.Vector3(...g.to);
      for (let i = 1; i <= g.lanterns; i++) {
        const t = i / (g.lanterns + 1);
        const p = from.clone().lerp(to, t);
        p.y -= g.sag * 4 * t * (1 - t) + 0.075; // pendouille sous le fil
        const s = 0.85 + (i % 2) * 0.3;
        m.makeScale(s, s, s);
        m.setPosition(p.x, p.y, p.z);
        lanternMatrices.push(m.clone());
      }
    });
    return { wires, lanternMatrices, count: lanternMatrices.length };
  }, []);

  useLayoutEffect(() => {
    const inst = lanternMesh.current;
    if (!inst) return;
    lanternMatrices.forEach((mm, i) => inst.setMatrixAt(i, mm));
    inst.instanceMatrix.needsUpdate = true;
  }, [lanternMatrices]);

  /* Le fil respire (oscillation subtile) et le halo des lanternes pulse
     chaud — un abonnement à la boucle partagée R3F, objets 100 % locaux. */
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    garlandGroups.current.forEach((g, i) => {
      if (g) g.rotation.x = Math.sin(t * 0.55 + i * 1.3) * 0.02;
    });
    if (mat.current) mat.current.emissiveIntensity = 1.45 + Math.sin(t * 1.3) * 0.45;
  });

  return (
    <group>
      {GARLANDS.map((g, i) => (
        <group
          key={i}
          ref={(el) => {
            garlandGroups.current[i] = el;
          }}
        >
          <mesh geometry={wires[i]}>
            <meshStandardMaterial color="#3A2A1A" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Lanternes — émissives chaudes, halo pulsé (matériau partagé) */}
      <instancedMesh ref={lanternMesh} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.055, 8, 6]} />
        <meshStandardMaterial ref={mat} color="#FFD9A0" emissive="#FFAE45" emissiveIntensity={1.6} roughness={0.4} />
      </instancedMesh>
    </group>
  );
}

/* ───────────────────────── Poussière du soir ───────────────────────── */

function Dust() {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const N = 170;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6.4;
      pos[i * 3 + 1] = 0.3 + Math.random() * 2.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (points.current) points.current.rotation.y = state.clock.elapsedTime * 0.015;
  });
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color="#E8C9A0" size={0.03} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/* ───────────────────────── Le Rig : drag + caméra ─────────────────────────
   Pivot du marché ±10° (drag posé par le wrapper) et rotation lente de la
   caméra ±3° — orbite azimutale douce autour des étals. */

function MarketRig({ refs, children }: { refs: RefObject<MarketRefs>; children: React.ReactNode }) {
  const root = useRef<THREE.Group>(null);
  const dragCurrent = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Drag horizontal ±10° — lissage doux vers la cible posée par le doigt.
    dragCurrent.current += (refs.current.drag.target * 0.175 - dragCurrent.current) * Math.min(1, delta * 3.2);
    if (root.current) root.current.rotation.y = dragCurrent.current;

    // Caméra : rotation lente ±3° autour du marché (cadre compact → caméra
    // rapprochée, les échoppes remplissent le bandeau de 190px).
    const az = Math.sin(t * 0.075) * 0.052;
    const cam = state.camera;
    cam.position.x = Math.sin(az) * 4.9;
    cam.position.z = Math.cos(az) * 4.9;
    cam.position.y = 2.1 + Math.sin(t * 0.05) * 0.05;
    cam.lookAt(0, 1.3, 0.2);
  });

  return <group ref={root}>{children}</group>;
}

/* ───────────────────────── Canvas racine ───────────────────────── */

export default function MarketScene({
  stalls,
  refs,
  onStallTap,
  active,
}: {
  stalls: MarketStallDef[];
  refs: RefObject<MarketRefs>;
  onStallTap: (index: number) => void;
  active: boolean;
}) {
  const tap = (index: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onStallTap(index);
  };

  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ fov: 42, position: [0, 2.1, 4.9], near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      onPointerMissed={() => onStallTap(-1)}
    >
      <color attach="background" args={["#1B120A"]} />
      <fog attach="fog" args={["#1B120A", 7.5, 14]} />
      {/* Fin d'après-midi sur le marché : clé dorée chaude + ambiante crème */}
      <ambientLight intensity={0.55} color="#F3E0C0" />
      <directionalLight position={[3, 6, 5]} intensity={1.35} color="#FFD98A" />
      <pointLight position={[0, 2.4, 1.6]} color="#E07A2B" intensity={16} distance={8} decay={2} />

      <MarketRig refs={refs}>
        {/* Sol terre cuite + terre battue sous les étals */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[26, 18]} />
          <meshStandardMaterial color="#7A4526" roughness={1} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.4]}>
          <circleGeometry args={[3.6, 24]} />
          <meshStandardMaterial color="#8D5524" roughness={1} />
        </mesh>

        {stalls.map((def, i) => (
          <Stall key={def.category} def={def} spot={STALL_SPOTS[i % STALL_SPOTS.length]} index={i} refs={refs} onTap={tap} />
        ))}

        <Lanterns />
        <Dust />
      </MarketRig>
    </Canvas>
  );
}
