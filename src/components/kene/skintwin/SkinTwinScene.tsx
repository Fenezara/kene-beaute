"use client";
// Kènè — Skin Twin : la scène 3D du Jumeau de Peau.
// Buste sculpté procéduralement (zéro asset externe) : tête (bosses gaussiennes),
// cou, torse ellipsoïdal, moufles, socle muséal à liseré or. Les marqueurs du
// diagnostic sont projetés sur la surface (voir twinMath). Rotation au drag avec
// inertie + auto-rotation après repos, balayage scanner sunset à l'apparition,
// orbite du Fil d'Or (continuité de l'introduction Kènè).
// Budget perf : < 25k triangles, DPR ≤ 1,5, rendu coupé hors viewport (frameloop prop).

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PROJECT_WEEKS_MAX, projectMarkerSev } from "@/lib/kene/evolution";
import {
  DEFAULT_SKIN,
  HAND,
  HEAD_CENTER,
  SEV_HEX,
  TORSO_CENTER,
  TORSO_RADII,
  headRadius,
  type DragState,
  type TwinMarker,
} from "./twinMath";

export interface SkinTwinSceneProps {
  markers: TwinMarker[];
  skinTone: string;
  rimColor: string;
  activeIndex: number | null;
  onSelect: (i: number) => void;
  dragRef: React.RefObject<DragState>;
  frameloop: "always" | "never";
  /** Cible de projection (Fil du Temps) : t ∈ [0,1] → 0..12 semaines, adh facteur — mutable, zéro re-render. */
  projRef?: React.RefObject<{ t: number; adh: number }> | null;
}

type DragRef = React.RefObject<DragState>;
type RevealRef = React.RefObject<{ t: number }>;

/** Couleurs de sévérité précalculées (jamais allouées dans la boucle de rendu). */
const SEV_COL = SEV_HEX.map((h) => new THREE.Color(h));
const RIM_GREEN = new THREE.Color("#3F7D3F");

/* ───────────────────────── Le buste ───────────────────────── */

