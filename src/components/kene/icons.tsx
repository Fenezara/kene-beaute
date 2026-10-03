import React, { useId } from "react";
import { cn } from "@/lib/utils";

export type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function base(size: number | undefined, props: IconProps) {
  return {
    width: props.width ?? size ?? 24,
    height: props.height ?? size ?? 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: props.strokeWidth ?? 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

/** Duafe — peigne en bois. Symbole de beauté & féminité. ⭐ Logo Kènè */
export function DuafeIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M5 3v18" />
      <path d="M5 3h11.5a2.5 2.5 0 0 1 2.5 2.5V21H5" />
      <path d="M5 7.5h11" />
      <path d="M8.5 7.5V3" />
      <path d="M12 7.5V3" />
      <path d="M15.5 7.5V3" />
      <circle cx="12" cy="13" r="2.6" />
      <path d="M12 15.6V19" />
    </svg>
  );
}

/** Sankofa — retour aux sources. Module RDV (retour client) */
export function SankofaIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M20 8.5A5.5 5.5 0 0 0 8.6 6.4L4 11l3.5.6" />
      <path d="M9 15h8.5" />
      <path d="M11.5 15l-1.8 5.2a1.6 1.6 0 0 0 1.5 2.1 1.6 1.6 0 0 0 1.5-1l2-6.3" />
      <path d="M9 4.8V2.5" />
      <path d="M6.8 5.6 5.4 3.7" />
      <circle cx="9" cy="9" r="0.4" fill="currentColor" />
      <path d="M20 8.5c0 2.2-1.2 4-3 4.7" />
    </svg>
  );
}

/** Aban — forteresse. Module Caisse / POS */
export function AbanIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M4 21V8.5L12 3l8 5.5V21" />
      <path d="M4 21h16" />
      <path d="M9.5 21v-5a2.5 2.5 0 0 1 5 0v5" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
      <path d="M4 16.5h3" />
      <path d="M17 16.5h3" />
    </svg>
  );
}

/** Nea Onnim — « celui qui ne sait pas ». Savoir & IA Diagnostic */
export function NeaOnnimIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M12 3c2 2.6 5.5 4 5.5 8.2A5.5 5.5 0 0 1 12 16.7a5.5 5.5 0 0 1-5.5-5.5C6.5 7 10 5.6 12 3Z" />
      <path d="M12 16.7c-2.4 0-3.4 1.6-3 4.3 2.4.8 4.5.5 6-1" />
      <path d="M12 16.7c2.4 0 3.4 1.6 3 4.3" />
      <circle cx="12" cy="10.2" r="0.5" fill="currentColor" />
      <path d="M9 10.2h1.6" />
      <path d="M13.4 10.2H15" />
    </svg>
  );
}

/** Osram Ne Nsoromma — lune & étoile. CRM / relation client */
export function OsramIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M14.5 3.5a8.5 8.5 0 1 0 6 13.8A9 9 0 0 1 14.5 3.5Z" />
      <path d="M18.5 3.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Fihankra — maison sécurisée. Module Paie */
export function FihankraIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
      <path d="M12 2.2V4" />
      <path d="M12 20v1.8" />
      <path d="M2.2 12H4" />
      <path d="M20 12h1.8" />
      <path d="M12 8.5v7" />
      <path d="M8.5 12h7" />
    </svg>
  );
}

/** Nkonsonkonson — maillons de chaîne, coopération & communauté. Module Équipe */
export function NkonsonkonsonIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M7.5 7H5.8A2.8 2.8 0 0 0 3 9.8v0A2.8 2.8 0 0 0 5.8 12.6h2.4" />
      <path d="M7.5 17H5.8A2.8 2.8 0 0 1 3 14.2v0" />
      <path d="M16.5 7h1.7A2.8 2.8 0 0 1 21 9.8v0a2.8 2.8 0 0 1-2.8 2.8h-2.4" />
      <path d="M16.5 17h1.7a2.8 2.8 0 0 0 2.8-2.8v0" />
      <path d="M10.4 12h3.2" />
    </svg>
  );
}

