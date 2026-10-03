"use client";
// Kènè — Le Sanctuaire 3D Africain: Animation procédurale temps réel pilotée par le défilement.
//
// 4 Chapitres Cosmiques & Métaphoriques au fil du scroll:
// 1. [0.00 - 0.28] La Poussière Cosmique de Mélanine (Vortex de particules or, karité, bissap)
// 2. [0.24 - 0.58] Le Métier à Tisser & La Navette d'Or (Chaîne, trame kente et navette lumineuse)
// 3. [0.54 - 0.82] Le Sanctuaire Botanique 3D (Karité, Baobab, Moringa, Bissap en suspension orbitale)
// 4. [0.78 - 1.00] Le Sceau Royal Adinkra Duafe (Médaillon d'orfèvrerie Akan et anneaux concentriques)
//
// Budget & Performance:
// • Zéro asset 3D externe (100 % procédural, 0 ko de téléchargement réseau supplémentaire)
// • Moins de 22k sommets au total, frameloop réactif (coupure automatique hors écran)
// • Pilotage par ref mutable (0 re-render React pendant le scroll à 60 fps)
// • Caméra lerpée adaptative portrait / paysage (mobile et desktop)

import { useMemo, useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Compass, Eye, ShieldCheck } from "lucide-react";

type ProgressRef = React.RefObject<number>;

/* ───────── Mathématiques & Courbes d'Asservissement ───────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* ───────── Palette Panafricaine Royale ───────── */
const PALETTE_KENTE = ["#C8951E", "#E3B04B", "#A0522D", "#8B1A3B", "#3F7D3F", "#C8951E"];
const DUST_COLORS: [number, number, number][] = [
  [0.784, 0.584, 0.118], // Or Impérial Akan
  [0.972, 0.945, 0.894], // Blanc Kaolin / Karité
  [0.878, 0.478, 0.169], // Ocre de Latérite
  [0.545, 0.102, 0.231], // Rouge Bissap
  [0.247, 0.490, 0.247], // Vert Baobab
];

/* ─────────────────────────────────────────────────────────────
   1. LA POUSSIÈRE COSMIQUE DE MÉLANINE (Chapitre 1 : 0.00 → 0.30)
   ───────────────────────────────────────────────────────────── */
