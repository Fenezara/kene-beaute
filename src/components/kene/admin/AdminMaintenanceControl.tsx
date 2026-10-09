"use client";

import { useState, useEffect } from "react";
import {
  Wrench,
  Power,
  Clock,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Settings2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/kene/api";
import type { MaintenanceConfig } from "@/lib/kene/maintenance";
import { cn } from "@/lib/utils";

export function AdminMaintenanceControl({ onConfigChanged }: { onConfigChanged?: (config: MaintenanceConfig) => void }) {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form states
  const [formEnabled, setFormEnabled] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [formEstimatedEnd, setFormEstimatedEnd] = useState("");
  const [formEmergencyPhone, setFormEmergencyPhone] = useState("+2250748894270");

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await apiGet<{ config: MaintenanceConfig }>("/api/system/maintenance");
      if (res?.config) {
        setConfig(res.config);
        setFormEnabled(res.config.enabled);
        setFormMessage(res.config.message);
        setFormEstimatedEnd(res.config.estimatedEnd || "");
        setFormEmergencyPhone(res.config.emergencyPhone || "+2250748894270");
        onConfigChanged?.(res.config);
      }
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleQuickToggle = async () => {
    if (!config) return;
    const targetState = !config.enabled;
    setSaving(true);
    try {
      const res = await apiPost<{ success: boolean; config: MaintenanceConfig }>("/api/admin/maintenance", {
        enabled: targetState,
      });
      if (res?.config) {
        setConfig(res.config);
        setFormEnabled(res.config.enabled);
        onConfigChanged?.(res.config);
        if (targetState) {
          toast.warning("Mode Maintenance ACTIVÉ !", {
            description: "L'application est maintenant inaccessible au public. L'affiche de maintenance est en ligne.",
          });
        } else {
          toast.success("Mode Maintenance DÉSACTIVÉ !", {
            description: "La plateforme Kènè est à nouveau ouverte et accessible à toutes les clientes et instituts.",
          });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de mise à jour");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFullConfig = async () => {
    setSaving(true);
    try {
      const res = await apiPost<{ success: boolean; config: MaintenanceConfig }>("/api/admin/maintenance", {
        enabled: formEnabled,
        message: formMessage.trim() || undefined,
        estimatedEnd: formEstimatedEnd.trim() || null,
        emergencyPhone: formEmergencyPhone.trim() || undefined,
      });
      if (res?.config) {
        setConfig(res.config);
        setDialogOpen(false);
        onConfigChanged?.(res.config);
        toast.success(
          formEnabled
            ? "Mode Maintenance activé avec affiche mise à jour !"
            : "Paramètres de maintenance enregistrés (plateforme en ligne)."
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !config) {
    return null;
  }

  const isMaintenance = Boolean(config?.enabled);

  return (
    <>
      <Card
        className={cn(
          "overflow-hidden border-2 transition-all shadow-sm",
          isMaintenance
            ? "border-rose-500/60 bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent dark:from-rose-950/40"
            : "border-border/60 bg-card"
        )}
      >
        <CardContent className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-2xl shrink-0 font-bold shadow-xs",
                isMaintenance
                  ? "bg-rose-600 text-white animate-pulse"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              )}
            >
              <Wrench className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-bold text-sm text-foreground">
                  Mode Maintenance Plateforme
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5",
                    isMaintenance
                      ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                  )}
                >
                  {isMaintenance ? "🛑 Actif (App bloquée)" : "✓ En ligne (Normal)"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {isMaintenance
                  ? `Affiche active : « ${config?.message} »`
                  : "Activez pour bloquer l'accès public et afficher l'écran d'attente aux clientes."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFormEnabled(Boolean(config?.enabled));
                setFormMessage(config?.message || "");
                setFormEstimatedEnd(config?.estimatedEnd || "");
                setFormEmergencyPhone(config?.emergencyPhone || "+2250748894270");
                setDialogOpen(true);
              }}
              className="h-8 gap-1.5 text-xs font-semibold rounded-xl"
            >
              <Settings2 className="size-3.5" />
              Configurer l&apos;affiche
            </Button>

            <Button
              size="sm"
              onClick={handleQuickToggle}
              disabled={saving}
              className={cn(
                "h-8 gap-1.5 text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95",
                isMaintenance
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              )}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Power className="size-3.5" />
              )}
              {isMaintenance ? "Remettre en ligne" : "Activer la maintenance"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialogue de configuration complète de la maintenance */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-6 rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Wrench className="size-5" />
              <DialogTitle className="font-heading font-bold text-lg">
                Gestion du Mode Maintenance
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Contrôlez l&apos;état global de l&apos;application Kènè et personnalisez le message affiché aux clientes et instituts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Interrupteur Activation */}
            <div className="flex items-center justify-between rounded-2xl border bg-muted/40 p-3.5">
              <div className="space-y-0.5">
                <Label htmlFor="maint-switch" className="text-xs font-bold text-foreground">
                  Bloquer l&apos;accès public
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Bascule l&apos;application sur l&apos;écran d&apos;affiche de maintenance.
                </p>
              </div>
              <Switch
                id="maint-switch"
                checked={formEnabled}
                onCheckedChange={setFormEnabled}
              />
            </div>

            {/* Message affiché */}
            <div className="space-y-1.5">
              <Label htmlFor="maint-msg" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-primary" />
                Message officiel affiché à la clientèle *
              </Label>
              <Textarea
                id="maint-msg"
                rows={3}
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Ex: Kènè fait peau neuve ! Nos équipes effectuent actuellement une mise à jour d'optimisation..."
                className="text-xs leading-relaxed"
              />
            </div>

            {/* Heure de retour estimée */}
            <div className="space-y-1.5">
              <Label htmlFor="maint-end" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Clock className="size-3.5 text-primary" />
                Heure ou délai estimé de réouverture (optionnel)
              </Label>
              <Input
                id="maint-end"
                value={formEstimatedEnd}
                onChange={(e) => setFormEstimatedEnd(e.target.value)}
                placeholder="Ex: aujourd'hui à 11h30, dans 45 minutes..."
                className="text-xs"
              />
            </div>

            {/* WhatsApp d'urgence */}
            <div className="space-y-1.5">
              <Label htmlFor="maint-phone" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Phone className="size-3.5 text-primary" />
                Numéro WhatsApp d&apos;assistance d&apos;urgence
              </Label>
              <Input
                id="maint-phone"
                value={formEmergencyPhone}
                onChange={(e) => setFormEmergencyPhone(e.target.value)}
                placeholder="+2250748894270"
                className="text-xs font-mono"
              />
            </div>

            {/* Note d'accès admin garanti */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Accès administrateur préservé :</strong> Même lorsque la maintenance est active, vous gardez l&apos;accès complet à la Console d&apos;administration pour tester et rouvrir le site dès que vous êtes prêt.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleSaveFullConfig}
              disabled={saving || !formMessage.trim()}
              className={cn(
                "gap-1.5 text-xs font-bold text-white",
                formEnabled
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-primary hover:bg-primary/90"
              )}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {formEnabled ? "Enregistrer & Activer Maintenance" : "Enregistrer les modifications"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
