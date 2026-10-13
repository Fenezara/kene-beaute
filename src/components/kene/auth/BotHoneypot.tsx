"use client";
// Composant Pot de Miel (Honeypot) 100% invisible pour l'œil humain et les lecteurs d'écran.
// Piège les robots et scripts qui essaient de remplir automatiquement tous les champs d'un formulaire.

import { useRef, useEffect } from "react";

interface BotHoneypotProps {
  onTrapChange?: (val: string) => void;
}

export function BotHoneypot({ onTrapChange }: BotHoneypotProps) {
  const mountTime = useRef(Date.now());

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
        opacity: 0,
        pointerEvents: "none",
      }}
      tabIndex={-1}
    >
      <label htmlFor="kene_user_verification_token">Ne pas remplir ce champ de sécurité</label>
      <input
        id="kene_user_verification_token"
        type="text"
        name="verification_security_code"
        autoComplete="off"
        tabIndex={-1}
        onChange={(e) => onTrapChange?.(e.target.value)}
      />
    </div>
  );
}

/** Helper simple pour générer les métadonnées de requête humaine */
export function createHumanPayload(trapValue = "") {
  return {
    _kene_bot_trap: trapValue,
    _kene_ts: Date.now(),
  };
}
