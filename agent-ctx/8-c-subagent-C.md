# Task 8-c — subagent-C « Pro + Admin » (APP PRO & Console Admin Kènè)

## Périmètre
- `src/components/kene/pro/**` : ProApp (shell) + 8 sections (Dashboard, Agenda, POS, CRM, Catalogue, Stock, Paie, Compta) + shared (types, useApi, ui-bits)
- `src/components/kene/admin/AdminApp.tsx` : Console Admin
- Contrats consommés : voir `src/components/kene/pro/types.ts` (miroir du contrat /api/pro/* & /api/admin/stats)

## Fichiers livrés
| Fichier | Rôle |
|---|---|
| `pro/types.ts` | Types de réponses API (+ re-export `PayrollLine`) |
| `pro/useApi.ts` | Hook local `useApi(fn, deps)` → data/loading/error/refetch |
| `pro/ui-bits.tsx` | KpiCard, KenteTop, Money (mono+xof), badges statut/journal/classe, Empty/Error/Loading, SectionHeader, InitialAvatar, `dayLabel()` |
| `pro/ProApp.tsx` | Shell : sidebar 240px, sélecteur institut (pattern multi-tenant), nav 8 modules, chips mobile, user démo |
| `pro/DashboardSection.tsx` | 6 KPI, BarChart 14j, PieChart paiements, top soins, timeline jour, alertes stock |
| `pro/AgendaSection.tsx` | Grille semaine/jour 30 min, détail RDV + 5 actions PATCH, création RDV (combobox clientes), reschedule |
| `pro/PosSection.tsx` | Catalogue cliquable, ticket, 4 paiements, overlay succès, ticket thermique imprimable, ventes récentes |
| `pro/CrmSection.tsx` | Recherche, stats, filtres RFM, table, fiche Sheet (RFM dots, diagnostics IA, onglets Ventes/RDV/Notes) |
| `pro/CatalogSection.tsx` | Soins/produits, création/édition, toggle actif, visuels /products/*.webp |
| `pro/StockSection.tsx` | Inventaire + valeur, mouvement E/S/Perte, historique badges |
| `pro/PayrollSection.tsx` | Employés + pointage, exécution paie (run), KPI, périodes/bulletins, bulletin A4 print, e-CNPS XML |
| `pro/AccountingSection.tsx` | Journal (+OD manuelle), Grand livre, Balance par classe, Liasse fiscale print (bilan/résultat/TVA) |
| `admin/AdminApp.tsx` | KPIs plateforme, LineChart diagnostics 14j, top instituts, note POC |

## Décisions & adaptations au backend réel
1. **Praticiennes** : l'API ne renvoie pas `resource.id` imbriqué → les Selects utilisent le `resourceId` top-level des RDV, miné sur fenêtre large (−30j/+45j) pour exister même sur semaine vide. POST vérifié 201.
2. **Dates graphes** : overview/admin renvoient parfois des dates pré-formatées « 16/08 » → `dayLabel()` fallback sans parsing.
3. **KPI paie** : calculés côté client depuis `payslips` (indépendant des clés exactes de `totalsJson`).
4. **POS** : `sale.items` reconstruits localement si absents du POST ; TVA du ticket via `splitTVA` (18 %).
5. **Notes CRM** : localStorage `kene-crm-note-{id}` (démo, sans backend).
6. `PayrollLine` importé depuis `@/lib/payroll` (et non lib/kene/types).

## État qualité
- `tsc --noEmit` : 0 erreur sur pro/admin ; `eslint pro admin` : 0 erreur/0 warning.
- Page compile 200, dev.log propre.
- ⚠️ HORS périmètre, restants pour le main : `ThemeToggle.tsx` (erreur lint `react-hooks/set-state-in-effect`) et `icons.tsx` (TS1016 param requis après optionnel).
