"use client";
// Kènè — glossaire 1 tap : Dialog de définition simple, avec lecture vocale.
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";
import type { GlossaryEntry } from "@/lib/kene/glossary";
import { glossarySpoken } from "@/lib/kene/glossary";
import { SpeakButton } from "./SpeakButton";

export function GlossaryDialog({ entry, onClose }: { entry: GlossaryEntry | null; onClose: () => void }) {
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[340px] rounded-3xl p-5 gap-4">
        {entry && (
          <>
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
