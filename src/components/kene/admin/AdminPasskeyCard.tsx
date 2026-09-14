"use client";
// Kènè — Console · Carte Passkey (t. 130 — onglet Sécurité).
//
// Les passkeys sont la MFA résistante au hameçonnage (NIST 800-63B-4):
// la preuve vit dans l'appareil (enclave sécurisée / clé USB), le numéro
// reste l'identifiant. Cette carte liste les appareils autorisés à ouvrir
// la console, en enregistre un nouveau (cérémonie WebAuthn APRÈS step-up)
// et retire un appareil compromis (step-up + confirmation).
//
// Détection de capacité: si le navigateur hôte ne sait pas faire du WebAuthn
// (HTTP non sécurisé hors localhost, navigateur ancien), la carte l'explique
// — la connexion par code reste toujours disponible.
import { useCallback, useEffect, useState } from "react";
import { CloudCheck, Fingerprint, Loader2, MonitorSmartphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, ApiError } from "@/lib/kene/api";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { formatDate } from "@/lib/kene/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { KenteTop } from "@/components/kene/pro/ui-bits";
import { useAdminGate } from "./admin-gate";

type PasskeyRow = {
  id: string;
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export function AdminPasskeyCard() {
  const gate = useAdminGate();
  const [rows, setRows] = useState<PasskeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [removing, setRemoving] = useState<PasskeyRow | null>(null);
  const [rmBusy, setRmBusy] = useState(false);
  const webauthnOk = typeof window !== "undefined" && browserSupportsWebAuthn();

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ credentials: PasskeyRow[] }>("/api/admin/passkey");
      setRows(r.credentials);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Enregistrement: step-up → options → cérémonie navigateur → verify. */
  async function registerDevice() {
    setRegBusy(true);
    try {
      // 1. Options d'enregistrement (ouvre le step-up si l'élévation a expiré).
      const r = await gate.elevatedPost<{ options: PublicKeyCredentialCreationOptionsJSON }>(
        "/api/admin/passkey/register/options",
        {},
      );
      // 2. Cérémonie WebAuthn: empreinte / Face ID / code / clé USB — la clé
      //    privée ne quitte jamais l'appareil.
      const attestation = await startRegistration({ optionsJSON: r.options });
      // 3. Vérification serveur + enregistrement.
      await gate.elevatedPost("/api/admin/passkey/register/verify", {
        name: label.trim() || undefined,
        response: attestation,
      });
      toast.success(label.trim() ? `Appareil « ${label.trim()} » autorisé sur la console` : "Appareil autorisé sur la console");
      setRegOpen(false);
      setLabel("");
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        // Cérémonie annulée depuis la fenêtre système (pas une erreur serveur).
        toast.info("Enregistrement annulé — l'appareil n'a pas été ajouté");
      }
    } finally {
      setRegBusy(false);
    }
  }

  async function removeDevice() {
    if (!removing) return;
    setRmBusy(true);
    try {
      await gate.elevatedDelete(`/api/admin/passkey/credentials/${removing.id}`);
      toast.success("Appareil retiré — il ne peut plus ouvrir la console");
      setRemoving(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retrait impossible");
    } finally {
      setRmBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden pt-0">
      <KenteTop />
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-base">
          <Fingerprint className="size-4 text-primary" aria-hidden="true" />
          Passkeys — ouverture par appareil
          <Badge variant="outline" className="font-mono text-[10px]">2026</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Un passkey remplace le code SMS pour ouvrir la console: ta preuve d&apos;identité vit dans l&apos;appareil
          (empreinte, Face ID, code, clé USB) — impossible à hameçonner, impossible à intercepter.
          Le code à 6 chiffres reste disponible en secours.
        </p>

        {error ? (
          <div role="alert" className="rounded-xl bg-bissap/10 px-3.5 py-3 text-sm text-bissap">
            Appareils indisponibles : {error}
          </div>
        ) : rows === null ? (
          <div className="space-y-2" aria-busy="true" aria-label="Chargement des appareils">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Aucun appareil enregistré — la console s&apos;ouvre aujourd&apos;hui par code à 6 chiffres.
            Enregistre ton appareil pour une ouverture par empreinte.
          </p>
        ) : (
          <ul role="list" aria-label="Appareils autorisés sur la console" className="divide-y divide-border/60 rounded-xl border border-border/60">
            {rows.map((r) => (
              <li key={r.id} role="listitem" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-3">
                <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name ?? "Appareil sans étiquette"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ajouté le {formatDate(new Date(r.createdAt))}
                    {r.lastUsedAt ? ` · dernière ouverture ${formatDate(new Date(r.lastUsedAt))}` : " · jamais utilisé"}
                  </p>
                </div>
                {r.backedUp && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                    <CloudCheck className="size-3" aria-hidden="true" /> Synchronisé
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoving(r)}
                  className="h-9 shrink-0 text-bissap hover:bg-bissap/10 hover:text-bissap"
                  aria-label={`Retirer l'appareil ${r.name ?? "sans étiquette"}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sm:hidden">Retirer</span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {webauthnOk ? (
            <Button onClick={() => setRegOpen(true)} className="gap-1.5">
              <Plus className="size-4" aria-hidden="true" />
              Enregistrer cet appareil
            </Button>
          ) : (
            <p className="rounded-xl bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
              Ce navigateur ne supporte pas les passkeys (HTTPS requis) — la console reste accessible par code.
            </p>
          )}
        </div>
      </CardContent>

      {/* — Dialog d'enregistrement — */}
      <Dialog open={regOpen} onOpenChange={(open) => { if (!open && !regBusy) setRegOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Fingerprint className="size-5 text-primary" aria-hidden="true" />
              Enregistrer cet appareil
            </DialogTitle>
            <DialogDescription>
              Suis l&apos;invite de ton navigateur (empreinte, Face ID ou code). Ta clé reste dans l&apos;appareil —
              Kènè ne stocke que la clé publique. Une confirmation d&apos;identité par code sera demandée juste avant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="passkey-label" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Étiquette (facultatif)
            </label>
            <Input
              id="passkey-label"
              placeholder="ex. MacBook de la fondatrice"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 60))}
              className="h-11"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => void registerDevice()} disabled={regBusy} className="w-full">
              {regBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Fingerprint className="size-4" aria-hidden="true" />}
              Confirmer mon identité et enregistrer
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              L&apos;appareil pourra ensuite ouvrir la console sans code SMS.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — Dialog de retrait — */}
      <Dialog open={removing !== null} onOpenChange={(open) => { if (!open && !rmBusy) setRemoving(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Retirer cet appareil ?</DialogTitle>
            <DialogDescription>
              « {removing?.name ?? "Appareil sans étiquette"} » ne pourra plus ouvrir la console par passkey.
              {(rows?.length ?? 0) <= 1
                ? " Il ne restera AUCUN appareil enregistré — la console reviendra au code à 6 chiffres."
                : " Tes autres appareils restent actifs."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button variant="destructive" onClick={() => void removeDevice()} disabled={rmBusy} className="w-full">
              {rmBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
              Retirer l&apos;appareil
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={rmBusy} className="w-full">
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
