"use client";
// Kènè — Fil de Kente : le monde 3D de l'introduction.
// Une seule scène Canvas ; la progression du scroll (ref mutable, sans re-render)
// pilote caméra + révélation de chaque chapitre. Tout est procédural (zéro asset),
// budget : < 60k triangles, DPR plafonné 1,5, rendu coupé quand invisible.
import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAM, chapterT, easeInOut, easeOut } from "./chapters";

type ProgressRef = React.RefObject<number>;

/* ───────────────────────── Caméra — rig d'interpolation ───────────────────────── */

function CameraRig({ progressRef }: { progressRef: ProgressRef }) {
  const { camera } = useThree();
  const smoothed = useRef(0);
  // vecteurs de travail en ref (mutables — jamais issus de useMemo, règle immutability)
  const v = useRef({
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
  });

  useFrame((state, delta) => {
    const p = progressRef.current ?? 0;
    smoothed.current += (p - smoothed.current) * Math.min(1, delta * 3.2);
    const sp = smoothed.current;

    let i = 0;
    while (i < CAM.length - 2 && sp > CAM[i + 1].at) i++;
    const k0 = CAM[i];
    const k1 = CAM[i + 1];
    const t = easeInOut((sp - k0.at) / Math.max(k1.at - k0.at, 0.0001));
    const s = v.current;
    s.a.set(...k0.pos);
    s.b.set(...k1.pos);
    s.a.lerp(s.b, t);
    s.pos.copy(s.a);
    s.look.set(...k0.look);
    s.b.set(...k1.look);
    s.look.lerp(s.b, t);

    // respiration légère — la scène vit même sans scroll
    const time = state.clock.elapsedTime;
    s.pos.x += Math.sin(time * 0.4) * 0.07;
    s.pos.y += Math.cos(time * 0.31) * 0.05;

    camera.position.copy(s.pos);
    camera.lookAt(s.look);
  });
  return null;
}

/* ───────────────────────── Chapitre 0 — Poussière de mélanine ───────────────────────── */

const DUST_PALETTE: [number, number, number][] = [
  [0.784, 0.584, 0.118], // or Kènè
  [0.972, 0.945, 0.894], // karité
  [0.878, 0.478, 0.169], // sunset
  [0.545, 0.102, 0.231], // bissap
];

