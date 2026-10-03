"use client";
// Kènè Cliente — Mentions légales & conformité: éditeur,
// avertissement médical renforcé, données personnelles (RGPD + Afrique de
// l'Ouest), cadre local CI/SN, paiements en mode essai.
// Structure Reveal identique à SettingsScreen (retour accueil même pattern).
// Libellés 100 % FR direct (i18n hors périmètre ce sprint).
import { ArrowLeft, Building2, CreditCard, Scale, ShieldCheck, Stethoscope } from "lucide-react";
import { IconBadge, Reveal, RevealItem } from "@/components/kene/ui2026";
import { useKene } from "@/store/kene";

export function LegalScreen() {
  const setClientTab = useKene((s) => s.setClientTab);

  return (
    <Reveal className="pt-4 pb-2 flex flex-col gap-6" stagger={0.07}>
      <RevealItem className="self-start">
        <button onClick={() => setClientTab("parametres")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label="Retour aux paramètres">
          <ArrowLeft size={15} /> Retour
        </button>
      </RevealItem>

      {/* 1 — Éditeur Technologique & Établissements Partenaires */}
      <RevealItem>
        <section aria-labelledby="leg-ed-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Building2 size={19} />} tone="gold" />
            <p id="leg-ed-t" className="text-xs font-bold">Éditeur Technologique & Établissements Partenaires</p>
          </div>
          <div className="mt-3 text-[13px] leading-relaxed space-y-3">
            <div>
              <p className="font-semibold text-primary">Éditeur de la plateforme : Dermo TIC</p>
              <p className="text-muted-foreground text-xs leading-relaxed mt-0.5">
                Dermo TIC est une société de développement de solutions logicielles et numériques. Elle intervient exclusivement en qualité d&apos;éditeur technique et d&apos;hébergeur de la plateforme SaaS et marketplace Kènè. Dermo TIC n&apos;est ni un salon de beauté, ni un institut de soins, ni un cabinet médical ou dermatologique.
              </p>
            </div>
            <div className="pt-2 border-t border-border/60">
              <p className="font-semibold">Statut d&apos;intermédiaire technique &amp; Absence de vente directe</p>
              <p className="text-muted-foreground text-xs leading-relaxed mt-0.5">
                Dermo TIC ne vend aucun produit cosmétique ni aucune prestation de soins à son propre compte. La société n&apos;exerce aucun acte médical, paramédical ou esthétique et n&apos;encourt aucune responsabilité au titre de la fourniture des soins ou de l&apos;utilisation des produits.
              </p>
            </div>
            <div className="pt-2 border-t border-border/60">
              <p className="font-semibold">Responsabilité des Professionnels Partenaires (RC Pro)</p>
              <p className="text-muted-foreground text-xs leading-relaxed mt-0.5">
                La vente de produits cosmétiques, la formulation des routines esthétiques et la réalisation des prestations de soins sont opérées sous l&apos;entière et exclusive responsabilité des établissements professionnels partenaires (instituts, spas, cabinets esthétiques). Chaque établissement partenaire s&apos;engage à être légalement enregistré, à disposer d&apos;une assurance Responsabilité Civile Professionnelle (RC Pro) valide et à commercialiser des produits conformes aux réglementations nationales (AIRP en Côte d&apos;Ivoire, DPML au Sénégal).
              </p>
            </div>
          </div>
        </section>
      </RevealItem>

      {/* 2 — Avertissement médical renforcé & IA Dr. Kènè */}
      <RevealItem>
        <section aria-labelledby="leg-med-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Stethoscope size={19} />} tone="bissap" />
            <p id="leg-med-t" className="text-xs font-bold">Avertissement médical &amp; Dr. Kènè IA</p>
          </div>
          <div className="mt-3 text-[13px] leading-relaxed space-y-2">
            <p className="font-semibold text-primary">
              Kènè et l&apos;assistant « Dr. Kènè IA » constituent un outil d&apos;ORIENTATION DERMO-COSMÉTIQUE et d&apos;éducation cutanée.
            </p>
            <p className="text-xs leading-relaxed">
              Dr. Kènè IA est un algorithme d&apos;intelligence artificielle et <strong>n&apos;est pas un médecin</strong>. Il ne pose aucun diagnostic médical, ne traite aucune pathologie dermatologique et ne délivre aucune ordonnance médicale au sens de la législation médicale (notamment l&apos;article 376 du Code Pénal ivoirien relatif à l&apos;exercice illégal de la médecine).
            </p>
            <p className="text-xs leading-relaxed">
              Les fiches d&apos;analyses cutanées, « Recommandations Dermo-Botaniques » et « Protocoles de Soin » générés sont de nature strictement cosmétique et consultative.
            </p>
            <p className="text-xs leading-relaxed text-destructive font-medium bg-destructive/10 p-2.5 rounded-xl border border-destructive/20">
              ⚠️ En cas d&apos;affection cutanée inhabituelle, de lésion suspecte (grain de beauté asymétrique ou évolutif, plaie, desquamation sévère), consulte impérativement et sans délai un médecin dermatologue diplômé d&apos;État.
            </p>
          </div>
        </section>
      </RevealItem>

      {/* 3 — Données personnelles (RGPD + ARTCI / CDP) */}
      <RevealItem>
        <section aria-labelledby="leg-data-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<ShieldCheck size={19} />} tone="success" />
            <p id="leg-data-t" className="text-xs font-bold">Protection des Données &amp; Vie Privée</p>
          </div>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
              <span><strong className="font-semibold">Base légale &amp; Consentement éclairé :</strong> le traitement de tes données dermo-esthétiques (photos cutanées, réponses au questionnaire) repose sur ton consentement explicite, révocable à tout moment.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
              <span><strong className="font-semibold">Droits fondamentaux :</strong> accès, portabilité, rectification et effacement. Tu peux exporter l&apos;intégralité de tes données ou supprimer définitivement ton compte depuis « Paramètres → Mes données ».</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
              <span><strong className="font-semibold">Confidentialité des clichés :</strong> tes photos de diagnostic sont chiffrées au repos et ne sont jamais transmises à des tiers sans ton autorisation expresse.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
              <span><strong className="font-semibold">Partage avec les instituts :</strong> un institut partenaire n&apos;a accès à ton historique de self-scans que si tu l&apos;y autorises explicitement lors de ta prise de rendez-vous.</span>
            </li>
          </ul>
        </section>
      </RevealItem>

      {/* 4 — Cadre réglementaire local (Côte d'Ivoire & Sénégal) */}
      <RevealItem>
        <section aria-labelledby="leg-ci-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Scale size={19} />} tone="terre" />
            <p id="leg-ci-t" className="text-xs font-bold">Cadre Réglementaire UEMOA</p>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed">
            <strong>Côte d&apos;Ivoire :</strong> loi n°2013-450 relative à la protection des données à caractère personnel (Autorité de Régulation des Télécommunications/TIC de Côte d&apos;Ivoire - ARTCI).
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">
            <strong>Sénégal :</strong> loi n°2008-12 sur la protection des données à caractère personnel (Commission de Protection des Données Personnelles - CDP).
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-primary font-medium">
            Kènè applique de manière transversale les standards de conformité les plus exigeants dans l&apos;ensemble de l&apos;espace UEMOA et OHADA.
          </p>
        </section>
      </RevealItem>

      {/* 5 — Paiements & Conformité Monétaire */}
      <RevealItem>
        <section aria-labelledby="leg-pay-t" className="k-card rounded-[24px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<CreditCard size={19} />} tone="gold" />
            <p id="leg-pay-t" className="text-xs font-bold">Paiements &amp; Conformité Monétaire BCEAO</p>
          </div>
          <div className="mt-3 text-[13px] leading-relaxed space-y-2">
            <p className="text-xs leading-relaxed">
              Les règlements électroniques directs (Wave Mobile Money, Orange Money, MTN, Moov, Cartes Bancaires) sont sécurisés et gérés exclusivement par des Prestataires de Services de Paiement (PSP) agréés par la Banque Centrale des États de l&apos;Afrique de l&apos;Ouest (BCEAO).
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Les reçus et factures d&apos;achats émis par les établissements partenaires respectent les réglementations commerciales et fiscales applicables (TVA 18% UEMOA).
            </p>
          </div>
        </section>
      </RevealItem>
    </Reveal>
  );
}
