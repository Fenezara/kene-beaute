"use client";
// Kènè — frontière d'erreur par section d'écran (Error Boundary locale).
// Un écran d'onglet qui plante (rendu, lazy-chunk introuvable, donnée inattendue)
// est remplacé par une carte inline discrète : le shell de l'app (header,
// navigation, autres onglets) reste vivant — jamais d'écran blanc total.
// « Réessayer » remonte l'enfant neuf (clé d'essai → état local réinitialisé) ;
// « Recharger la page » reste l'issue de secours complète.

import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

interface ScreenBoundaryProps {
  children: ReactNode;
  /** Nom lisible de la section, affiché dans le fallback (« La section … a rencontré un souci ») */
  name: string;
}

interface ScreenBoundaryState {
  error: Error | null;
  /** Incrémenté à chaque « Réessayer » → remontée garantie d'un enfant neuf */
  attempt: number;
}

export class ScreenBoundary extends Component<ScreenBoundaryProps, ScreenBoundaryState> {
  state: ScreenBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<ScreenBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // [kene:screen:{name}] — trace ciblée en console, jamais dans l'UI
    console.error(`[kene:screen:${this.props.name}]`, error, info.componentStack ?? "");
  }

  reset = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center gap-4 shadow-sm"
        >
          <span aria-hidden="true" className="grid place-items-center h-11 w-11 rounded-full bg-primary/10 text-primary">
            <AlertTriangle size={22} />
          </span>
          <div className="space-y-1.5">
            <p className="font-heading font-bold text-base">
              La section {this.props.name} a rencontré un souci
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ce n&apos;est pas de ta faute — le reste de l&apos;app continue de
              fonctionner. Essaie de réafficher cette section.
            </p>
          </div>
          <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2.5 sm:justify-center">
            <button
              type="button"
              onClick={this.reset}
              autoFocus
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground text-sm font-bold active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background text-foreground text-sm font-bold hover:bg-accent active:scale-[0.98] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