function MelaninDust({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  const attr = useRef<THREE.BufferAttribute>(null);

  const { cur, orig, tgt, col, count } = useMemo(() => {
    const N = 1100;
    const orig = new Float32Array(N * 3);
    const tgt = new Float32Array(N * 3);
    const cur = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // coquille sphérique dispersée
      const r = 3.2 + Math.random() * 4.4;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      orig[i * 3] = r * Math.sin(ph) * Math.cos(th);
      orig[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.72;
      orig[i * 3 + 2] = r * Math.cos(ph);
      // cible : galaxie spirale — les poussières se condensent
      const ang = (i / N) * Math.PI * 5.5;
      const rr = 0.5 + (i / N) * 2.9 + (Math.random() - 0.5) * 0.3;
      tgt[i * 3] = Math.cos(ang) * rr;
      tgt[i * 3 + 1] = (Math.random() - 0.5) * 0.16 + Math.sin(ang * 2) * 0.09;
      tgt[i * 3 + 2] = Math.sin(ang) * rr;
      const c = DUST_PALETTE[Math.floor(Math.random() * DUST_PALETTE.length)];
      const bright = 0.55 + Math.random() * 0.45;
      col[i * 3] = c[0] * bright;
      col[i * 3 + 1] = c[1] * bright;
      col[i * 3 + 2] = c[2] * bright;
    }
    cur.set(orig);
    return { cur, orig, tgt, col, count: N };
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const t = chapterT(p, 0, 0.15, 0, 0.5); // visible dès le premier écran
    const k = easeInOut(t.local);
    if (attr.current) {
      const arr = attr.current.array as Float32Array;
      for (let i = 0; i < count * 3; i++) arr[i] = orig[i] * (1 - k) + tgt[i] * k;
      attr.current.needsUpdate = true;
    }
    if (mat.current) mat.current.opacity = 0.95 * t.vis;
    if (group.current) {
      group.current.visible = t.vis > 0.01;
      group.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute ref={attr} attach="attributes-position" args={[cur, 3]} />
          <bufferAttribute attach="attributes-color" args={[col, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={mat}
          size={0.05}
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

/* ───────────────────────── Chapitre 1 — Le fil d'or ───────────────────────── */

function GoldenThread({ progressRef }: { progressRef: ProgressRef }) {
  const mesh = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Mesh>(null);
  const tipLight = useRef<THREE.PointLight>(null);

  const { geometry, curve, totalIndex } = useMemo(() => {
    const pts = [
      new THREE.Vector3(-3.6, -1.7, -1.0),
      new THREE.Vector3(-2.3, -0.3, 0.3),
      new THREE.Vector3(-0.9, 0.95, -0.7),
      new THREE.Vector3(0.5, 0.35, 0.5),
      new THREE.Vector3(1.9, 1.35, -0.5),
      new THREE.Vector3(3.3, 0.15, 0.2),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.6);
    const geometry = new THREE.TubeGeometry(curve, 240, 0.05, 10, false);
    return { geometry, curve, totalIndex: geometry.index ? geometry.index.count : 0 };
  }, []);

  const tipPos = useRef(new THREE.Vector3());

  useFrame(() => {
    const p = progressRef.current ?? 0;
    const reveal = easeInOut(chapterT(p, 0.1, 0.34, 0.05, 0.35).local);
    const fade = chapterT(p, 0.1, 0.4, 0.05, 0.28);

    if (mesh.current) {
      mesh.current.visible = fade.vis > 0.01;
      mesh.current.geometry.setDrawRange(0, Math.floor(totalIndex * reveal));
      const mat = mesh.current.material as THREE.MeshStandardMaterial;
      mat.opacity = fade.vis;
    }
    // la « navette » lumineuse au bout du fil
    const active = reveal > 0.02 && reveal < 0.995 && fade.vis > 0.05;
    if (tip.current) {
      tip.current.visible = active;
      curve.getPointAt(reveal, tipPos.current);
      tip.current.position.copy(tipPos.current);
      tip.current.scale.setScalar(1 + Math.sin(performance.now() * 0.008) * 0.18);
    }
    if (tipLight.current) {
      tipLight.current.visible = active;
      tipLight.current.position.copy(tipPos.current);
      tipLight.current.intensity = 9 * fade.vis;
    }
  });

  return (
    <group>
      <mesh ref={mesh} geometry={geometry}>
        <meshStandardMaterial
          color="#C8951E"
          metalness={0.85}
          roughness={0.28}
          emissive="#C8951E"
          emissiveIntensity={0.22}
          transparent
        />
      </mesh>
      <mesh ref={tip} visible={false}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#FFE9B0" transparent opacity={0.95} />
      </mesh>
      <pointLight ref={tipLight} color="#E07A2B" intensity={0} distance={4.5} decay={2} visible={false} />
    </group>
  );
}

/* ───────────────────────── Chapitre 2 — Le jardin botanique ───────────────────────── */

function Botanical({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const items = useRef<(THREE.Group | null)[]>([]);
  const setItem = (i: number) => (el: THREE.Group | null) => {
    items.current[i] = el;
  };
  const bases = useMemo(() => [[-2.35, -0.55, -1.4], [0, -0.5, -2.1], [2.35, -0.6, -1.2]], []);

  useFrame((state, delta) => {
    const p = progressRef.current ?? 0;
    const t = chapterT(p, 0.34, 0.58, 0.3, 0.28);
    const time = state.clock.elapsedTime;
    if (group.current) {
      group.current.visible = t.vis > 0.01;
      const e = easeOut(t.inT);
      group.current.position.y = -1.15 * (1 - e);
      group.current.scale.setScalar(0.62 + 0.38 * e);
      group.current.position.x = (p - 0.46) * 1.6; // léger panoramique
      group.current.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material && "opacity" in m.material) {
          (m.material as THREE.MeshStandardMaterial).opacity = t.vis;
        }
      });
    }
    items.current.forEach((it, i) => {
      if (!it) return;
      it.position.y = Math.sin(time * (0.6 + i * 0.14) + i * 2.1) * 0.09;
      it.rotation.y += delta * (0.1 + i * 0.05);
    });
  });

  return (
    <group ref={group} position={[0, -1.15, 0]}>
      {/* Baobab — force */}
      <group ref={setItem(0)} position={[bases[0][0], 0, bases[0][2]]}>
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.17, 0.26, 1.15, 7]} />
          <meshStandardMaterial color="#7A4A26" flatShading roughness={0.8} transparent />
        </mesh>
        <mesh position={[0, 1.32, 0]}>
          <dodecahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial color="#3F7D3F" flatShading roughness={0.75} transparent />
        </mesh>
        <mesh position={[0.34, 1.52, 0.12]}>
          <dodecahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#4C8A4C" flatShading roughness={0.75} transparent />
        </mesh>
        <mesh position={[-0.3, 1.58, -0.1]}>
          <dodecahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color="#356B35" flatShading roughness={0.75} transparent />
        </mesh>
      </group>

      {/* Moringa — éclat */}
      <group ref={setItem(1)} position={[bases[1][0], 0, bases[1][2]]}>
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.035, 0.055, 1.5, 6]} />
          <meshStandardMaterial color="#6B8E4E" flatShading roughness={0.8} transparent />
        </mesh>
        {[
          [0.18, 1.15, 0.08],
          [-0.2, 1.32, -0.06],
          [0.05, 1.5, 0.12],
          [-0.12, 0.95, -0.12],
          [0.22, 1.62, -0.08],
        ].map((pnt, i) => (
          <mesh key={i} position={pnt as [number, number, number]}>
            <icosahedronGeometry args={[0.14, 0]} />
            <meshStandardMaterial color={i % 2 ? "#7FA653" : "#8FB65F"} flatShading roughness={0.7} transparent />
          </mesh>
        ))}
        {[
          [0.26, 1.2, 0.16],
          [-0.26, 1.44, 0.04],
          [0.1, 1.66, 0.06],
        ].map((pnt, i) => (
          <mesh key={`f${i}`} position={pnt as [number, number, number]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#C8951E" emissive="#C8951E" emissiveIntensity={0.8} transparent />
          </mesh>
        ))}
      </group>

      {/* Karité — nutrition */}
      <group ref={setItem(2)} position={[bases[2][0], 0, bases[2][2]]}>
        <mesh position={[0, 0.62, 0]} rotation={[0, 0, 0.12]}>
          <cylinderGeometry args={[0.05, 0.09, 1.3, 6]} />
          <meshStandardMaterial color="#5C3A21" flatShading roughness={0.85} transparent />
        </mesh>
        <mesh position={[-0.08, 1.36, 0]}>
          <icosahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial color="#4C8A4C" flatShading roughness={0.75} transparent />
        </mesh>
        {/* fruits : pulpe bissap + amande karité */}
        {[
          [0.22, 1.02, 0.1, "#8B1A3B"],
          [0.34, 1.16, -0.06, "#F8F1E4"],
          [0.18, 1.2, 0.18, "#8B1A3B"],
          [-0.28, 1.1, 0.12, "#F8F1E4"],
          [0.4, 0.98, 0.06, "#8B1A3B"],
        ].map(([x, y, z, c], i) => (
          <mesh key={`k${i}`} position={[x as number, y as number, z as number]} scale={[1, 1.25, 1]}>
            <sphereGeometry args={[0.11, 10, 10]} />
            <meshStandardMaterial color={c as string} roughness={0.55} transparent />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ───────────────────────── Chapitre 3 — Le mur Fitzpatrick ───────────────────────── */

const FITZ_PANELS: { x: number; top: string; bottom: string }[] = [
  { x: -2.5, top: "#8D5524", bottom: "#5C3A21" }, // IV
  { x: 0, top: "#5C3A21", bottom: "#3B2A1E" }, // V
  { x: 2.5, top: "#3B2A1E", bottom: "#241A10" }, // VI
];

const panelVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const panelFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
    float b = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    if (b < 0.028) c = mix(c, vec3(0.784, 0.584, 0.118), 0.92);
    else if (b < 0.085) c = mix(c, vec3(0.784, 0.584, 0.118), 0.22);
    float d = distance(vUv, vec2(0.5));
    c *= 1.05 - d * 0.28;
    gl_FragColor = vec4(c, uOpacity);
  }
`;

function FitzWall({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const mats = useRef<THREE.ShaderMaterial[]>([]);
  const setMat = (i: number) => (el: THREE.ShaderMaterial | null) => {
    if (el) mats.current[i] = el;
  };

  const materials = useMemo(
    () =>
      FITZ_PANELS.map(
        (p) =>
          new THREE.ShaderMaterial({
            vertexShader: panelVertex,
            fragmentShader: panelFragment,
            uniforms: {
              uTop: { value: new THREE.Color(p.top) },
              uBottom: { value: new THREE.Color(p.bottom) },
              uOpacity: { value: 0 },
            },
            transparent: true,
          })
      ),
    []
  );

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const t = chapterT(p, 0.56, 0.75, 0.32, 0.3);
    const e = easeOut(t.inT);
    if (group.current) {
      group.current.visible = t.vis > 0.01;
      group.current.position.y = -1.4 * (1 - e) + 0.35;
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.18) * 0.04;
      const kids = group.current.children as THREE.Mesh[];
      kids.forEach((m, i) => {
        m.position.x = FITZ_PANELS[i].x * (1 + 0.65 * (1 - e));
      });
    }
    mats.current.forEach((m) => {
      const u = m.uniforms.uOpacity;
      if (u) u.value = t.vis;
    });
  });

  return (
    <group ref={group} position={[0, 0.35, -2.2]}>
      {FITZ_PANELS.map((pnl, i) => (
        <mesh key={pnl.x} position={[pnl.x, 0, 0]}>
          <planeGeometry args={[1.72, 3.7]} />
          <primitive object={materials[i]} ref={setMat(i)} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── Chapitre 4 — L'écho du scan ───────────────────────── */

const scanNoise = (x: number, y: number, z: number) =>
  Math.sin(x * 2.3) * Math.sin(y * 1.9 + 1.2) * Math.sin(z * 2.7 + 0.5) * 0.16 + Math.sin(x * 4.1 + y * 3.3) * 0.05;

const SCAN_DOTS: { dir: [number, number, number]; color: string }[] = [
  { dir: [-0.55, 0.38, 0.74], color: "#8B1A3B" },
  { dir: [0.12, 0.62, 0.77], color: "#E07A2B" },
  { dir: [0.62, -0.08, 0.78], color: "#C8951E" },
  { dir: [0.05, 0.02, 1.0], color: "#8B1A3B" },
  { dir: [-0.4, -0.42, 0.82], color: "#E07A2B" },
  { dir: [0.48, 0.44, 0.75], color: "#C8951E" },
  { dir: [-0.05, -0.66, 0.75], color: "#8B1A3B" },
];

function ScanEcho({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const headGroup = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const beamLight = useRef<THREE.PointLight>(null);
  const dotRefs = useRef<(THREE.Mesh | null)[]>([]);
  const setDot = (i: number) => (el: THREE.Mesh | null) => {
    dotRefs.current[i] = el;
  };

  const headGeometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.05, 6);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const r = 1 + scanNoise(v.x, v.y, v.z);
      pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const dotPositions = useMemo(
    () =>
      SCAN_DOTS.map(({ dir }) => {
        const v = new THREE.Vector3(...dir).normalize();
        const r = (1 + scanNoise(v.x, v.y, v.z)) * 1.03;
        return [v.x * r, v.y * r, v.z * r] as [number, number, number];
      }),
    []
  );

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const t = chapterT(p, 0.73, 0.91, 0.3, 0.28);
    const time = state.clock.elapsedTime;
    if (group.current) {
      group.current.visible = t.vis > 0.01;
      const e = easeOut(t.inT);
      group.current.scale.setScalar(0.55 + 0.45 * e);
    }
    if (headGroup.current) {
      headGroup.current.rotation.y = Math.sin(time * 0.28) * 0.28 + 0.12;
    }
    if (head.current) {
      (head.current.material as THREE.MeshStandardMaterial).opacity = 0.96 * t.vis;
    }
    // le faisceau balaie le visage une fois
    const sweep = easeInOut(Math.min(1, Math.max(0, (t.local - 0.12) / 0.78)));
    const beamY = 1.5 - sweep * 3.0;
    if (beam.current) {
      beam.current.visible = t.vis > 0.01 && sweep > 0.001 && sweep < 0.999;
      beam.current.position.y = beamY;
      (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * t.vis;
    }
    if (beamLight.current) {
      beamLight.current.visible = beam.current ? beam.current.visible : false;
      beamLight.current.position.set(0, beamY, 1.6);
      beamLight.current.intensity = 14 * t.vis;
    }
    // les zones s'allument au passage du faisceau
    dotRefs.current.forEach((d, i) => {
      if (!d) return;
      const dy = dotPositions[i][1] * 1.2; // échelle du mesh head
      const lit = Math.min(1, Math.max(0, (beamY - dy) / 0.3));
      const m = d.material as THREE.MeshStandardMaterial;
      m.opacity = lit * t.vis;
      m.emissiveIntensity = 0.4 + lit * 1.6 + Math.sin(time * 3 + i) * 0.12;
      d.visible = t.vis > 0.01;
      d.scale.setScalar((0.9 + lit * 0.35) * (1 + Math.sin(time * 2.6 + i * 1.7) * 0.07));
    });
  });

  return (
    <group ref={group}>
      <group ref={headGroup}>
        <mesh ref={head} geometry={headGeometry} scale={[1, 1.2, 0.94]}>
          <meshStandardMaterial color="#241A10" roughness={0.6} metalness={0.15} transparent opacity={0.96} />
        </mesh>
        <mesh geometry={headGeometry} scale={[1.004, 1.204, 0.944]}>
          <meshBasicMaterial color="#F8F1E4" wireframe transparent opacity={0.16} />
        </mesh>
        {SCAN_DOTS.map((d, i) => (
          <mesh key={i} ref={setDot(i)} position={dotPositions[i]} scale={[1, 1.2, 0.94]}>
            <sphereGeometry args={[0.055, 10, 10]} />
            <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={1.2} transparent opacity={0} />
          </mesh>
        ))}
      </group>
      <mesh ref={beam} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.5, 0]}>
        <planeGeometry args={[2.7, 0.045]} />
        <meshBasicMaterial color="#E07A2B" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight ref={beamLight} color="#E07A2B" intensity={0} distance={5} decay={2} />
    </group>
  );
}

/* ───────────────────────── Chapitre 5 — La bande de kente ───────────────────────── */

const kenteVertex = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 1.6 + uTime * 1.1) * cos(p.y * 2.2 - uTime * 0.8) * uAmp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const kenteFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

  vec3 bandColor(float i) {
    if (i < 0.5) return vec3(0.784, 0.584, 0.118);   // or
    if (i < 1.5) return vec3(0.545, 0.102, 0.231);   // bissap
    if (i < 2.5) return vec3(0.247, 0.490, 0.247);   // baobab
    if (i < 3.5) return vec3(0.972, 0.945, 0.894);   // karité
    if (i < 4.5) return vec3(0.141, 0.078, 0.063);   // mélanine
    if (i < 5.5) return vec3(0.878, 0.478, 0.169);   // sunset
    return vec3(0.784, 0.584, 0.118);
  }

  void main() {
    vec2 uv = vUv;
    float rows = 9.0;
    float cols = 14.0;
    float row = floor(uv.y * rows);
    float col = floor(uv.x * cols);
    float idx = mod(row + col * (mod(row, 2.0) * 2.0 - 1.0), 6.0);
    vec3 c = bandColor(idx);
    // liserés horizontaux or — les croisures de la trame
    float lineY = fract(uv.y * rows);
    if (lineY < 0.07) c = mix(c, vec3(0.784, 0.584, 0.118), 0.85);
    // fines rayures sombres sur une rangée sur trois
    if (mod(row, 3.0) < 1.0) {
      float lx = fract(uv.x * cols);
      if (lx < 0.045) c = mix(c, vec3(0.10, 0.06, 0.04), 0.72);
    }
    // armure : tissage subtil
    c *= 0.9 + 0.1 * sin(uv.x * cols * 3.14159) * sin(uv.y * rows * 3.14159);
    // vignette douce
    float d = distance(uv, vec2(0.5));
    c *= 1.0 - d * 0.38;
    gl_FragColor = vec4(c, uOpacity);
  }
`;

function KenteBand({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const sparks = useRef<THREE.Points>(null);
  const sparkMat = useRef<THREE.PointsMaterial>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: kenteVertex,
        fragmentShader: kenteFragment,
        uniforms: { uTime: { value: 0 }, uAmp: { value: 0 }, uOpacity: { value: 0 } },
        transparent: true,
        side: THREE.DoubleSide,
      }),
    []
  );

  const sparkGeo = useMemo(() => {
    const N = 170;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6.6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const t = chapterT(p, 0.88, 1.0, 0.35, 0.5); // reste visible à la fin
    const time = state.clock.elapsedTime;
    const vis = t.local > 0 ? Math.min(1, t.inT) : 0;
    if (group.current) {
      group.current.visible = vis > 0.01;
      group.current.position.y = -1.1 * (1 - easeOut(vis)) + 0.35;
    }
    if (mat.current) {
      mat.current.uniforms.uTime.value = time;
      mat.current.uniforms.uAmp.value = 0.09 * vis;
      mat.current.uniforms.uOpacity.value = vis;
    }
    if (sparks.current && sparkMat.current) {
      sparkMat.current.opacity = 0.75 * vis;
      sparks.current.rotation.y = Math.sin(time * 0.22) * 0.1;
      sparks.current.position.y = Math.sin(time * 0.5) * 0.12;
    }
  });

  return (
    <group ref={group} position={[0, 0.35, -0.6]}>
      <mesh rotation={[-0.22, 0, 0]}>
        <planeGeometry args={[6.6, 2.7, 160, 60]} />
        <primitive object={material} ref={mat} attach="material" />
      </mesh>
      <points ref={sparks} geometry={sparkGeo} position={[0, 0.7, 0.4]}>
        <pointsMaterial
          ref={sparkMat}
          color="#C8951E"
          size={0.045}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <pointLight position={[0, 2.6, 2.2]} color="#FFD98A" intensity={16} distance={9} decay={2} />
    </group>
  );
}

/* ───────────────────────── Canvas racine ───────────────────────── */

export default function Intro3D({ progressRef }: { progressRef: ProgressRef }) {
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      camera={{ fov: 42, position: [0, 0.3, 10.5], near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#1A1410"]} />
      <fog attach="fog" args={["#1A1410", 9, 26]} />
      <ambientLight intensity={0.5} color="#F8E8C8" />
      <directionalLight position={[4, 6, 6]} intensity={2.1} color="#FFD98A" />
      <pointLight position={[-6, 2, -4]} intensity={22} distance={16} decay={2} color="#E07A2B" />
      <CameraRig progressRef={progressRef} />
      <MelaninDust progressRef={progressRef} />
      <GoldenThread progressRef={progressRef} />
      <Botanical progressRef={progressRef} />
      <FitzWall progressRef={progressRef} />
      <ScanEcho progressRef={progressRef} />
      <KenteBand progressRef={progressRef} />
    </Canvas>
  );
}