function MelaninCosmos({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  const attr = useRef<THREE.BufferAttribute>(null);

  const { cur, orig, tgt, col, count } = useMemo(() => {
    const N = 850;
    const orig = new Float32Array(N * 3);
    const tgt = new Float32Array(N * 3);
    const cur = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      // Coquille sphérique étoilée
      const r = 2.8 + Math.random() * 3.8;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      orig[i * 3] = r * Math.sin(ph) * Math.cos(th);
      orig[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
      orig[i * 3 + 2] = r * Math.cos(ph);

      // Galaxie spirale en spirale logarithmique
      const ang = (i / N) * Math.PI * 6.0;
      const rr = 0.4 + (i / N) * 2.4 + (Math.random() - 0.5) * 0.25;
      tgt[i * 3] = Math.cos(ang) * rr;
      tgt[i * 3 + 1] = (Math.random() - 0.5) * 0.2 + Math.sin(ang * 2.2) * 0.12;
      tgt[i * 3 + 2] = Math.sin(ang) * rr;

      const c = DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)];
      const bright = 0.6 + Math.random() * 0.4;
      col[i * 3] = c[0] * bright;
      col[i * 3 + 1] = c[1] * bright;
      col[i * 3 + 2] = c[2] * bright;
    }
    cur.set(orig);
    return { cur, orig, tgt, col, count: N };
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const active = seg(p, -0.05, 0.32);
    const fade = 1 - seg(p, 0.28, 0.36);
    const k = easeInOut(active);

    if (attr.current) {
      const arr = attr.current.array as Float32Array;
      for (let i = 0; i < count * 3; i++) {
        arr[i] = orig[i] * (1 - k) + tgt[i] * k;
      }
      attr.current.needsUpdate = true;
    }

    const opacity = (0.2 + 0.8 * easeOut(active)) * fade;
    if (mat.current) mat.current.opacity = Math.max(0, opacity);
    if (group.current) {
      group.current.visible = opacity > 0.01;
      group.current.rotation.y = state.clock.elapsedTime * 0.08 + p * 2.0;
      group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.05;
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
          size={0.042}
          vertexColors
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   2. LE MÉTIER À TISSER LA TRICOTURE ROYALE (Chapitre 2 : 0.24 → 0.58)
   ───────────────────────────────────────────────────────────── */
function LoomThreads({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const warpMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const shuttle = useRef<THREE.Mesh>(null);
  const shuttleLight = useRef<THREE.PointLight>(null);
  const shuttlePos = useRef(new THREE.Vector3());

  // Fils verticaux de chaîne (7 tubes kente)
  const warps = useMemo(() => {
    return PALETTE_KENTE.map((color, i) => {
      const x = -0.75 + (i / (PALETTE_KENTE.length - 1)) * 1.5;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 7; k++) {
        const y = -1.5 + (k / 7) * 3.0;
        pts.push(new THREE.Vector3(x + Math.sin(k * 1.4 + i) * 0.03, y, Math.cos(k * 1.1 + i * 1.8) * 0.025));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
      const geometry = new THREE.TubeGeometry(curve, 48, 0.016, 6, false);
      return { geometry, color, count: geometry.index ? geometry.index.count : 0 };
    });
  }, []);

  // Fil horizontal de trame avec trajectoire de la navette
  const weft = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 9; k++) {
      const x = -1.2 + (k / 9) * 2.4;
      pts.push(new THREE.Vector3(x, Math.sin(k * 1.8) * 0.08, Math.cos(k * 2.2) * 0.04));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    const geometry = new THREE.TubeGeometry(curve, 60, 0.022, 6, false);
    return { geometry, curve, count: geometry.index ? geometry.index.count : 0 };
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const loomIn = seg(p, 0.22, 0.44);
    const loomOut = 1 - seg(p, 0.52, 0.62);
    const vis = easeInOut(loomIn) * loomOut;

    if (group.current) {
      group.current.visible = vis > 0.01;
      group.current.position.y = (1 - easeOut(loomIn)) * -0.6;
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.08;
    }

    // Révélation progressive des fils de chaîne
    warpMeshes.current.forEach((m, i) => {
      if (!m) return;
      const reveal = clamp01((loomIn - i * 0.08) / 0.6);
      m.geometry.setDrawRange(0, Math.floor((warps[i].count * easeOut(reveal)) / 3) * 3);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.95 * vis;
    });

    // Course de la navette lumineuse
    const shuttleProg = seg(p, 0.30, 0.52);
    if (shuttle.current && shuttleLight.current) {
      const active = shuttleProg > 0.01 && shuttleProg < 0.99 && vis > 0.05;
      shuttle.current.visible = active;
      shuttleLight.current.visible = active;
      if (active) {
        weft.curve.getPointAt(clamp01(shuttleProg), shuttlePos.current);
        shuttle.current.position.copy(shuttlePos.current);
        shuttleLight.current.position.copy(shuttlePos.current);
        shuttleLight.current.intensity = 8 * vis;
        shuttle.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 12) * 0.2);
      }
    }
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {warps.map((w, i) => (
        <mesh
          key={i}
          ref={(el) => {
            warpMeshes.current[i] = el;
          }}
          geometry={w.geometry}
        >
          <meshStandardMaterial
            color={w.color}
            metalness={0.65}
            roughness={0.35}
            emissive={w.color}
            emissiveIntensity={0.15}
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      {/* Navette dorée éclatante */}
      <mesh ref={shuttle} visible={false}>
        <sphereGeometry args={[0.065, 12, 12]} />
        <meshBasicMaterial color="#FFF9EC" transparent opacity={0.95} />
      </mesh>
      <pointLight ref={shuttleLight} color="#E3B04B" intensity={0} distance={3.2} decay={2} />
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   3. LE SANCTUAIRE BOTANIQUE SACRÉ 3D (Chapitre 3 : 0.52 → 0.82)
   ───────────────────────────────────────────────────────────── */
function BotanicalSanctuary({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const items = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, delta) => {
    const p = progressRef.current ?? 0;
    const botIn = seg(p, 0.50, 0.68);
    const botOut = 1 - seg(p, 0.78, 0.86);
    const vis = easeInOut(botIn) * botOut;

    if (group.current) {
      group.current.visible = vis > 0.01;
      group.current.position.y = (1 - easeOut(botIn)) * -0.8;
      group.current.rotation.y = state.clock.elapsedTime * 0.12;
      group.current.scale.setScalar(0.7 + 0.3 * easeOut(botIn));

      group.current.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material && "opacity" in m.material) {
          (m.material as THREE.MeshStandardMaterial).opacity = vis;
        }
      });
    }

    items.current.forEach((it, i) => {
      if (!it) return;
      it.position.y = Math.sin(state.clock.elapsedTime * 1.2 + i * 1.5) * 0.08;
      it.rotation.y += delta * (0.2 + i * 0.1);
    });
  });

  return (
    <group ref={group} position={[0, 0, -0.3]}>
      {/* 1. Gousse de Baobab dorée (Force & Vitamine C) */}
      <group
        ref={(el) => {
          items.current[0] = el;
        }}
        position={[-1.3, 0.2, 0]}
      >
        <mesh scale={[0.7, 1.25, 0.7]}>
          <dodecahedronGeometry args={[0.32, 0]} />
          <meshStandardMaterial color="#8D5524" roughness={0.7} metalness={0.2} transparent />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.02, 0.03, 0.18, 6]} />
          <meshStandardMaterial color="#5C3A21" roughness={0.9} transparent />
        </mesh>
      </group>

      {/* 2. Amande de Karité & Beurre Précieux (Nutrition & Barrière Cutanée) */}
      <group
        ref={(el) => {
          items.current[1] = el;
        }}
        position={[0, 0.35, 0.6]}
      >
        <mesh scale={[1, 1.35, 0.9]}>
          <sphereGeometry args={[0.26, 14, 14]} />
          <meshStandardMaterial color="#F8F1E4" emissive="#C8951E" emissiveIntensity={0.2} roughness={0.4} transparent />
        </mesh>
        <mesh scale={[1.04, 1.04, 1.04]}>
          <torusGeometry args={[0.28, 0.015, 8, 32]} />
          <meshStandardMaterial color="#C8951E" metalness={0.8} roughness={0.2} transparent />
        </mesh>
      </group>

      {/* 3. Fleur de Bissap / Hibiscus Sabdariffa (Acides de fruits & Éclat) */}
      <group
        ref={(el) => {
          items.current[2] = el;
        }}
        position={[1.3, 0.15, 0]}
      >
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <mesh
            key={i}
            rotation={[0, 0, (angle * Math.PI) / 180]}
            position={[Math.cos((angle * Math.PI) / 180) * 0.15, Math.sin((angle * Math.PI) / 180) * 0.15, 0]}
          >
            <coneGeometry args={[0.12, 0.28, 5]} />
            <meshStandardMaterial color="#8B1A3B" emissive="#8B1A3B" emissiveIntensity={0.25} roughness={0.5} transparent />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.05]}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial color="#E3B04B" emissive="#E3B04B" emissiveIntensity={0.6} transparent />
        </mesh>
      </group>

      {/* Éclairage d'ambiance du sanctuaire */}
      <pointLight position={[0, 1, 1]} color="#FFD98A" intensity={6} distance={4} />
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   4. LE SCEAU ROYAL ADINKRA DUAFE (Chapitre 4 : 0.76 → 1.00)
   ───────────────────────────────────────────────────────────── */