function Bust({
  skin,
  markers,
  activeIndex,
  onSelect,
  dragRef,
  revealRef,
  rimColor,
  projRef,
}: {
  skin: string;
  markers: TwinMarker[];
  activeIndex: number | null;
  onSelect: (i: number) => void;
  dragRef: DragRef;
  revealRef: RevealRef;
  rimColor: string;
  projRef: SkinTwinSceneProps["projRef"];
}) {
  const figure = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const torusMat = useRef<THREE.MeshLambertMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const markerRefs = useRef<(THREE.Mesh | null)[]>([]);
  // couleur de base du liseré (lue par frame — copie dans le matériau, jamais réassignée)
  const rimBase = useMemo(() => new THREE.Color(rimColor), [rimColor]);
  const setMarker = (i: number) => (el: THREE.Mesh | null) => {
    markerRefs.current[i] = el;
  };

  // Tête sculptée — construite une fois (la même fonction rayon sert aux marqueurs,
  // donc les pastilles reposent exactement sur la surface sculptée).
  // Perf : géométries non-indexées + computeVertexNormals → normales PLATES déjà
  // calculées côté CPU ; le matériau n'a PAS besoin du flag flatShading (chemin
  // fragment-shader à dérivées, coûteux en rendu logiciel).
  const headGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 4);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const r = headRadius(d);
      pos.setXYZ(i, d.x * r, d.y * r, d.z * r);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const faceted = useMemo(() => {
    const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
      // PolyhedronGeometry est déjà non-indexée (normales sphériques lisses) →
      // on recalcule des normales de face ; sinon on passe par toNonIndexed.
      const ng = g.index ? g.toNonIndexed() : g;
      if (ng !== g) g.dispose();
      ng.computeVertexNormals();
      return ng;
    };
    return {
      torso: flat(new THREE.IcosahedronGeometry(1, 3)),
      hand: flat(new THREE.IcosahedronGeometry(1, 2)),
      neck: flat(new THREE.CylinderGeometry(0.145, 0.175, 0.3, 10)),
      pedestal: flat(new THREE.CylinderGeometry(0.74, 0.8, 0.07, 44)),
    };
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dr = dragRef.current;

    /* rotation : inertie du drag, puis auto-rotation douce après repos */
    if (!dr.down) {
      if (Math.abs(dr.velY) > 0.0004) {
        dr.rotY += dr.velY;
        dr.velY *= Math.exp(-4.2 * delta);
      }
      dr.idle += delta;
      dr.rotY += Math.min(1, Math.max(0, (dr.idle - 2.6) / 2.4)) * 0.2 * delta;
    }

    if (figure.current) {
      figure.current.rotation.y = dr.rotY;
    }
    if (tilt.current) {
      tilt.current.rotation.x += (dr.rotX - tilt.current.rotation.x) * Math.min(1, delta * 9);
      tilt.current.position.y = Math.sin(t * 0.85) * 0.012; // respiration
    }

    /* balayage scanner : une fois, à l'apparition (plan additif, sans lumière — perf) */
    const rv = revealRef.current;
    rv.t += delta;
    const sweep = Math.min(1, Math.max(0, (rv.t - 0.25) / 1.7));
    const e = sweep * sweep * (3 - 2 * sweep);
    const beamY = 2.05 - e * 2.1;
    const beamOn = rv.t > 0.25 && sweep < 1;
    if (beam.current) {
      beam.current.visible = beamOn;
      beam.current.position.y = beamY;
      (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.8;
    }

    /* pastilles : révélées au passage du faisceau par pop d'échelle (opaques — zéro
       blending), puis pulsation cardiaque. Le Fil du Temps (projRef) fait « guérir »
       les marqueurs : couleur interpolée vers le vert, échelle réduite — valeurs
       continues, mutées en place (zéro allocation par frame). */
    const pj = projRef?.current;
    markerRefs.current.forEach((m, i) => {
      if (!m) return;
      const data = markers[i];
      const lit = sweep >= 1 || beamY < data.pos[1] + 0.04;
      const active = i === activeIndex;
      const pulse = 1 + Math.sin(t * 2.6 + i * 1.31) * 0.09;

      let sf = data.sev;
      if (pj && pj.t > 0.001) {
        sf = projectMarkerSev(data.sev, data.pct, pj.t * PROJECT_WEEKS_MAX, pj.adh, data.label);
      }
      const s0 = Math.min(3, Math.max(0, Math.floor(sf)));
      const s1 = Math.min(3, s0 + 1);
      const fr = sf - s0;
      const mat = m.material as THREE.MeshLambertMaterial;
      mat.color.copy(SEV_COL[s0]);
      if (s1 !== s0 && fr > 0.001) mat.color.lerp(SEV_COL[s1], fr);
      mat.emissive.copy(mat.color);
      const ratio = data.sev > 0.001 ? Math.min(1, sf / data.sev) : 1;
      const shrink = 0.45 + 0.55 * ratio;

      const target = lit ? (active ? 1.55 : 1) * pulse * shrink : 0.0001;
      m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, target, Math.min(1, delta * 10)));
      m.visible = m.scale.x > 0.01;
      mat.emissiveIntensity = active ? 2.6 + Math.sin(t * 3.1) * 0.3 : 1.15 + Math.sin(t * 2.6 + i * 1.31) * 0.25;
    });

    /* halo doré sur la pastille active (billboard vers la caméra) */
    if (halo.current) {
      const has = activeIndex != null && activeIndex < markers.length;
      halo.current.visible = has;
      if (has && activeIndex != null) {
        const p = markers[activeIndex].pos;
        halo.current.position.set(p[0], p[1], p[2]);
        halo.current.lookAt(state.camera.position);
        (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 3) * 0.16;
      }
    }

    /* liseré doré du socle — il respire avec le score global (émissif, sans lumière) ;
       sous projection, il verdit doucement (l'horizon de soin) */
    if (torusMat.current) {
      torusMat.current.emissiveIntensity = 0.55 + Math.sin(t * 1.7) * 0.22;
      const g = pj ? Math.min(1, pj.t) : 0;
      torusMat.current.color.copy(rimBase);
      if (g > 0.001) torusMat.current.color.lerp(RIM_GREEN, g * 0.75);
      torusMat.current.emissive.copy(torusMat.current.color);
    }
  });

  const skinMat = (
    <meshLambertMaterial color={skin} emissive="#1A0E06" emissiveIntensity={0.55} />
  );

  return (
    <group ref={figure}>
      <group ref={tilt}>
        {/* tête sculptée */}
        <mesh geometry={headGeo} position={HEAD_CENTER}>
          {skinMat}
        </mesh>
        {/* cou */}
        <mesh geometry={faceted.neck} position={[0, 0.98, 0]}>
          <meshLambertMaterial color={skin} emissive="#1A0E06" emissiveIntensity={0.55} />
        </mesh>
        {/* torse */}
        <mesh geometry={faceted.torso} position={TORSO_CENTER} scale={[TORSO_RADII.x, TORSO_RADII.y, TORSO_RADII.z]}>
          {skinMat}
        </mesh>
        {/* mains stylisées */}
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={faceted.hand} position={[s * HAND.x, HAND.y, HAND.z]} scale={[HAND.rx, HAND.ry, HAND.rz]} rotation={[0, 0, s * -0.12]}>
            {skinMat}
          </mesh>
        ))}

        {/* pastilles du diagnostic */}
        {markers.map((m, i) => (
          <mesh
            key={m.key}
            ref={setMarker(i)}
            position={m.pos}
            scale={0.0001}
            onClick={(ev) => {
              ev.stopPropagation();
              if (dragRef.current.dragged) return;
              onSelect(i);
            }}
            onPointerOver={(ev) => {
              ev.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          >
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshLambertMaterial color={SEV_HEX[m.sev]} emissive={SEV_HEX[m.sev]} emissiveIntensity={1.2} />
          </mesh>
        ))}

        {/* halo de la pastille active */}
        <mesh ref={halo} visible={false}>
          <ringGeometry args={[0.085, 0.105, 40]} />
          <meshBasicMaterial color="#F8F1E4" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>

        {/* faisceau scanner */}
        <mesh ref={beam} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <planeGeometry args={[1.9, 0.05]} />
          <meshBasicMaterial color="#E07A2B" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      {/* socle muséal */}
      <mesh geometry={faceted.pedestal} position={[0, 0.035, 0]}>
        <meshLambertMaterial color="#241A10" emissive="#0D0805" emissiveIntensity={0.8} />
      </mesh>
        {/* liseré du socle — teinté par le score global, il respire (émissif, sans lumière) */}
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.76, 0.016, 10, 56]} />
        <meshLambertMaterial ref={torusMat} color="#C8951E" emissive={rimColor} emissiveIntensity={0.75} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── L'orbite du Fil d'Or ───────────────────────── */

