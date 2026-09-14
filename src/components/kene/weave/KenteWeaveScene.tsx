"use client";
// Kènè — Fil de Kente: la scène WebGL de la bande tissée (boutique).
// Chaîne (fils verticaux) + trame (segments horizontaux qui passent SUR puis
// SOUS la chaîne, une cellule sur deux) en meshes instanciés — une seule
// draw call par couche, ~178 instances. La navette d'or tisse rangée par
// rangée; le fil de la catégorie sélectionnée s'illumine et saute vers
// l'avant. Refs mutables → zéro re-render (pattern Phase A/D).
// Budget: DPR ≤ 1,5, cylindres 6 segments, rendu coupé hors viewport (IO).

import { useEffect, useMemo, useRef } from "react";
import { type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { KENTE_THREADS, warpThreadIndex, weftThreadIndex, type WeaveRefs } from "./threads";

const COLS = 24;
const ROWS = 6;
const CW = 0.26; // pas horizontal de la chaîne
const CH = 0.2; // pas vertical de la trame
const CELLS = COLS * ROWS;
const BAND_W = COLS * CW;
const BAND_H = ROWS * CH;
const WARP_R = 0.072;
const FRINGE = 10;
const WEAVE_SECONDS = 2.6;

const colX = (col: number) => (col - (COLS - 1) / 2) * CW;
const rowY = (row: number) => ((ROWS - 1) / 2 - row) * CH;
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/* ───────────────────────── Le métier: chaîne, trame, franges, navette ───────────────────────── */

function WeaveBand({ refs, weaveKey }: { refs: RefObject<WeaveRefs>; weaveKey?: number }) {
  const group = useRef<THREE.Group>(null);
  const weft = useRef<THREE.InstancedMesh>(null);
  const warp = useRef<THREE.InstancedMesh>(null);
  const fringe = useRef<THREE.InstancedMesh>(null);
  const shuttle = useRef<THREE.Mesh>(null);
  const shuttleLight = useRef<THREE.PointLight>(null);
  const glowLight = useRef<THREE.PointLight>(null);

 /* couleurs pré-calculées (base + version « illuminée » par fil) — dans des refs mutables, règle immutability */
  const cols = useRef({
    base: KENTE_THREADS.map((t) => new THREE.Color(t.hex)),
    bright: KENTE_THREADS.map((t) => new THREE.Color(t.hex).lerp(new THREE.Color("#FFE9B0"), 0.55)),
  }).current;

 /* état de travail — tout mutable et possédé ici, jamais de setState */
  const w = useRef({
    first: true,
    reveal: { t: 0, done: false }, // progression du tissage (delta-based)
    lastKey: 0, // dernier weaveKey vu (re-tissage demandé)
    hlK: 0, // intensité lissée de la surbrillance
    prevK: 0,
    lastHl: -2, // dernier index vu (détection de changement)
    pass: 0, // coup de navette (décroît)
    shuttlePhase: 0, // phase de la passe d'attente
    tiltX: 0,
    tiltY: 0,
    dummy: new THREE.Object3D(),
    tmp: new THREE.Color(),
  }).current;

 /* usage dynamique des matrices (elles bougent à chaque frame) */
  useEffect(() => {
    for (const m of [weft.current, warp.current, fringe.current]) {
      if (m) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05); // reprise IO / onglet: pas de saut
    const time = state.clock.elapsedTime;
    const hIdx = refs.current?.highlight.index ?? -1; // lecture seule

 /* — re-tissage demandé (weaveKey changé) puis progression du tissage — */
    if (weaveKey !== undefined && weaveKey !== w.lastKey) {
      w.lastKey = weaveKey;
      w.reveal.t = 0;
      w.reveal.done = false;
    }
    if (!w.reveal.done) {
      w.reveal.t = Math.min(1, w.reveal.t + dt / WEAVE_SECONDS);
      if (w.reveal.t >= 1) w.reveal.done = true;
    }
    const reveal = w.reveal.t;
    const woven = reveal * CELLS;

 /* — surbrillance: détection de changement + intensité lissée + coup de navette — */
    if (hIdx !== w.lastHl) {
      w.lastHl = hIdx;
      w.hlK = 0; // le nouveau fil s'allume en fondu
      if (hIdx >= 0) {
        w.pass = 1;
        if (glowLight.current) glowLight.current.color.set(KENTE_THREADS[hIdx].hex);
      }
    }
    const target = hIdx >= 0 ? 1 : 0;
    w.hlK += (target - w.hlK) * Math.min(1, dt * 5.5);
    w.pass = Math.max(0, w.pass - dt * 0.9);
    const k = w.hlK;
 /* couleurs re-upload seulement pendant la transition (stabilisé → zéro upload) */
    const doColors = w.first || Math.abs(target - k) > 0.002 || w.prevK > 0.004 !== k > 0.004;

 /* — parallaxe pointer + ajustement à la largeur du viewport — */
    if (group.current) {
      w.tiltX += (-state.pointer.y * 0.07 - w.tiltX) * Math.min(1, dt * 4);
      w.tiltY += (state.pointer.x * 0.13 - w.tiltY) * Math.min(1, dt * 4);
      group.current.rotation.x = w.tiltX;
      group.current.rotation.y = w.tiltY;
      const vw = state.viewport;
      const sc = Math.min(1.35, Math.min((vw.width * 0.94) / BAND_W, (vw.height * 0.8) / BAND_H));
      group.current.scale.setScalar(sc);
    }

 /* — trame: 144 segments, sur/sous la chaîne, tissés un à un — */
    if (weft.current) {
      for (let i = 0; i < CELLS; i++) {
        const col = i % COLS;
        const row = (i / COLS) | 0;
        const s = easeOut(clamp01((woven - i) / 7)); // pop sur ~7 cellules
        const idx = weftThreadIndex(col, row, ROWS);
        const hot = idx === hIdx && k > 0.004;
        const d = w.dummy;
        d.position.set(
          colX(col),
          rowY(row) + (1 - s) * 0.18, // tombe en place
          ((col + row) % 2 === 0 ? 1 : -1) * 0.052 + Math.sin(time * 1.5 + col * 0.55 + row * 0.9) * 0.012 * s + (hot ? k * 0.09 : 0),
        );
        d.rotation.set(0, 0, Math.sin(time * 0.8 + i * 0.7) * 0.03 * s);
        d.scale.set(
          0.04 + 0.96 * s,
          s * (hot ? 1 + k * 0.14 : 1),
          (hot ? 1 + k * 0.14 : 1) * (0.55 + 0.45 * s),
        );
        d.updateMatrix();
        weft.current.setMatrixAt(i, d.matrix);
        if (doColors) {
          w.tmp.copy(cols.base[idx]);
          if (hot) w.tmp.lerp(cols.bright[idx], k);
          weft.current.setColorAt(i, w.tmp);
        }
      }
      weft.current.instanceMatrix.needsUpdate = true;
      if (doColors && weft.current.instanceColor) weft.current.instanceColor.needsUpdate = true;
    }

 /* — chaîne: montée rapide au début (le métier se tend avant le tissage) — */
    if (warp.current) {
      const wrS = easeOut(clamp01(reveal / 0.16));
      for (let col = 0; col < COLS; col++) {
        const idx = warpThreadIndex(col);
        const hot = idx === hIdx && k > 0.004;
        const d = w.dummy;
        d.position.set(colX(col), 0, Math.sin(time * 1.2 + col * 0.5) * 0.01 + (hot ? k * 0.06 : 0));
        d.rotation.set(0, 0, 0);
        d.scale.set(hot ? 1 + k * 0.12 : 1, 0.06 + 0.94 * wrS, hot ? 1 + k * 0.12 : 1);
        d.updateMatrix();
        warp.current.setMatrixAt(col, d.matrix);
        if (doColors) {
          w.tmp.copy(cols.base[idx]);
          if (hot) w.tmp.lerp(cols.bright[idx], k);
          warp.current.setColorAt(col, w.tmp);
        }
      }
      warp.current.instanceMatrix.needsUpdate = true;
      if (doColors && warp.current.instanceColor) warp.current.instanceColor.needsUpdate = true;
    }

 /* — franges: restes de chaîne sous la bande, révélées en fin de tissage — */
    if (fringe.current) {
      const frS = easeOut(clamp01((reveal - 0.82) / 0.18));
      for (let i = 0; i < FRINGE; i++) {
        const x = -BAND_W / 2 + 0.3 + (i / (FRINGE - 1)) * (BAND_W - 0.6) + Math.sin(i * 7.3) * 0.08;
        const d = w.dummy;
        d.position.set(x, -BAND_H / 2 - 0.16 * frS, 0);
        d.rotation.set(0, 0, Math.sin(time * 1.7 + i * 1.3) * 0.16 * frS);
        d.scale.set(1, 0.05 + 0.95 * frS, 1);
        d.updateMatrix();
        fringe.current.setMatrixAt(i, d.matrix);
        if (w.first) {
          w.tmp.copy(cols.base[warpThreadIndex(Math.floor(i * 2.7))]);
          fringe.current.setColorAt(i, w.tmp);
        }
      }
      fringe.current.instanceMatrix.needsUpdate = true;
      if (w.first && fringe.current.instanceColor) fringe.current.instanceColor.needsUpdate = true;
    }

 /* — la navette d'or: tisse pendant la révélation, puis passes lentes — */
    if (shuttle.current && shuttleLight.current) {
      let sx: number;
      let sy: number;
      let tiltZ: number;
      if (reveal < 0.998) {
        const kf = Math.max(0, woven - 1);
        const row = Math.min(ROWS - 1, Math.floor(kf / COLS));
        const col = kf - row * COLS;
        sx = colX(col);
        sy = rowY(row) + Math.sin(time * 14) * 0.02;
        tiltZ = (row % 2 === 0 ? -1 : 1) * 0.12;
      } else {
        w.shuttlePhase += dt * (0.5 + w.pass * 2.4);
        const ph = w.shuttlePhase;
        sx = Math.sin(ph) * (BAND_W / 2 + 0.15);
        sy = Math.sin(ph * 2.17) * (BAND_H * 0.32);
        tiltZ = Math.cos(ph) > 0 ? -0.14 : 0.14;
      }
      const pulse = 1 + Math.sin(time * 9) * 0.05;
      shuttle.current.position.set(sx, sy, 0.2);
      shuttle.current.rotation.set(0, 0, tiltZ + Math.sin(time * 2.4) * 0.05);
      shuttle.current.scale.set(0.42 * pulse, 0.12 * pulse, 0.1 * pulse);
      shuttleLight.current.position.copy(shuttle.current.position);
      shuttleLight.current.intensity = 3 + w.pass * 8 + (reveal < 1 ? 3 : 0);
    }

 /* — lueur frontale de la surbrillance — */
    if (glowLight.current) {
      glowLight.current.intensity = k * 5;
    }

    w.prevK = k;
    w.first = false;
  });

  return (
    <group ref={group}>
      {/* trame — segments horizontaux, sur/sous la chaîne */}
      <instancedMesh ref={weft} args={[undefined, undefined, CELLS]} frustumCulled={false}>
        <boxGeometry args={[CW * 1.04, CH * 0.62, 0.11]} />
        <meshStandardMaterial roughness={0.52} metalness={0.16} />
      </instancedMesh>

      {/* chaîne — fils verticaux tendus */}
      <instancedMesh ref={warp} args={[undefined, undefined, COLS]} frustumCulled={false}>
        <cylinderGeometry args={[WARP_R, WARP_R, BAND_H * 1.08, 6]} />
        <meshStandardMaterial roughness={0.5} metalness={0.2} />
      </instancedMesh>

      {/* franges — restes de chaîne */}
      <instancedMesh ref={fringe} args={[undefined, undefined, FRINGE]} frustumCulled={false}>
        <cylinderGeometry args={[0.016, 0.026, 0.34, 5]} />
        <meshStandardMaterial roughness={0.6} metalness={0.1} />
      </instancedMesh>

      {/* la navette d'or — elle porte le fil à travers la chaîne */}
      <mesh ref={shuttle} scale={[0.42, 0.12, 0.1]}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#C8951E" metalness={0.9} roughness={0.22} emissive="#C8951E" emissiveIntensity={1.1} />
      </mesh>
      <pointLight ref={shuttleLight} color="#FFD98A" intensity={3} distance={2} decay={2} />

      {/* lueur du fil mis en avant */}
      <pointLight ref={glowLight} position={[0, 0, 1.5]} intensity={0} distance={3.2} decay={2} />
    </group>
  );
}

/* ───────────────────────── Canvas racine ───────────────────────── */

export default function KenteWeaveScene({
  refs,
  frameloop,
  weaveKey,
}: {
  refs: RefObject<WeaveRefs>;
  frameloop: "always" | "never";
  weaveKey?: number;
}) {
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.35]}
      frameloop={frameloop}
      camera={{ fov: 42, position: [0, 0.04, 2.5], near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.6} color="#F8E8C8" />
      <directionalLight position={[2.5, 4, 5]} intensity={1.9} color="#FFD98A" />
      <WeaveBand refs={refs} weaveKey={weaveKey} />
    </Canvas>
  );
}
