"use client";
// Kènè Cliente — Mentions légales & conformité (t. 71-c) : éditeur POC,
// avertissement médical renforcé, données personnelles (RGPD + Afrique de
// l'Ouest), cadre local CI/SN, paiements simulés.
// Structure Reveal identique à SettingsScreen (retour accueil même pattern).
// Libellés 100 % FR direct (i18n hors périmètre ce sprint).
import { ArrowLeft, Building2, Scale, ShieldCheck, Stethoscope, Wallet } from "lucide-react";
import { IconBadge, Reveal, RevealItem } from "@/components/kene/ui2026";
import { useKene } from "@/store/kene";

export function LegalScreen() {
  const setClientTab = useKene((s) => s.setClientTab);

  return (
    <Reveal className="pt-4 pb-2 flex flex-col gap-6" stagger={0.07}>
      <RevealItem className="self-start">
        <button onClick={() => setClientTab("accueil")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label="Retour à l'accueil">
          <ArrowLeft size={15} /> Accueil
        </button>
      </RevealItem>

      {/* 1 — Éditeur */}
      <RevealItem>
        <section aria-labelledby="leg-ed-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Building2 size={19} />} tone="gold" />
            <p id="leg-ed-t" className="text-xs font-bold">Éditeur</p>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed">
            Kènè — POC v1.0 (preuve de concept). Paiements simulés. Contact : support@kene.app
          </p>
        </section>
      </RevealItem>

      {/* 2 — Avertissement médical renforcé */}
      <RevealItem>
        <section aria-labelledby="leg-med-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Stethoscope size={19} />} tone="bissap" />
            <p id="leg-med-t" className="text-xs font-bold">Avertissement médical</p>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed font-semibold">
            Kènè est un outil d&apos;ORIENTATION COSMÉTIQUE assisté par IA. Il ne pose aucun diagnostic médical et ne remplace pas un dermatologue.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">
            En cas de lésion suspecte (nævi, grains de beauté qui changent), consulte un dermatologue sans délai — l&apos;IA de Kènè est conçue pour te recommander la prudence.
          </p>
        </section>
      </RevealItem>

      {/* 3 — Données personnelles (RGPD + Afrique de l'Ouest) */}
      <RevealItem>
        <section aria-labelledby="leg-data-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<ShieldCheck size={19} />} tone="success" />
            <p id="leg-data-t" className="text-xs font-bold">Données personnelles</p>
          </div>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed">
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
              <span><strong className="font-semibold">Base légale : consentement.</strong> Tu acceptes l&apos;utilisation de tes données peau (photos, questionnaires) pour tes analyses — tu peux le retirer à tout moment.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
              <span><strong className="font-semibold">Tes droits :</strong> accès, export et suppression. L&apos;export RGPD de ton dossier complet est déjà disponible dans Paramètres (« Mes données »).</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
              <span><strong className="font-semibold">Rétention des photos :</strong> les photos de diagnostic sont conservées pour ton historique ; en production, purge automatique à 90 jours. En POC, elles restent attachées à ton compte tant que tu ne le supprimes pas.</span>
            </li>
          </ul>
        </section>
      </RevealItem>

      {/* 4 — Cadre local (Côte d'Ivoire & Sénégal) */}
      <RevealItem>
        <section aria-labelledby="leg-ci-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Scale size={19} />} tone="terre" />
            <p id="leg-ci-t" className="text-xs font-bold">Cadre local</p>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed">
            Côte d&apos;Ivoire : loi n°2013-450 relative à la protection des données à caractère personnel (autorité : ARTCI).
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">
            Sénégal : Commission de Protection des Données Personnelles (CDP), loi n°2008-12.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed font-semibold text-primary">
            Kènè applique le même niveau d&apos;exigence dans les deux pays.
          </p>
        </section>
      </RevealItem>

      {/* 5 — Paiements */}
      <RevealItem>
        <section aria-labelledby="leg-pay-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Wallet size={19} />} tone="gold" />
            <p id="leg-pay-t" className="text-xs font-bold">Paiements</p>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed">
            Les paiements (wallet, commandes, acomptes, abonnements) sont <strong className="font-semibold">simulés</strong> en POC — aucun argent réel ne circule.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">
            Le mobile money réel (Wave, Orange Money, MTN MoMo) passera par un agrégateur certifié à venir.
          </p>
        </section>
      </RevealItem>
    </Reveal>
  );
}
