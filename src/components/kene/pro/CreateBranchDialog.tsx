// src/components/kene/pro/CreateBranchDialog.tsx
// Modal de création d'une nouvelle succursale pour l'espace Pro Kènè
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiPost } from "@/lib/kene/api";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (newTenant: { id: string; name: string }) => void;
}

export function CreateBranchDialog({ open, onOpenChange, onSuccess }: CreateBranchDialogProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"institut" | "spa" | "dermo_conseil">("institut");
  const [country, setCountry] = useState<"CI" | "SN">("CI");
  const [city, setCity] = useState("Abidjan — ");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const reset = () => {
    setName("");
    setType("institut");
    setCountry("CI");
    setCity("Abidjan — ");
    setAddress("");
    setPhone("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Veuillez saisir le nom de l'établissement");
      return;
    }
    if (!city.trim() || city.trim() === "Abidjan — ") {
      toast.error("Veuillez préciser la ville ou la commune");
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; tenant: { id: string; name: string } }>("/api/pro/tenants", {
        name: name.trim(),
        type,
        country,
        city: city.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      toast.success("Nouvel établissement créé avec succès !", {
        description: `Bienvenue dans votre nouvelle succursale « ${res.tenant.name} ».`,
      });
      reset();
      onOpenChange(false);
      onSuccess(res.tenant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création de l'établissement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading) {
          if (!v) reset();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Building2 className="size-5" />
              <DialogTitle className="font-heading text-lg">Ajouter une nouvelle succursale</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Créez un nouvel établissement rattaché à votre compte. Les praticiennes de départ et le catalogue initial seront automatiquement configurés.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name" className="text-xs font-semibold">
                Nom de l&apos;établissement <span className="text-destructive">*</span>
              </Label>
              <Input
                id="branch-name"
                placeholder="Ex: Cabinet LA DERMO — Marcory Zone 4"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="branch-type" className="text-xs font-semibold">
                  Type d&apos;activité
                </Label>
                <Select value={type} onValueChange={(v: "institut" | "spa" | "dermo_conseil") => setType(v)} disabled={loading}>
                  <SelectTrigger id="branch-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="institut">Institut de beauté</SelectItem>
                    <SelectItem value="spa">Spa & Massages</SelectItem>
                    <SelectItem value="dermo_conseil">Dermo-conseil</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="branch-country" className="text-xs font-semibold">
                  Pays
                </Label>
                <Select value={country} onValueChange={(v: "CI" | "SN") => {
                  setCountry(v);
                  if (v === "SN" && city.startsWith("Abidjan")) setCity("Dakar — ");
                  if (v === "CI" && city.startsWith("Dakar")) setCity("Abidjan — ");
                }} disabled={loading}>
                  <SelectTrigger id="branch-country" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CI">Côte d&apos;Ivoire (CI)</SelectItem>
                    <SelectItem value="SN">Sénégal (SN)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-city" className="text-xs font-semibold">
                Ville / Commune <span className="text-destructive">*</span>
              </Label>
              <Input
                id="branch-city"
                placeholder={country === "CI" ? "Ex: Abidjan — Cocody Angré" : "Ex: Dakar — Almadies"}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-address" className="text-xs font-semibold">
                Adresse physique (optionnel)
              </Label>
              <Input
                id="branch-address"
                placeholder="Ex: Boulevard de Marseille, Immeuble..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-phone" className="text-xs font-semibold">
                Téléphone de l&apos;établissement (optionnel)
              </Label>
              <Input
                id="branch-phone"
                placeholder="Ex: +225 27 22..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-1.5">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Building2 className="size-4" />
                  Créer l&apos;établissement
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
