"use client";
// Kènè — glossaire 1 tap: Dialog de définition simple, avec lecture vocale.
// En tête: l'entrée « 🌿 Herbier des Grandes-Mères » qui ouvre le
// jardin des plantes (hash #herbier) au lieu d'une définition.
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, ChevronRight } from "lucide-react";
import type { GlossaryEntry } from "@/lib/kene/glossary";
import { glossarySpoken } from "@/lib/kene/glossary";
import { openHerbier } from "@/components/kene/herbier/Herbier";
import { SpeakButton } from "./SpeakButton";

export function GlossaryDialog({ entry, onClose }: { entry: GlossaryEntry | null; onClose: () => void }) {
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[340px] rounded-3xl p-5 gap-4">
        {entry && (
          <>
            {/* 🌿 Entrée en tête — ouvre l'Herbier des Grandes-Mères au lieu
 d'une définition (même style que le reste du dialogue) */}
            <button
              onClick={() => {
                onClose();
                openHerbier();
              }}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary/8 px-3.5 py-2.5 text-left transition hover:bg-primary/15 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-[15px]">
                🌿
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold leading-tight text-foreground">Herbier des Grandes-Mères</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">Les plantes qui soignent nos peaux — entre dans le jardin</span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-primary" aria-hidden="true" />
            </button>
            <DialogHeader className="gap-2 text-left space-y-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <BookOpen size={12} aria-hidden="true" /> Que veut dire ce mot ?
              </p>
              <DialogTitle className="font-heading font-black text-lg leading-tight">{entry.title}</DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-[13px] leading-relaxed text-foreground/90">
              {entry.simple}
            </DialogDescription>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <SpeakButton text={glossarySpoken(entry)} label="Écouter" speed={0.9} />
              <button
                onClick={onClose}
                className="min-h-11 px-4 rounded-full text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              >
                J&apos;ai compris
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