function AdinkraMedallion({ progressRef }: { progressRef: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const attr = useRef<THREE.BufferAttribute>(null);
  const mat = useRef<THREE.PointsMaterial>(null);

  const { cur, orig, tgt, col, count } = useMemo(() => {
    const N = 640;
    const orig = new Float32Array(N * 3);
    const tgt = new Float32Array(N * 3);
    const cur = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      // Éparpillement initial
      const r = 2.4 + Math.random() * 2.0;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      orig[i * 3] = r * Math.sin(ph) * Math.cos(th);
      orig[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      orig[i * 3 + 2] = r * Math.cos(ph) * 0.4;

      // Cible : Double cercle d'orfèvrerie + peigne Duafe central
      if (i < N * 0.65) {
        // Couronne extérieure
        const a = Math.random() * Math.PI * 2;
        const radius = i < N * 0.4 ? 0.85 : 0.62;
        tgt[i * 3] = Math.cos(a) * (radius + (Math.random() - 0.5) * 0.05);
        tgt[i * 3 + 1] = Math.sin(a) * (radius + (Math.random() - 0.5) * 0.05);
        tgt[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
      } else {
        // Tracé intérieur géométrique du Duafe (dents du peigne)
        const t = (i - N * 0.65) / (N * 0.35);
        const colIdx = Math.floor(t * 5);
        const xPos = -0.3 + colIdx * 0.15;
        const yPos = -0.35 + (t % 0.2) * 3.5;
        tgt[i * 3] = xPos;
        tgt[i * 3 + 1] = yPos;
        tgt[i * 3 + 2] = 0;
      }

      const c = DUST_COLORS[i % 2 === 0 ? 0 : 1];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    cur.set(orig);
    return { cur, orig, tgt, col, count: N };
  }, []);

  useFrame((state) => {
    const p = progressRef.current ?? 0;
    const reveal = seg(p, 0.74, 0.94);
    const conv = easeInOut(reveal);

    if (attr.current) {
      const arr = attr.current.array as Float32Array;
      for (let i = 0; i < count * 3; i++) {
        arr[i] = orig[i] * (1 - conv) + tgt[i] * conv;
      }
      attr.current.needsUpdate = true;
    }

    if (mat.current) mat.current.opacity = 0.95 * easeOut(reveal);
    if (group.current) {
      group.current.visible = reveal > 0.01;
      group.current.rotation.z = state.clock.elapsedTime * 0.07;
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.025;
      group.current.scale.setScalar(breathe * (0.8 + 0.2 * easeOut(conv)));
    }
  });

  return (
    <group ref={group} position={[0, 0, -0.1]}>
      <points>
        <bufferGeometry>
          <bufferAttribute ref={attr} attach="attributes-position" args={[cur, 3]} />
          <bufferAttribute attach="attributes-color" args={[col, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={mat}
          size={0.038}
          vertexColors
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* Anneaux physiques d'or fin */}
      <mesh>
        <torusGeometry args={[0.85, 0.009, 8, 80]} />
        <meshStandardMaterial color="#E3B04B" metalness={0.9} roughness={0.15} transparent opacity={0.8} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.62, 0.006, 8, 64]} />
        <meshStandardMaterial color="#C8951E" metalness={0.9} roughness={0.15} transparent opacity={0.65} />
      </mesh>

      <pointLight position={[0, 0, 1.4]} color="#FFE8A3" intensity={9} distance={4} />
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   CAMÉRA ADAPTATIVE LERPÉE & RESPONSIVE
   ───────────────────────────────────────────────────────────── */
function AdaptiveCamera() {
  const { camera } = useThree();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const aspect = Math.max(state.size.width / Math.max(state.size.height, 1), 0.45);
    // Ajustement de la distance selon portrait (mobile) vs paysage (desktop)
    const targetZ = aspect < 1 ? 4.1 : 3.2;
    camera.position.z += (targetZ - camera.position.z) * 0.06;
    camera.position.x = Math.sin(t * 0.3) * 0.05;
    camera.position.y = Math.cos(t * 0.22) * 0.04;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* ─────────────────────────────────────────────────────────────
   LE COMPOSANT EXPORTÉ : SCÈNE 3D & CONTENEUR INTERACTIF
   ───────────────────────────────────────────────────────────── */
export function AfricanScrollSanctuary3D({
  className = "",
}: {
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<number>(0);
  const [active, setActive] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(0);
  const reducedMotion = useReducedMotion();

  // Détection du scroll relatif du conteneur
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Observer de visibilité pour couper Three.js hors champ
    const io = new IntersectionObserver(
      ([entry]) => {
        setActive(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    io.observe(el);

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const windowH = window.innerHeight;
      // Progression de 0 (entrée en bas d'écran) à 1 (sortie en haut)
      const totalDist = rect.height + windowH;
      const currentPos = windowH - rect.top;
      const p = clamp01(currentPos / totalDist);
      progressRef.current = p;

      // Déduction du chapitre pour les légendes
      if (p < 0.28) setCurrentChapter(0);
      else if (p < 0.56) setCurrentChapter(1);
      else if (p < 0.82) setCurrentChapter(2);
      else setCurrentChapter(3);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const CHAPTERS = [
    {
      badge: "Cosmologie 01",
      title: "La Mélanine Cosmique",
      desc: "Chaque grain de mélanine est un joyau d'adaptation et de résistance lumineuse.",
      icon: Sparkles,
    },
    {
      badge: "Savoir Ancestral 02",
      title: "La Navette & Le Tissage Kente",
      desc: "Chaque rituel cutané est un fil d'or tissé au cœur de ta routine sacrée.",
      icon: Compass,
    },
    {
      badge: "Pharmacopée 03",
      title: "Le Sanctuaire Botanique",
      desc: "Karité de Korhogo, Baobab millénaire, Bissap royal et Moringa pur d'Afrique.",
      icon: Eye,
    },
    {
      badge: "Couronnement 04",
      title: "Le Sceau Royal Duafe",
      desc: "Le peigne Adinkra, symbole éternel de la beauté, de la propreté et de la souveraineté.",
      icon: ShieldCheck,
    },
  ];

  const current = CHAPTERS[currentChapter];
  const Icon = current.icon;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-[28px] border border-[#C8951E]/30 bg-[#120E0A] shadow-2xl ${className}`}
      style={{ height: "420px" }}
    >
      {/* Fond atmosphérique africain */}
      <div className="absolute inset-0 bg-[radial-gradient(110%_120%_at_50%_100%,#2B1A0D_0%,#160F0A_55%,#0E0A07_100%)] pointer-events-none" />
      <div className="absolute inset-0 bogolan-weave opacity-25 pointer-events-none" />

      {/* Canvas Three.js R3F — Piloté au Scroll */}
      {!reducedMotion ? (
        <div className="absolute inset-0">
          <Canvas
            dpr={[1, 1.5]}
            frameloop={active ? "always" : "never"}
            camera={{ fov: 42, position: [0, 0, 3.5], near: 0.1, far: 40 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          >
            <ambientLight intensity={0.7} color="#F8E8C8" />
            <directionalLight position={[4, 5, 5]} intensity={2.2} color="#FFD98A" />
            <pointLight position={[-3, -2, 2]} intensity={5} color="#A0522D" />
            <AdaptiveCamera />
            <MelaninCosmos progressRef={progressRef} />
            <LoomThreads progressRef={progressRef} />
            <BotanicalSanctuary progressRef={progressRef} />
            <AdinkraMedallion progressRef={progressRef} />
          </Canvas>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-xs text-[#E3B04B]">Le Sanctuaire Vivant Kènè — Beauté & Racines d&apos;Afrique</p>
        </div>
      )}

      {/* Cadre orfèvre Kente — liseré lumineux */}
      <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-inset ring-[#C8951E]/30" />

      {/* Légendes dynamiques au scroll (HUD éditorial afro-futuriste) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-6 bg-gradient-to-t from-[#0E0A07]/95 via-[#0E0A07]/60 to-transparent flex flex-col justify-end">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C8951E]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#E3B04B] border border-[#C8951E]/40 backdrop-blur-md">
            <Icon size={11} className="text-[#C8951E]" />
            {current.badge}
          </span>
          {/* Indicateur de défilement 3D */}
          <span className="text-[10px] font-mono text-[#F8F1E4]/60">
            Fais défiler pour explorer ✦
          </span>
        </div>

        <h3 className="font-heading font-black text-lg sm:text-xl text-[#F8F1E4] leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          {current.title}
        </h3>
        <p className="mt-1 text-xs sm:text-[13px] text-[#F8F1E4]/80 leading-relaxed max-w-xl drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {current.desc}
        </p>

        {/* Barre de progression du tissage au scroll */}
        <div className="mt-3 flex items-center gap-2">
          {[0, 1, 2, 3].map((step) => (
            <div
              key={step}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                currentChapter >= step ? "bg-gradient-to-r from-[#C8951E] to-[#E3B04B]" : "bg-[#F8F1E4]/15"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
