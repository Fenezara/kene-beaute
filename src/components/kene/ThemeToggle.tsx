"use client";

import { Moon, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * Anti-mismatch d'hydratation : `resolvedTheme` vaut `undefined` côté serveur mais
 * est résolu depuis localStorage dès le premier rendu client. On ne dérive donc
 * AUCUN attribut rendu de `resolvedTheme` — deux boutons statiques commutés par
 * CSS (`dark:hidden` / `hidden dark:flex`), chacun avec son libellé aria précis
 * (accessibilité) et une action fixe. Pas d'état local ni d'effet → conforme à
 * react-hooks/set-state-in-effect.
 */
export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label="Passer en mode sombre"
        className="size-11 rounded-full border-border bg-card/70 dark:hidden"
        onClick={() => setTheme("dark")}
      >
        <Moon className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Passer en mode clair"
        className="size-11 rounded-full border-border bg-card/70 hidden dark:flex"
        onClick={() => setTheme("light")}
      >
        <SunMedium className="size-4" />
      </Button>
    </>
  );
}