/** Motif Kente géométrisé. Module Stock */
export function KenteIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M3 8h18" />
      <path d="M3 16h18" />
      <path d="M7 3v18" />
      <path d="M12 3v6" />
      <path d="M12 13v8" />
      <path d="M17 3v6" />
      <path d="M17 13v8" />
      <path d="M3 8l4 8" />
      <path d="M21 8l-4 8" />
    </svg>
  );
}

/** Motif tissé Baoulé. Module Comptabilité */
export function BaouleIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M4 6c2.7-1.8 5.3 1.8 8 0s5.3 1.8 8 0" />
      <path d="M4 12c2.7-1.8 5.3 1.8 8 0s5.3 1.8 8 0" />
      <path d="M4 18c2.7-1.8 5.3 1.8 8 0s5.3 1.8 8 0" />
    </svg>
  );
}

/** Silhouette Karité — botaniques */
export function KariteIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <circle cx="12" cy="7" r="3.2" />
      <circle cx="7" cy="11" r="2.4" />
      <circle cx="17" cy="11" r="2.4" />
      <path d="M12 10.2V21" />
      <path d="M12 17c-2.2 0-3.6-1-4.2-2.6" />
      <path d="M12 17c2.2 0 3.6-1 4.2-2.6" />
      <path d="M9 21h6" />
    </svg>
  );
}

/** Silhouette Baobab */
export function BaobabIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M10 21c-.6-4 .4-7 2-9" />
      <path d="M14 21c.6-4-.4-7-2-9" />
      <path d="M12 12V8" />
      <path d="M12 8C10.5 7 9.5 5.5 9.6 3.5" />
      <path d="M12 8c1.5-1 2.5-2.5 2.4-4.5" />
      <path d="M12 8c0-2 1-3.6 2.6-4.6" />
      <path d="M8 21h8" />
    </svg>
  );
}

/** Silhouette Moringa */
export function MoringaIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      <path d="M12 21V9" />
      <path d="M12 13c-2.4 0-4-1.4-4.5-3.5C9.8 9.2 11.3 8 12 6" />
      <path d="M12 13c2.4 0 4-1.4 4.5-3.5C14.2 9.2 12.7 8 12 6" />
      <ellipse cx="9" cy="6.5" rx="1.6" ry="2.4" transform="rotate(-30 9 6.5)" />
      <ellipse cx="15" cy="6.5" rx="1.6" ry="2.4" transform="rotate(30 15 6.5)" />
      <path d="M10 21h4" />
    </svg>
  );
}

/** Géométrie canonique du mark Kènè (96-grid) — partagée par KeneMark et
 * les fichiers statiques public/kene-{mark,logo}.svg. Ne pas éditer sans
 * régénérer les icônes PWA (scripts/gen-logo.ts). */
const KENE_BADGE_PATHS = (
  <>
    <path d="M5 3v18" />
    <path d="M5 3h11.5a2.5 2.5 0 0 1 2.5 2.5V21H5" />
    <path d="M5 7.5h11" />
    <path d="M8.5 7.5V3" />
    <path d="M12 7.5V3" />
    <path d="M15.5 7.5V3" />
    <circle cx="12" cy="13" r="2.6" />
    <path d="M12 15.6V19" />
  </>
);

/** Badge Kènè seul — squircle or fondu terre (dégradé vectoriel 3 tons),
 * double relief orfèvrerie (filet intérieur crème + reflet radial haut-gauche),
 * Duafe centré. SVG pur, lisible de 20 px à l'infini. Pour usages sans wordmark. */
