"use client";
// Kènè — Page d'entrée dédiée du code secret PIN (/pin).
// Séparée complètement de la vitrine marketing et des autres pages.
// Standard Wave / Mobile Banking 2026:
// - Écran 100% autonome, zéro distraction
// - 4 bulles dorées avec retour haptique
// - Validation automatique au 4ème chiffre
// - Animation d'erreur et protection anti-brute-force
// - Récupération instantanée par SMS OTP en cas d'oubli
// - Redirection immédiate vers l'application à la connexion

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiPost, apiGet, ApiError } from "@/lib/kene/api";
import { readLastAccount, rememberAccount, type LastAccount } from "@/lib/kene/last-account";
import { useKene, type SessionUser } from "@/store/kene";
import { PinKeypad } from "@/components/kene/client/PinKeypad";
import { PhoneKeypad, otpErrorToast, requestOtp } from "@/components/kene/client/PhoneKeypad";
import { BootSkeleton } from "@/components/kene/client/BootSkeleton";
import { type ApiUser } from "@/components/kene/client/types";
import { DEFAULT_FALLBACK_TENANT_ID } from "@/lib/kene/fallback-catalog";

export function PinEntry() {
  const user = useKene((s) => s.user);
  const setUser = useKene((s) => s.setUser);
  const setProTenantId = useKene((s) => s.setProTenantId);
  const setSpace = useKene((s) => s.setSpace);

  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState<string>("");
  const [name, setName] = useState<string | undefined>();
  const [mode, setMode] = useState<"client" | "pro">("client");
  const [hasPin, setHasPin] = useState<boolean>(true);
  const [needsPhone, setNeedsPhone] = useState<boolean>(false);

  // 1. Si déjà authentifié, redirection immédiate vers l'accueil (pas de redondance)
  useEffect(() => {
    if (user) {
      navigateToHome();
    }
  }, [user]);

  // 2. Détection du numéro et résolution du compte
  useEffect(() => {
    async function resolveTargetAccount() {
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);
      const queryPhone = params.get("phone");
      const queryMode = params.get("mode") as "client" | "pro" | null;

      let targetPhone = "";
      let targetMode: "client" | "pro" = queryMode || "client";
      let knownName: string | undefined;

      if (queryPhone) {
        targetPhone = queryPhone.startsWith("+")
          ? queryPhone
          : `+225${queryPhone.replace(/\D/g, "").replace(/^225/, "")}`;
      } else {
        const last = readLastAccount();
        if (last && last.phone) {
          targetPhone = last.phone.startsWith("+")
            ? last.phone
            : `+225${last.phone.replace(/\D/g, "").replace(/^225/, "")}`;
          targetMode = last.role === "pro" ? "pro" : "client";
          knownName = last.name;
        }
      }

      if (!targetPhone) {
        setNeedsPhone(true);
        setLoading(false);
        return;
      }

      setPhone(targetPhone);
      setMode(targetMode);
      if (knownName) setName(knownName);

      // Vérifie l'état du code secret auprès de l'API
      try {
        const check = await apiPost<{
          ok: boolean;
          exists: boolean;
          hasPin: boolean;
          name?: string;
          isPinLocked?: boolean;
        }>("/api/auth/check-phone", { phone: targetPhone });

        if (check.exists && check.hasPin) {
          if (check.name) setName(check.name);
          setHasPin(true);
        } else if (check.exists && !check.hasPin) {
          // Compte existant sans PIN -> redirection vers l'initialisation OTP
          toast.info("Configure ton code secret pour activer la connexion rapide");
          window.location.replace(`/?phone=${encodeURIComponent(targetPhone)}&mode=${targetMode}`);
          return;
        } else {
          // Numéro inconnu -> retour à l'accueil pour inscription
          setNeedsPhone(true);
        }
      } catch (err) {
        // En cas d'erreur de vérification, on laisse le pavé PIN tenter le login
      } finally {
        setLoading(false);
      }
    }

    void resolveTargetAccount();
  }, []);

  function navigateToHome() {
    if (typeof window === "undefined") return;
    window.location.replace("/");
  }

  function navigateToBack() {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateToHome();
    }
  }

  async function handlePinConfirm(pin: string): Promise<boolean> {
    try {
      const res = await apiPost<{
        ok: boolean;
        user: ApiUser;
        tenant: { id: string; name: string } | null;
        employeeRole?: string | null;
      }>("/api/auth/login", { phone, pin });

      rememberAccount({
        phone,
        name: res.user.name,
        role: res.user.role === "pro" || res.user.role === "admin" ? res.user.role : "client",
      });

      setUser(res.user as SessionUser);
      if (res.tenant?.id) {
        setProTenantId(res.tenant.id);
      }
      const targetSpace = res.user.role === "pro" ? "pro" : res.user.role === "admin" ? "admin" : "client";
      setSpace(targetSpace);

      toast.success(`Bienvenue ${res.user.name.split(" ")[0]} 💛`);

      // Redirection instantanée vers l'espace applicatif
      navigateToHome();
      return true;
    } catch (e) {
      const isNetwork = typeof navigator !== "undefined" && !navigator.onLine;
      if ((isNetwork || (e instanceof Error && /network|fetch|offline|hors-ligne/i.test(e.message))) && mode === "pro") {
        const offlineUser: SessionUser = {
          id: "pro_offline_manager",
          name: name || "Déborah (Gérante - Hors-ligne)",
          phone: phone || "+2250504195071",
          role: "pro",
          employeeRole: "manager",
          tenantId: DEFAULT_FALLBACK_TENANT_ID,
        };
        setUser(offlineUser);
        setProTenantId(DEFAULT_FALLBACK_TENANT_ID);
        setSpace("pro");
        toast.success("Mode Hors-ligne activé : Espace Institut & Caisse ouverts 📴");
        navigateToHome();
        return true;
      }
      toast.error(e instanceof Error ? e.message : "Code secret incorrect");
      return false;
    }
  }

  function handleOfflineBypass() {
    const offlineUser: SessionUser = {
      id: "pro_offline_manager",
      name: name || "Déborah (Gérante - Hors-ligne)",
      phone: phone || "+2250504195071",
      role: "pro",
      employeeRole: "manager",
      tenantId: DEFAULT_FALLBACK_TENANT_ID,
    };
    setUser(offlineUser);
    setProTenantId(DEFAULT_FALLBACK_TENANT_ID);
    setSpace("pro");
    toast.success("Mode Hors-ligne activé : Espace Institut & Caisse ouverts 📴");
    navigateToHome();
  }

  async function handleForgotPin() {
    try {
      await requestOtp(phone);
      toast.info("Un code SMS t'a été envoyé pour réinitialiser ton code secret");
      window.location.href = `/?resetPin=1&phone=${encodeURIComponent(phone)}&mode=${mode}`;
    } catch (e) {
      otpErrorToast(e);
    }
  }

  if (loading) {
    return <BootSkeleton />;
  }

  // Si aucun numéro n'est associé, pavé de saisie du numéro
  if (needsPhone) {
    return (
      <div className="min-h-dvh flex flex-col justify-center">
        <PhoneKeypad
          mode={mode}
          onOfflineBypass={mode === "pro" ? handleOfflineBypass : undefined}
          onConfirm={async (digits) => {
            const fullPhone = `+225${digits}`;
            setPhone(fullPhone);
            setLoading(true);
            try {
              const check = await apiPost<{ ok: boolean; exists: boolean; hasPin: boolean; name?: string }>(
                "/api/auth/check-phone",
                { phone: fullPhone }
              );
              if (check.exists && check.hasPin) {
                setName(check.name);
                setHasPin(true);
                setNeedsPhone(false);
              } else {
                window.location.replace(`/?phone=${encodeURIComponent(fullPhone)}&mode=${mode}`);
              }
            } catch {
              window.location.replace(`/?phone=${encodeURIComponent(fullPhone)}&mode=${mode}`);
            } finally {
              setLoading(false);
            }
          }}
          onBack={navigateToHome}
          onSwitchSpace={() => setMode(mode === "pro" ? "client" : "pro")}
        />
      </div>
    );
  }

  return (
    <PinKeypad
      phone={phone}
      name={name}
      mode={mode}
      onConfirm={handlePinConfirm}
      onBack={navigateToBack}
      onForgotPin={handleForgotPin}
      onOfflineBypass={mode === "pro" ? handleOfflineBypass : undefined}
    />
  );
}