function GoldOrbit() {
  const ring = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.y = t * 0.22;
      ring.current.rotation.z = 0.16 + Math.sin(t * 0.31) * 0.05;
      ring.current.position.y = 1.02 + Math.sin(t * 0.5) * 0.03;
    }
  });
  return (
    <group ref={ring} position={[0, 1.02, 0]} rotation={[0.42, 0, 0.16]}>
      <mesh>
        <torusGeometry args={[1.04, 0.012, 8, 120]} />
        <meshLambertMaterial color="#C8951E" emissive="#C8951E" emissiveIntensity={0.75} />
      </mesh>
      {[0, 2.2, 4.4].map((a) => (
        <mesh key={a} position={[Math.cos(a) * 1.04, Math.sin(a) * 1.04, 0]}>
          <sphereGeometry args={[0.026, 10, 10]} />
          <meshLambertMaterial color="#E8B96A" emissive="#C8951E" emissiveIntensity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── Caméra adaptative ───────────────────────── */

function CameraRig() {
  const { camera, size } = useThree();
  useFrame(() => {
    const aspect = size.width / Math.max(1, size.height);
    const targetZ = aspect < 1 ? 3.7 : aspect < 1.4 ? 3.35 : 3.1;
    // méthodes uniquement (règle immutability) — jamais d'assignation directe
    const z = camera.position.z + (targetZ - camera.position.z) * 0.08;
    camera.position.set(0.22, 1.06, z);
    camera.lookAt(0, 1.0, 0);
  });
  return null;
}

/* ───────────────────────── Canvas racine ───────────────────────── */

export default function SkinTwinScene({
  markers,
  skinTone,
  rimColor,
  activeIndex,
  onSelect,
  dragRef,
  frameloop,
  projRef,
}: SkinTwinSceneProps) {
  const revealRef = useRef({ t: 0 });

  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      frameloop={frameloop}
      camera={{ fov: 42, position: [0.22, 1.06, 3.3], near: 0.1, far: 30 }}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* fond mélanine opaque — le composite alpha coûte cher (budget perf) */}
      <color attach="background" args={["#241A10"]} />
      <ambientLight intensity={0.6} color="#F8E8C8" />
      <directionalLight position={[3.2, 4.6, 4]} intensity={1.7} color="#FFD98A" />
      <pointLight position={[-4, 2.4, -3]} intensity={16} distance={12} decay={2} color="#E07A2B" />
      <CameraRig />
      <Bust
        skin={skinTone || DEFAULT_SKIN}
        markers={markers}
        activeIndex={activeIndex}
        onSelect={onSelect}
        dragRef={dragRef}
        revealRef={revealRef}
        rimColor={rimColor}
        projRef={projRef}
      />
      <GoldOrbit />
    </Canvas>
  );
}