export function KeneMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  // IDs uniques par instance: plusieurs marks sur une même page sans collision
  // (useId renvoie des «: » — nettoyés car exotiques en url(#…)).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gold = `keneGold-${uid}`;
  const sheen = `keneSheen-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden="true"
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        <linearGradient id={gold} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="96" y2="96">
          <stop offset="0" stopColor="#E3B04B" />
          <stop offset="0.42" stopColor="#C8951E" />
          <stop offset="1" stopColor="#A0522D" />
        </linearGradient>
        <radialGradient id={sheen} cx="32%" cy="24%" r="62%">
          <stop offset="0" stopColor="#FFF9EC" stopOpacity="0.3" />
          <stop offset="0.55" stopColor="#FFF9EC" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Badge squircle dégradé chaud */}
      <rect x="3" y="3" width="90" height="90" rx="24" fill={`url(#${gold})`} />
      {/* Filet intérieur crème — relief 1 */}
      <rect
        x="6.5"
        y="6.5"
        width="83"
        height="83"
        rx="20.5"
        fill="none"
        stroke="#FFF9EC"
        strokeOpacity="0.32"
        strokeWidth="1.8"
      />
      {/* Reflet radial haut-gauche — relief 2 */}
      <rect x="3" y="3" width="90" height="90" rx="24" fill={`url(#${sheen})`} />
      {/* Duafe centré (24-grid × 2.3, stroke 1.8 → ~4.1 effectif) */}
      <g
        transform="translate(20.4 20.4) scale(2.3)"
        fill="none"
        stroke="#FFF9EC"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {KENE_BADGE_PATHS}
      </g>
    </svg>
  );
}

/** Emblème officiel de marque Kènè — « le Médaillon Kènè » : portrait de femme
 * en profil aux contours or néon et peigne Duafe sur fond sombre espresso.
 * Identité visuelle unique et harmonisée dans les deux modes (clair et sombre) :
 * présentation MÉDAILLON (plaque orfévrée) — bague or 2px, fond contrasté #14100B,
 * ombre portée orfèvre, parfaitement nette et constante quel que soit le thème. */
export function KeneEmblem({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-block shrink-0 select-none overflow-hidden rounded-[26%] ring-2 ring-[#C8951E] dark:ring-[#E3B04B] shadow-[0_2px_12px_rgba(200,149,30,0.30)] dark:shadow-[0_2px_14px_rgba(227,176,75,0.25)] bg-[#14100B]",
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/brand/kene-emblem-dark.png"
        alt="Logo Kènè"
        width={size}
        height={size}
        loading="eager"
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  );
}

/** Logo complet Kènè — lockup signature : badge médaillon original, wordmark
 * « Kènè » Fraunces (0.62×size), filet kente 3 segments or/terre/baobab,
 * devise « Beauté mélanoderme » haute visibilité. */
export function KeneLogo({ size = 48, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3 select-none">
      <KeneEmblem size={size} />
      {withText && (
        <span className="flex min-w-0 flex-col items-start leading-none justify-center">
          <span className="inline-flex w-fit flex-col items-start">
            <span
              className="font-heading font-black leading-[1.05] tracking-[0.02em] text-foreground"
              style={{ fontSize: `${(Math.round(size * 0.62 * 100) / 100).toFixed(2)}px` }}
            >
              Kènè
            </span>
            {/* Mini filet kente: or / terre / baobab, largeur du wordmark */}
            <span aria-hidden="true" className="mt-1 flex h-[2.5px] w-full min-w-10 overflow-hidden rounded-full">
              <span className="h-full flex-1 bg-[#C8951E]" />
              <span className="h-full flex-1 bg-[#A0522D]" />
              <span className="h-full flex-1 bg-[#3F7D3F]" />
            </span>
          </span>
          <span
            className="mt-1.5 text-[10.5px] sm:text-[12px] font-extrabold uppercase tracking-[0.13em] whitespace-nowrap text-[#7A5506] dark:text-[#F3C968]"
          >
            Beauté mélanoderme
          </span>
        </span>
      )}
    </span>
  );
}

/** Lockup Sceau officiel — le Médaillon Kènè (portrait riche en or antique)
 * accompagné du wordmark : logo officiel de l'app dans les en-têtes et
 * sidebars (cliente, Pro, admin). Rendu net, grand format, contrasté et lisible. */
export function KeneEmblemLockup({
  size = 48,
  label = "Kènè",
  sublabel = "Beauté mélanoderme",
  className = "",
  labelSize,
}: {
  size?: number;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  className?: string;
  labelSize?: number;
}) {
  const fontSize = labelSize ?? Math.round(size * 0.52 * 100) / 100;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-3 sm:gap-3.5 select-none", className)}>
      <KeneEmblem
        size={size}
      />
      <span className="flex min-w-0 flex-col items-start leading-none justify-center">
        <span className="inline-flex w-fit flex-col items-start">
          <span
            className="font-heading font-black leading-[1.05] tracking-[0.02em] text-foreground"
            style={{ fontSize: `${fontSize.toFixed(2)}px` }}
          >
            {label}
          </span>
          {/* Filet Kente signature: or / terre / baobab */}
          <span aria-hidden="true" className="mt-1 flex h-[2.5px] w-full min-w-10 overflow-hidden rounded-full">
            <span className="h-full flex-1 bg-[#C8951E]" />
            <span className="h-full flex-1 bg-[#A0522D]" />
            <span className="h-full flex-1 bg-[#3F7D3F]" />
          </span>
        </span>
        {sublabel != null && (
          <span
            className="mt-1.5 text-[10.5px] sm:text-[12px] font-extrabold uppercase tracking-[0.13em] truncate max-w-[140px] sm:max-w-none text-[#7A5506] dark:text-[#F3C968]"
          >
            {sublabel}
          </span>
        )}
      </span>
    </span>
  );
}

