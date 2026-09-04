# Task 55-e — Accessibilité WCAG AA + cibles tactiles (agent développeur)

Mission : appliquer les corrections a11y post-mise à jour du design system
(`--primary` #8F660D light, `--score-*` thémés, `--gold-text`) sur 7 fichiers
uniquement, sans toucher ClientApp/HomeScreen/ShopScreen/BookingScreen/bits/
ChatScreen/VoiceNarration/Onboarding/globals.css/page.tsx.

## Règle de migration appliquée
- TEXTE / trait / jauge / conic-gradient avec scoreColor → `scoreVar()` (style prop, thème-adapté AA).
- APLATS scoreColor + readableTextColor → inchangés (DiagnosticScreen l.366, SkinTwinCard l.197).
- `text-gold` / `text-[#C8951E]` (texte) → `text-gold-text` dans les 7 fichiers.
- Cibles tactiles ≥ 40/44 px sur les contrôles listés.

## Fichiers modifiés
1. **ProApp.tsx** — h1 unique rendu en permanence `<h1 className="sr-only lg:not-sr-only font-heading text-lg font-bold truncate mb-4">` (visible desktop lg+, sr-only <lg où l'en-tête compact + chip active de la nav portent la section) ; retiré du conteneur `lg:hidden` (qui garde tenant/logo/toggles) ; chips nav mobile `min-h-11` (44 px) ; PLAN_STYLES.pro `text-gold`→`text-gold-text`.
2. **PosSection.tsx** — boutons qty/suppr ticket `size-6`→`size-10` (icônes 3→3.5, aria-labels conservés) ; bouton « Ticket » `h-7`→`h-11` ; input remise `h-7`→`h-10` ; prix/TOTAL/entonnoir `text-gold`→`text-gold-text` (l.182/203/296/372) ; CTA « Créer et encaisser » `bg-gold text-gold-text` (1.91:1) → `bg-primary text-primary-foreground` + `hover:bg-primary/90` + `focus-visible:outline-2 focus-visible:outline-primary`.
3. **CrmSection.tsx** — import `scoreVar` (scoreColor retiré) ; RfmDots `{val}/5` + pastille stats `text-gold-text` ; scores texte l.370 et rond score l.462 → `scoreVar` ; `<tr role="button">` → tr nu avec `tabIndex={0}` + onKeyDown Enter/Space + onClick + aria-label (td conservés) ; boutons filtres segments `min-h-11`.
4. **DiagnosticsSection.tsx** — import `scoreVar` ; tous les scoreColor texte/jauge migrés (liste l.171, anneau conic + verdict l.918, indicateurs l.1018 texte+barre) ; icône pédagogie + badges « Photo IA »/« important »/botaniques + numéros routine + FLAG_STYLES.warn → `text-gold-text` ; titres de Sheet Vigilances/Indicateurs/Protocole h4→h3 (hiérarchie SheetTitle h2 → h3) ; chips zone ET choix de réponse `min-h-11` ; `aria-required={q.required}` sur les radiogroup/groupes de réponse (le `*` reste aria-hidden).
5. **DiagnosticScreen.tsx** — 4 h1 internes → h2 (zone/capture/résultat/historique ; ordre header h1 ClientApp → h2 vues → h2 sections, 0 saut) ; légende sévérité `text-[8px]`→`text-[11px]` ; CTA Route de l'Or `from-[#C8951E] via-[#A0522D] to-[#8B1A3B]` → `from-[#A0522D] via-[#8B1A3B] to-[#6B2416]` (texte #FFF9EC ≥5.3:1) ; « Matin » `text-[#C8951E]`→`text-gold-text` ; photo X `h-9 w-9`→`h-10 w-10` ; Panier/Boutique/Comparer `h-9`→`h-10` ; checkbox comparaison `h-8 w-8`→`h-9 w-9`. Badge aplat l.366 scoreColor+readableTextColor NON touché.
6. **PictoSummary.tsx** — import `scoreVar` ; cercle icône : fond translucide aplat `scoreColor(x)22` conservé, icône `color: scoreVar(x)` ; texte pct → `scoreVar`.
7. **SkinTwinCard.tsx** — import `scoreVar` ; pourcentage indicateur lié → `scoreVar` ; aplats (badge score text-white, rimColor 3D) inchangés.

## Vérifications
- `npx tsc --noEmit` : **0 erreur dans src/** (3 erreurs préexistantes hors périmètre : examples/websocket, skills/image-edit, skills/stock-analysis).
- `bun run lint` : **0 problème**.
- Grep final : plus aucun `text-gold` nu, plus aucun `scoreColor` en couleur de texte, plus aucun h4/h1 interne dans les fichiers traités ; dev.log : recompilations Fast Refresh ✓ sans erreur.

## Notes pour l'agent principal
- ProApp mobile : le h1 passe sr-only <lg (pattern prescrit) → le titre text-lg de section n'est plus rendu visuellement en mobile ; la chip active de la nav mobile + le bandeau tenant portent l'information. Si un titre visible mobile est souhaité, retirer `sr-only lg:not-sr-only` du h1 (il est déjà monté en permanence).
- PictoSummary : l'icône du picto utilise scoreVar (AA), le disque reste un aplat translucide hex — volontaire.
