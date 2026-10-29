"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { setTurnstileToken } from "@/lib/kene/api";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          size?: "normal" | "compact" | "invisible";
          callback?: (token: string) => void;
          "error-callback"?: (code?: unknown) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoaded?: () => void;
  }
}

// Clé officielle de test Cloudflare en mode invisible (passe automatiquement)
const DEFAULT_SITE_KEY = "1x00000000000000000000BB";

export function TurnstileProvider() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || DEFAULT_SITE_KEY;

  useEffect(() => {
    let unmounted = false;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || unmounted) return;
      if (widgetIdRef.current) return;

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          size: "invisible",
          theme: "auto",
          callback: (token: string) => {
            setTurnstileToken(token);
          },
          "expired-callback": () => {
            setTurnstileToken(null);
            if (widgetIdRef.current && window.turnstile) {
              try {
                window.turnstile.reset(widgetIdRef.current);
              } catch {}
            }
          },
          "error-callback": () => {
            // Tolérance client : en cas d'erreur de chargement (ex: coupure réseau), ne bloque pas l'UI
            setTurnstileToken(null);
          },
        });
      } catch (err) {
        console.warn("[turnstile] Initialisation widget silencieuse:", err);
      }
    };

    if (typeof window !== "undefined") {
      if (window.turnstile) {
        renderWidget();
      } else {
        window.onTurnstileLoaded = renderWidget;
      }
    }

    return () => {
      unmounted = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded&render=explicit"
        strategy="lazyOnload"
      />
      {/* Conteneur 100% invisible en arrière-plan */}
      <div
        ref={containerRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
    </>
  );
}