/** Cauri sacré — symbole panafricain de prospérité, protection et beauté ancestrale */
export function CauriIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      {/* Coque extérieure ovale */}
      <path d="M12 2.5C7.5 2.5 4.5 6.5 4.5 12c0 5.5 3 9.5 7.5 9.5s7.5-4 7.5-9.5c0-5.5-3-9.5-7.5-9.5Z" />
      {/* Fente centrale ondulée */}
      <path d="M12 5.5c-.8 1.5-.6 3.5 0 5s.8 3.5 0 5-1 2.5 0 3" />
      {/* Crans de dentelure du cauri */}
      <path d="M9.5 7.5h1.5" />
      <path d="M13 7.5h1.5" />
      <path d="M9 10.5h2" />
      <path d="M13 10.5h2" />
      <path d="M9 13.5h2" />
      <path d="M13 13.5h2" />
      <path d="M9.5 16.5h1.5" />
      <path d="M13 16.5h1.5" />
    </svg>
  );
}

/** Fleur d'Hibiscus / Bissap — trésor d'antioxydants et d'acides de fruits d'Afrique */
export function BissapFlowerIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      {/* 5 pétales épanouis */}
      <path d="M12 12c-2.5-4-1-8 0-9.5 1 1.5 2.5 5.5 0 9.5Z" />
      <path d="M12 12c3.5-3 7.5-3 9-1.5-1.5 1.5-5.5 3-9 1.5Z" />
      <path d="M12 12c2.5 4 4.5 7.5 3.5 9-1.5-.5-4-4.5-3.5-9Z" />
      <path d="M12 12c-2.5 4-4.5 7.5-3.5 9 1.5-.5 4-4.5 3.5-9Z" />
      <path d="M12 12c-3.5-3-7.5-3-9-1.5 1.5 1.5 5.5 3 9 1.5Z" />
      {/* Calice central & pistil */}
      <circle cx="12" cy="12" r="2.2" fill="currentColor" fillOpacity="0.25" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** Gousse de Cacao d'Or — nutrition intense et or brun d'Afrique de l'Ouest */
export function CacaoPodIcon(props: IconProps) {
  const { size, ...rest } = props;
  return (
    <svg {...base(size, rest)}>
      {/* Pédoncule */}
      <path d="M12 2v2.5" />
      {/* Profil de la cabosse effilée */}
      <path d="M12 4.5C7 5.5 4.5 9.5 4.5 14c0 3.5 3.5 6.5 7.5 8 4-1.5 7.5-4.5 7.5-8 0-4.5-2.5-8.5-7.5-9.5Z" />
      {/* Sillons longitudinaux caractéristiques */}
      <path d="M8.5 6.5c-1.8 2.2-2 5-1.5 7.5.5 2.5 2.5 4.5 5 5.5" />
      <path d="M15.5 6.5c1.8 2.2 2 5 1.5 7.5-.5 2.5-2.5 4.5-5 5.5" />
      <path d="M12 4.5v17.5" strokeDasharray="1.5 2.5" />
    </svg>
  );
}
