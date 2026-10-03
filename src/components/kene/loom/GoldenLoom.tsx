"use client";
// Kènè — La Navette d'Or (, vague 1): le tissage 3D signature du Seuil.
// Au défilement, la chaîne se tend, la navette croise la trame, le pagne
// apparaît… puis se lève comme un rideau de théâtre et révèle le médaillon
// de particules dorées. Tout est procédural (zéro asset), budget < 15k
// triangles, DPR plafonné 1,5, frameloop piloté par le wrapper (jamais de
// rendu hors écran). Rig éprouvé de Intro3D: progression dans une ref
// mutable, zéro re-render React pendant le scroll.
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type ProgressRef = React.RefObject<number>;

/* ───────── Outils (locaux — le module chapters de l'intro reste l'original) ───────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Palette kente — or, terre, bissap, sunset, karité, baobab. */
const PALETTE = ["#C8951E", "#C8951E", "#A0522D", "#8B1A3B", "#E07A2B", "#C8951E", "#A0522D"];

/* ───────────────────────── Chaîne (fils verticaux tendus) ─────────────────────────
 7 fils légèrement ondulés, révélés par drawRange au tout début du scroll. */

function Warp({ progressRef, riseRef }: { progressRef: ProgressRef; riseRef: React.RefObject<THREE.Group | null> }) {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  const tubes = useMemo(() => {
    return PALETTE.map((color, i) => {
      const x = -0.66 + (i / (PALETTE.length - 1)) * 1.32;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const y = -1.45 + (k / 8) * 2.9;
        pts.push(new THREE.Vector3(x + Math.sin(k * 1.35 + i) * 0.035, y, Math.cos(k * 1.1 + i * 2) * 0.03));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
      const geometry = new THREE.TubeGeometry(curve, 56, 0.014, 6, false);
      return { geometry, color, count: geometry.index ? geometry.index.count : 0 };
    });
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    // fenêtre décalée sous 0: la chaîne est déjà entamée (~27 %)
    // quand la bande collante arrive à l'écran — plus de premier plan vide.
    const reveal = seg(p, -0.08, 0.22);
    meshes.current.forEach((m, i) => {
      if (!m) return;
      const d = clamp01((reveal - i * 0.06) / 0.6);
      m.geometry.setDrawRange(0, Math.floor((tubes[i].count * easeOut(d)) / 3) * 3);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.92;
    });
    if (group.current) group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.22) * 0.012;
    void riseRef;
  });

  return (
    <group ref={group}>
      {tubes.map((t, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          geometry={t.geometry}
        >
          <meshStandardMaterial color={t.color} metalness={0.55} roughness={0.4} transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── Trame (la navette qui croise) ─────────────────────────
 3 fils horizontaux qui se tissent en alternance au-dessus / en-dessous de
 la chaîne (illusion du croisement), avec la navette lumineuse au bout. */

function Weft({ progressRef }: { progressRef: ProgressRef }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const shuttle = useRef<THREE.Mesh>(null);
  const shuttleLight = useRef<THREE.PointLight>(null);
  const tipPos = useRef(new THREE.Vector3());

  const tubes = useMemo(() => {
    const colors = ["#C8951E", "#E07A2B", "#C8951E"];
    return colors.map((color, i) => {
      const y = -0.55 + i * 0.55;
      const z = i % 2 === 0 ? 0.045 : -0.045; // alternance dessus/dessous
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const x = -1.15 + (k / 8) * 2.3;
        pts.push(new THREE.Vector3(x, y + Math.sin(k * 1.6 + i * 2) * 0.05, z + Math.cos(k * 1.2) * 0.02));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
      const geometry = new THREE.TubeGeometry(curve, 56, 0.018, 6, false);
      return { geometry, color, curve, count: geometry.index ? geometry.index.count : 0, y };
    });
  }, []);

  useFrame(() => {
    const p = progressRef.current ?? 0;
    // chaque fil de trame se tisse l'un après l'autre (0.14 → 0.62)
    let activeCurve: THREE.CatmullRomCurve3 | null = null;
    let activeT = 0;
    meshes.current.forEach((m, i) => {
      if (!m) return;
      const start = 0.14 + i * 0.13;
      const d = easeInOut(seg(p, start, start + 0.34));
      m.geometry.setDrawRange(0, Math.floor((tubes[i].count * d) / 3) * 3);
      (m.material as THREE.MeshStandardMaterial).opacity = 0.95;
      if (d > 0.02 && d < 0.985) {
        activeCurve = tubes[i].curve;
        activeT = d;
      }
    });
    // la navette: petite comète au bout du fil en cours de tissage
    const active = activeCurve !== null;
    if (shuttle.current) {
      shuttle.current.visible = active;
      if (active) {
        activeCurve!.getPointAt(clamp01(activeT), tipPos.current);
        shuttle.current.position.copy(tipPos.current);
        shuttle.current.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.16);
      }
    }
    if (shuttleLight.current) {
      shuttleLight.current.visible = active;
      if (active) {
        shuttleLight.current.position.copy(tipPos.current);
        shuttleLight.current.intensity = 7;
      }
    }
  });

  return (
    <group>
      {tubes.map((t, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          geometry={t.geometry}
        >
          <meshStandardMaterial color={t.color} metalness={0.7} roughness={0.3} emissive={t.color} emissiveIntensity={0.12} transparent opacity={0.95} />
        </mesh>
      ))}
      <mesh ref={shuttle} visible={false}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshBasicMaterial color="#FFE9B0" transparent opacity={0.95} />
      </mesh>
      <pointLight ref={shuttleLight} color="#E0A52B" intensity={0} distance={2.4} decay={2} visible={false} />
    </group>
  );
}

/* ───────────────────────── Le pagne tissé (shader kente compact) ───────────────────────── */

const clothVertex = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 2.1 + uTime * 0.9) * cos(p.y * 2.4 - uTime * 0.7) * uAmp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const clothFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  vec3 bandColor(float i) {
    if (i < 0.5) return vec3(0.784, 0.584, 0.118);
    if (i < 1.5) return vec3(0.545, 0.102, 0.231);
    if (i < 2.5) return vec3(0.632, 0.322, 0.176);
    if (i < 3.5) return vec3(0.972, 0.945, 0.894);
    return vec3(0.784, 0.584, 0.118);
  }
  void main() {
    vec2 uv = vUv;
    float rows = 7.0;
    float cols = 11.0;
    float row = floor(uv.y * rows);
    float col = floor(uv.x * cols);
    float idx = mod(row + col * (mod(row, 2.0) * 2.0 - 1.0), 5.0);
    vec3 c = bandColor(idx);
    float lineY = fract(uv.y * rows);
    if (lineY < 0.08) c = mix(c, vec3(0.784, 0.584, 0.118), 0.85);
    if (mod(row, 3.0) < 1.0) {
      float lx = fract(uv.x * cols);
      if (lx < 0.05) c = mix(c, vec3(0.10, 0.06, 0.04), 0.7);
    }
    c *= 0.92 + 0.08 * sin(uv.x * cols * 3.14159) * sin(uv.y * rows * 3.14159);
    float d = distance(uv, vec2(0.5));
    c *= 1.0 - d * 0.3;
    gl_FragColor = vec4(c, uOpacity);
  }
`;

function Cloth({ progressRef, riseRef }: { progressRef: ProgressRef; riseRef: React.RefObject<THREE.Group | null> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: clothVertex,
        fragmentShader: clothFragment,
        uniforms: { uTime: { value: 0 }, uAmp: { value: 0 }, uOpacity: { value: 0 } },
        transparent: true,
        side: THREE.DoubleSide,
      }),
    []
  );

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const vis = easeOut(seg(p, 0.5, 0.74));
    if (mat.current) {
      mat.current.uniforms.uTime.value = state.clock.elapsedTime;
      mat.current.uniforms.uAmp.value = 0.05 * vis;
      mat.current.uniforms.uOpacity.value = 0.96 * vis;
    }
    if (riseRef.current) {
      riseRef.current.scale.setScalar(0.94 + 0.06 * vis);
    }
  });

  return (
    <mesh position={[0, 0, -0.22]}>
      <planeGeometry args={[2.5, 1.05, 90, 26]} />
      <primitive object={material} ref={mat} attach="material" />
    </mesh>
  );
}

/* ───────────────────────── Le rideau (le tissage se lève) ───────────────────────── */

function CurtainRig({
  progressRef,
  riseRef,
}: {
  progressRef: ProgressRef;
  riseRef: React.RefObject<THREE.Group | null>;
}) {
  useFrame(() => {
    const p = progressRef.current ?? 0;
    const rise = easeInOut(seg(p, 0.76, 0.96));
    if (riseRef.current) {
      riseRef.current.position.y = rise * 2.6;
      const g = riseRef.current;
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.material && "opacity" in mesh.material) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
          m.opacity = m.userData.baseOpacity * (1 - rise * 0.9);
        }
      });
    }
  });
  return null;
}

/* ───────────────────────── Le médaillon (particules dorées) ─────────────────────────
 ~560 particules convergent d'un nuage dispersé vers un anneau + disque:
 le sceau de Kènè se matérise derrière le rideau levé. */

const MED_COLORS: [number, number, number][] = [
  [0.784, 0.584, 0.118],
  [0.914, 0.776, 0.416],
  [0.878, 0.478, 0.169],
];

function Medallion({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const attr = useRef<THREE.BufferAttribute>(null);
  const mat = useRef<THREE.PointsMaterial>(null);

  const { cur, orig, tgt, col, count } = useMemo(() => {
    const N = 560;
    const orig = new Float32Array(N * 3);
    const tgt = new Float32Array(N * 3);
    const cur = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // nuage de départ: coquille sphérique large
      const r = 2.1 + Math.random() * 1.5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      orig[i * 3] = r * Math.sin(ph) * Math.cos(th);
      orig[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6;
      orig[i * 3 + 2] = r * Math.cos(ph) * 0.5;
      // cible: médaillon — anneau (70 %) + disque intérieur (30 %)
      const ring = i < N * 0.7;
      const a = Math.random() * Math.PI * 2;
      const rr = ring ? 0.62 + (Math.random() - 0.5) * 0.05 : Math.sqrt(Math.random()) * 0.4;
      tgt[i * 3] = Math.cos(a) * rr;
      tgt[i * 3 + 1] = Math.sin(a) * rr;
      tgt[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
      const c = MED_COLORS[Math.floor(Math.random() * MED_COLORS.length)];
      const b = 0.55 + Math.random() * 0.45;
      col[i * 3] = c[0] * b;
      col[i * 3 + 1] = c[1] * b;
      col[i * 3 + 2] = c[2] * b;
    }
    cur.set(orig);
    return { cur, orig, tgt, col, count: N };
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const conv = easeInOut(seg(p, 0.7, 0.92));
    if (attr.current) {
      const arr = attr.current.array as Float32Array;
      for (let i = 0; i < count * 3; i++) arr[i] = orig[i] * (1 - conv) + tgt[i] * conv;
      attr.current.needsUpdate = true;
    }
    if (mat.current) mat.current.opacity = 0.95 * seg(p, 0.68, 0.8);
    if (group.current) {
      group.current.visible = p > 0.66;
      group.current.rotation.z = state.clock.elapsedTime * 0.06;
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.1) * 0.02;
      group.current.scale.setScalar(breathe * (0.7 + 0.3 * easeOut(conv)));
    }
  });

  return (
    <group ref={group} position={[0, 0, -0.1]} visible={false}>
      <points>
        <bufferGeometry>
          <bufferAttribute ref={attr} attach="attributes-position" args={[cur, 3]} />
          <bufferAttribute attach="attributes-color" args={[col, 3]} />
        </bufferGeometry>
        <pointsMaterial ref={mat} size={0.028} vertexColors transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      {/* filets du médaillon — joaillerie */}
      <mesh>
        <torusGeometry args={[0.64, 0.007, 8, 90]} />
        <meshBasicMaterial color="#E3B04B" transparent opacity={0.85} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.44, 0.004, 6, 70]} />
        <meshBasicMaterial color="#C8951E" transparent opacity={0.6} />
      </mesh>
      <pointLight position={[0, 0, 1.2]} color="#FFD98A" intensity={5} distance={4} decay={2} />
    </group>
  );
}

/* ───────────────────────── Caméra — respiration + cadrage adaptatif ─────────────────────────
 Le rig est calibré pour un cadre portrait (mobile). Sur écran large,
 une caméra fixe à z=3.1 laissait le tissage au centre (≈46% de la largeur)
 avec de grands vides latéraux. La distance s'adapte maintenant à l'aspect:
 on vise une LARGEUR VISIBLE ≈ 3,2 unités (pagne 2,5 + marge, médaillon entier
 en hauteur), bornée pour ne jamais coller (ultra-wide) ni s'éloigner (mobile
 = comportement historique 3,1). Lissage lerp: aucune coupure au resize. */

const LOOM_TARGET_WIDTH = 3.2;
const LOOM_DIST_MIN = 1.7;
const LOOM_DIST_MAX = 3.1;

function LoomCamera() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const aspect = Math.max(state.size.width / Math.max(state.size.height, 1), 0.42);
    // fov vertical fixe 40° (props du Canvas racine) → demi-tangente constante
    const halfTan = Math.tan((40 * Math.PI) / 180 / 2);
    const target = LOOM_TARGET_WIDTH / (2 * halfTan * aspect);
    const dist = Math.min(LOOM_DIST_MAX, Math.max(LOOM_DIST_MIN, target));
    state.camera.position.z += (dist - state.camera.position.z) * 0.08;
    state.camera.position.x = Math.sin(t * 0.32) * 0.06;
    state.camera.position.y = Math.sin(t * 0.24) * 0.05;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ───────────────────────── Canvas racine ───────────────────────── */

export default function GoldenLoom({ progressRef, active }: { progressRef: ProgressRef; active: boolean }) {
  const riseRef = useRef<THREE.Group | null>(null);
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ fov: 40, position: [0, 0, 3.1], near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.75} color="#F8E8C8" />
      <directionalLight position={[3, 4, 5]} intensity={1.9} color="#FFD98A" />
      <pointLight position={[-3, -2, 2]} intensity={4} distance={8} decay={2} color="#E07A2B" />
      <LoomCamera />
      {/* le tissage complet — monte et s'efface quand le rideau se lève */}
      <group ref={riseRef}>
        <Warp progressRef={progressRef} riseRef={riseRef} />
        <Weft progressRef={progressRef} />
        <Cloth progressRef={progressRef} riseRef={riseRef} />
      </group>
      <CurtainRig progressRef={progressRef} riseRef={riseRef} />
      <Medallion progressRef={progressRef} />
    </Canvas>
  );
}
