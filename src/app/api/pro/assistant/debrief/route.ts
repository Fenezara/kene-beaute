// Kènè Pro — POST /api/pro/assistant/debrief
// Moteur d'analyse IA et Secrétaire de Direction Intelligente
// Architecture multi-paliers (Zero-Failure) :
//   1. Palier 1 : Google Gemini REST avec cascade de modèles (gemini-2.5-flash, etc.)
//   2. Palier 2 : Z.ai SDK (si .z-ai-config présent)
//   3. Palier 3 : Moteur NLU Expert Kènè (compréhension complète des questions ET instructions)
// Rôle : Écoute active, réponses exactes aux questions sur l'institut (caisse, agenda, stock,
// tarifs, clientes, équipe), exécution des consignes métier, clarifications pertinentes.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { zaiCall } from "@/lib/ai/zai-retry";

const DEBRIEF_TIMEOUT_MS = 25_000;

export const runtime = "nodejs";

const Body = z.object({
  tenantId: z.string().min(1),
  text: z.string().min(1).max(2000),
  userName: z.string().max(100).optional(),
  userGender: z.enum(["femme", "homme", "non_precise"]).optional(),
  managerName: z.string().max(100).optional(),
  previousDebrief: z.any().optional(),
  userRole: z.string().max(100).optional(),
  isOwner: z.boolean().optional(),
  allowedSections: z.array(z.string()).optional(),
  tenantPlan: z.string().max(50).optional(),
});

export interface DebriefResult {
  summary: string;
  vocalSummary: string; // Texte parlé chaleureux et élégant
  needsClarification?: boolean; // Vrai si des précisions indispensables manquent
  clarificationQuestion?: string; // Question orale posée à la gérante
  clarificationOptions?: Array<{ label: string; value: string }>; // Puces 1-Tap de réponse
  initiatives?: Array<{
    type: "stock_reorder" | "whatsapp_followup" | "debt_reminder" | "loyalty";
    title: string;
    desc: string;
  }>;
  hasSale: boolean;
  sale?: {
    items: Array<{
      kind: "service" | "product";
      id?: string;
      label: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    total: number;
    paidAmount: number;
    remainingDebt: number; // Reste à payer / ardoise
    paymentMethod: "wave" | "orange" | "cash" | "card";
    discount: number;
    tipAmount: number; // Pourboire pour l'employée
  };
  hasStockMovement: boolean;
  stock?: {
    decrements: Array<{
      productId: string;
      productName: string;
      qty: number;
      currentStock: number;
      newStock: number;
      isLowStock: boolean;
    }>;
  };
  hasClient: boolean;
  client?: {
    name: string;
    phone?: string;
    skinNotes?: string;
    debtAmount?: number;
    isExisting: boolean;
    clientProfileId?: string;
  };
  hasAppointment: boolean;
  appointment?: {
    serviceName: string;
    serviceId?: string;
    practitionerName?: string;
    practitionerId?: string;
    dateStr: string; // ISO ou date lisible
    timeStr: string; // "14:00"
    notes?: string;
  };
  hasTeamCredit: boolean;
  team?: {
    employeeName: string;
    employeeId?: string;
    commissionAmount: number;
    tipAmount: number;
  };
  hasExpense: boolean; // Dépense petite caisse
  expense?: {
    amount: number;
    description: string;
    category: string;
  };
  hasRelance: boolean;
  relance?: {
    delayDays: number;
    message: string;
  };
}

interface LiveSalonStats {
  todayTotal: number;
  waveTotal: number;
  orangeTotal: number;
  cashTotal: number;
  cardTotal: number;
  salesCount: number;
  appointmentsToday: Array<{
    id: string;
    time: string;
    clientName: string;
    serviceName: string;
    practitionerName: string;
    status: string;
  }>;
  upcomingAppointments: Array<{
    id: string;
    dateLabel: string;
    time: string;
    clientName: string;
    serviceName: string;
    status: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    stock: number;
    stockAlert: number;
    price: number;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:assistant:debrief");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const { tenantId, text, previousDebrief } = parsed.data;

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        services: { where: { active: true } },
        products: { where: { active: true } },
        employees: true,
        resources: { where: { active: true } },
      },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    // 1. Clientes récentes
    const recentClients = await db.clientProfile.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        phone: true,
        skinType: true,
        notes: true,
        totalSpent: true,
        visitsCount: true,
      },
      take: 40,
      orderBy: { createdAt: "desc" },
    });

    // 2. Ventes et encaissements du jour
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const salesToday = await db.sale.findMany({
      where: {
        tenantId,
        createdAt: { gte: todayStart },
        status: "completed",
      },
      include: { items: true },
    });

    let todayTotal = 0;
    let waveTotal = 0;
    let orangeTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    for (const s of salesToday) {
      todayTotal += s.total;
      if (s.paymentMethod === "wave") waveTotal += s.total;
      else if (s.paymentMethod === "orange") orangeTotal += s.total;
      else if (s.paymentMethod === "cash") cashTotal += s.total;
      else if (s.paymentMethod === "card") cardTotal += s.total;
    }

    // 3. Rendez-vous du jour et à venir
    const apptsRaw = await db.appointment.findMany({
      where: {
        tenantId,
        startAt: { gte: todayStart },
      },
      include: { service: true, resource: true },
      orderBy: { startAt: "asc" },
      take: 25,
    });

    const appointmentsToday = apptsRaw
      .filter((a) => new Date(a.startAt) <= todayEnd)
      .map((a) => ({
        id: a.id,
        time: new Date(a.startAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        clientName: a.clientName || "Cliente",
        serviceName: a.service?.name || "Soin en cabine",
        practitionerName: a.resource?.name || "Équipe",
        status: a.status,
      }));

    const upcomingAppointments = apptsRaw
      .filter((a) => new Date(a.startAt) > todayEnd)
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        dateLabel: new Date(a.startAt).toLocaleDateString("fr-FR", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
        time: new Date(a.startAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        clientName: a.clientName || "Cliente",
        serviceName: a.service?.name || "Soin en cabine",
        status: a.status,
      }));

    // 4. Alertes stock
    const lowStockProducts = tenant.products
      .filter((p) => p.stock <= p.stockAlert)
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        stockAlert: p.stockAlert,
        price: p.price,
      }));

    // Détermination dynamique des permissions effectives
    const { userRole, isOwner, allowedSections, tenantPlan } = parsed.data;
    const isEffectiveOwner = isOwner !== false;
    const canViewCaisse = isEffectiveOwner || Boolean(allowedSections?.includes("caisse") || allowedSections?.includes("dashboard"));
    const canViewStock = isEffectiveOwner || Boolean(allowedSections?.includes("stock") || allowedSections?.includes("catalogue"));
    const canManageExpenses = isEffectiveOwner || Boolean(allowedSections?.includes("caisse"));

    const liveStats: LiveSalonStats = {
      todayTotal: canViewCaisse ? todayTotal : 0,
      waveTotal: canViewCaisse ? waveTotal : 0,
      orangeTotal: canViewCaisse ? orangeTotal : 0,
      cashTotal: canViewCaisse ? cashTotal : 0,
      cardTotal: canViewCaisse ? cardTotal : 0,
      salesCount: canViewCaisse ? salesToday.length : 0,
      appointmentsToday,
      upcomingAppointments,
      lowStockProducts: canViewStock ? lowStockProducts : [],
    };

    const contextServices = tenant.services.map((s) => ({ id: s.id, name: s.name, price: s.price }));
    const contextProducts = tenant.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      stock: p.stock,
      stockAlert: p.stockAlert,
    }));
    const contextEmployees = tenant.employees.map((e) => ({ id: e.id, name: e.name, role: e.role }));
    const contextClients = recentClients.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      skinType: c.skinType,
      notes: c.notes,
      totalSpent: c.totalSpent,
    }));

    const managerName = (parsed.data.managerName || parsed.data.userName)?.trim() || "Madame";

    const systemPrompt = buildSystemPrompt(
      contextServices,
      contextProducts,
      contextEmployees,
      contextClients,
      liveStats,
      managerName,
      tenant.name,
      isEffectiveOwner,
      userRole,
      canViewCaisse,
      canViewStock,
      canManageExpenses,
      tenantPlan || tenant.plan || "trial",
      parsed.data.userGender || "non_precise",
    );

    let userPromptText = text;
    if (previousDebrief) {
      userPromptText = `[CONTEXTE EN COURS DE CLARIFICATION] : ${JSON.stringify(previousDebrief)}\n[NOUVELLE PRÉCISION OU RÉPONSE DE ${managerName}] : "${text}"\nConsigne : Intègre cette précision (ex: moyen de paiement, jour/heure du RDV, montant ou cible), complète l'objet correspondant, passe "needsClarification": false dès que l'information est fournie, et formule un vocalSummary chaleureux qui confirme la mise à jour.`;
    }

    // Architecture multi-paliers : Gemini (cascade) → ZAI → Moteur NLU Expert Kènè
    let debrief: DebriefResult | null = null;

    // Palier 1 : Google Gemini REST
    try {
      debrief = await callGeminiDebrief(systemPrompt, userPromptText);
      if (debrief) {
        console.log("[assistant:debrief] Palier Gemini ✓");
      }
    } catch (err) {
      console.warn("[assistant:debrief] Palier Gemini échoué, bascule ZAI :", (err as Error).message);
    }

    // Palier 2 : Z.ai SDK
    if (!debrief) {
      try {
        debrief = await callZaiDebrief(systemPrompt, userPromptText);
        if (debrief) {
          console.log("[assistant:debrief] Palier ZAI ✓");
        }
      } catch (err) {
        console.warn("[assistant:debrief] Palier ZAI échoué, bascule NLU :", (err as Error).message);
      }
    }

    // Palier 3 : Moteur NLU Expert Kènè (toujours disponible)
    if (!debrief) {
      debrief = fallbackParser(
        text,
        tenant,
        recentClients,
        liveStats,
        managerName,
        previousDebrief,
        isEffectiveOwner,
        userRole,
        canViewCaisse,
        canViewStock,
        canManageExpenses,
      );
      console.log("[assistant:debrief] Palier NLU Expert Kènè ✓");
    }

    return NextResponse.json({ debrief });
  } catch (err) {
    return serverError("pro/assistant:debrief", err);
  }
}

// ─────────────────────────── Prompt système ───────────────────────────

function getBossCall(
  managerName: string,
  isOwner = true,
  userRole = "",
  userGender: "femme" | "homme" | "non_precise" = "non_precise",
): string {
  const cleanFirst = (managerName || "").split(/\s+/)[0] || "";
  const isExplicitMale =
    userGender === "homme" ||
    /^(monsieur|m\.|dr|mr|ibrahim|mamadou|moussa|ali|jean|paul|david|kouassi|yao|koffi|amadou|seydou|bakary)/i.test(cleanFirst);

  if (!isOwner) {
    if (isExplicitMale) return cleanFirst ? `Monsieur ${cleanFirst}` : "Cher collaborateur";
    return cleanFirst ? cleanFirst : "Chère collaboratrice";
  }

  if (isExplicitMale) {
    return cleanFirst ? `Patron ${cleanFirst}` : "Monsieur le Directeur";
  }

  const isFem =
    userGender === "femme" ||
    cleanFirst.toLowerCase().endsWith("a") ||
    cleanFirst.toLowerCase().endsWith("e") ||
    cleanFirst.toLowerCase().includes("deborah") ||
    cleanFirst.toLowerCase().includes("fatou") ||
    cleanFirst.toLowerCase().includes("mariam") ||
    cleanFirst.toLowerCase().includes("awa") ||
    cleanFirst.toLowerCase().includes("aminata");
  return `Patron${isFem ? "ne" : ""} ${cleanFirst || ""}`.trim();
}

function buildSystemPrompt(
  services: Array<{ id: string; name: string; price: number }>,
  products: Array<{ id: string; name: string; price: number; stock: number; stockAlert: number }>,
  employees: Array<{ id: string; name: string; role: string }>,
  clients: Array<{ id: string; name: string; phone: string | null; skinType?: string | null; notes?: string | null; totalSpent?: number }>,
  liveStats: LiveSalonStats,
  managerName: string,
  tenantName: string,
  isOwner = true,
  userRole = "",
  canViewCaisse = true,
  canViewStock = true,
  canManageExpenses = true,
  tenantPlan = "trial",
  userGender: "femme" | "homme" | "non_precise" = "non_precise",
): string {
  const bossCall = getBossCall(managerName, isOwner, userRole, userGender);
  const isMale = userGender === "homme" || /^(monsieur|m\.|dr|mr|patron)/i.test(bossCall);
  const nowStr = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const identityIntro = isOwner
    ? `Tu es la Secrétaire de Direction et Assistante d'Élite dévouée de ${bossCall}, ${isMale ? "dirigeant" : "dirigeante"} de l'institut "${tenantName}" en Côte d'Ivoire.`
    : `Tu es l'Assistante Cabine et Secrétaire IA de l'institut "${tenantName}", au service de ${bossCall} (${userRole || (isMale ? "Collaborateur" : "Collaboratrice")}).`;

  const caisseRule = canViewCaisse
    ? `- CAISSE DU JOUR : Total encaissé = ${liveStats.todayTotal} FCFA (${liveStats.salesCount} vente(s)) | Wave = ${liveStats.waveTotal} FCFA | Orange Money = ${liveStats.orangeTotal} FCFA | Espèces = ${liveStats.cashTotal} FCFA | Carte = ${liveStats.cardTotal} FCFA.`
    : `- CAISSE DU JOUR : [ACCÈS NON AUTORISÉ - CONFIDENTIEL]. ${bossCall} N'A PAS le droit d'accéder aux chiffres de caisse ni au chiffre d'affaires du salon. Si ${bossCall} pose une question sur la caisse, les recettes ou le chiffre d'affaires, refuse poliment avec diplomatie en rappelant que le point financier du salon est strictement confidentiel et réservé à la direction de l'institut. Ne divulgue AUCUN montant de caisse.`;

  const expenseRule = canManageExpenses
    ? ""
    : `\n- SÉCURITÉ DÉPENSES : ${bossCall} n'est pas autorisée à enregistrer des sorties de caisse ni des dépenses. Si elle demande une sortie de caisse, refuse poliment en indiquant que la gestion de caisse est réservée à la direction.`;

  return `${identityIntro}
Date d'aujourd'hui : ${nowStr}.
Ton attitude est profondément humaine, intelligente, chaleureuse, respectueuse et dévouée.

═══ RÈGLE FONDAMENTALE N°1 : COMPRÉHENSION EXACTE DES QUESTIONS ET DES INSTRUCTIONS ═══
Tu dois analyser avec précision ce que ${bossCall} te dit ou te demande :

CAS A — C'EST UNE QUESTION, UNE DEMANDE D'INFORMATION OU DE CONSEIL (ex: "Combien j'ai en caisse ?", "Quels sont mes rendez-vous ?", "Est-ce qu'il reste du karité en stock ?", "Quel est le prix du soin ?", "Qui travaille aujourd'hui ?", "Parle-moi de la cliente Mariam", "Donne-moi un conseil pour mes ventes") :
- Réponds DIRECTEMENT, EXACTEMENT et CHALEUREUSEMENT à la question posée dans "vocalSummary" et "summary" en utilisant les VRAIES DONNÉES EN TEMPS RÉEL de l'institut ci-dessous.
- Si la question concerne la caisse, le chiffre d'affaires ou les recettes du salon alors que ${bossCall} n'y a pas droit (!canViewCaisse), refuse poliment avec diplomatie en rappelant la confidentialité directionnelle.
- Mets OBLIGATOIREMENT tous les indicateurs d'écriture à false : "hasSale": false, "hasStockMovement": false, "hasClient": false, "hasAppointment": false, "hasTeamCredit": false, "hasExpense": false, "hasRelance": false, "needsClarification": false.
- INTERDICTION ABSOLUE d'inventer une vente ("Cliente de passage") ou un rendez-vous fictif lorsque ${bossCall} pose une simple question !

CAS B — C'EST UNE INSTRUCTION D'ACTION OU UN COMPTE-RENDU OPÉRATIONNEL (ex: enregistrer un soin/vente, planifier un RDV, noter une dépense de petite caisse, décompter un stock, créer une cliente, programmer une relance) :
- Active uniquement les booléens correspondant à l'instruction ("hasSale", "hasAppointment", "hasExpense", "hasStockMovement", "hasClient", "hasRelance").
- Si l'instruction concerne une dépense alors que l'utilisatrice n'y est pas autorisée (!canManageExpenses), refuse avec bienveillance et diplomatie.
- Si TOUTES les informations essentielles sont déjà présentes dans la phrase (ex: "Prends RDV pour Tantie Awa demain à 14h pour un Soin Éclat avec Aminata" contient déjà la cliente, le jour, l'heure, le soin et la praticienne ; ou "Mme Bintou a fait un soin à 20 000 F payé par Wave" contient déjà le montant et le mode de paiement ; ou "J'ai pris 3 500 F dans la caisse pour de l'eau" contient déjà le montant et le motif), mets IMPÉRATIVEMENT "needsClarification": false et confirme que tout est prêt à être validé !
- Ne mets "needsClarification": true QUE s'il manque réellement une information indispensable pour exécuter l'ordre (ex: "Prends RDV pour Awa" sans aucun jour ni heure, ou "Enregistre la vente de Mme Koné" sans moyen de paiement Wave/Orange/Espèces, ou "Note une dépense" sans montant). Dans ce cas, pose une question courte et précise dans "clarificationQuestion" et propose 2 à 4 "clarificationOptions" cliquables.

═══ RÈGLES D'ADRESSE & MÉTIER ═══
1. Appelle toujours ton ${isMale ? "interlocuteur" : "interlocutrice"} "${bossCall}". Accords grammaticaux au ${isMale ? "masculin" : "féminin"}. N'utilise JAMAIS le mot "Maman".
2. Devises en FCFA ("15 mille" = 15000). Modes de paiement : "wave", "orange", "cash", "card".
3. Si une cliente paie une partie et laisse un reste à payer (ex: "total 25 000 F, elle a versé 20 000 F et soldera 5 000 F"), renseigne subtotal=25000, total=25000, paidAmount=20000, remainingDebt=5000.

═══ DONNÉES EN TEMPS RÉEL DE L'INSTITUT "${tenantName}" AUJOURD'HUI ═══
- FORMULE D'ABONNEMENT ACTIVE : "${tenantPlan}"
${caisseRule}${expenseRule}
- RENDEZ-VOUS DU JOUR (${liveStats.appointmentsToday.length}) : ${JSON.stringify(liveStats.appointmentsToday)}
- PROCHAINS RENDEZ-VOUS À VENIR : ${JSON.stringify(liveStats.upcomingAppointments)}
- ALERTES STOCK BAS (${liveStats.lowStockProducts.length}) : ${JSON.stringify(liveStats.lowStockProducts)}
- CATALOGUE PRESTATIONS (SOINS) : ${JSON.stringify(services)}
- CATALOGUE PRODUITS & STOCKS : ${JSON.stringify(products)}
- ÉQUIPE DU SALON : ${JSON.stringify(employees)}
- CLIENTES CONNUES (CRM) : ${JSON.stringify(clients)}

Réponds UNIQUEMENT par un objet JSON valide respectant ce schéma exact (sans balise markdown) :
{
  "summary": "Résumé court et précis de la réponse ou de l'action",
  "vocalSummary": "Réponse orale directe, fluide, naturelle et chaleureuse adressée à ${bossCall}",
  "needsClarification": boolean,
  "clarificationQuestion": "Question précise si une info indispensable manque",
  "clarificationOptions": [{ "label": "Libellé court bouton", "value": "Phrase complète de réponse" }],
  "initiatives": [{ "type": "stock_reorder"|"whatsapp_followup"|"debt_reminder"|"loyalty", "title": "Titre", "desc": "Description" }],
  "hasSale": boolean,
  "sale": {
    "items": [{ "kind": "service"|"product", "id": "string", "label": "string", "qty": number, "unitPrice": number, "total": number }],
    "subtotal": number,
    "total": number,
    "paidAmount": number,
    "remainingDebt": number,
    "paymentMethod": "wave"|"orange"|"cash"|"card",
    "discount": number,
    "tipAmount": number
  },
  "hasStockMovement": boolean,
  "stock": {
    "decrements": [{ "productId": "string", "productName": "string", "qty": number, "currentStock": number, "newStock": number, "isLowStock": boolean }]
  },
  "hasClient": boolean,
  "client": {
    "name": "string",
    "phone": "string",
    "skinNotes": "string",
    "debtAmount": number,
    "isExisting": boolean,
    "clientProfileId": "string"
  },
  "hasAppointment": boolean,
  "appointment": {
    "serviceName": "string",
    "serviceId": "string",
    "practitionerName": "string",
    "dateStr": "string",
    "timeStr": "string",
    "notes": "string"
  },
  "hasTeamCredit": boolean,
  "team": {
    "employeeName": "string",
    "employeeId": "string",
    "commissionAmount": number,
    "tipAmount": number
  },
  "hasExpense": boolean,
  "expense": {
    "amount": number,
    "description": "string",
    "category": "fournitures"|"energie"|"transport"|"autre"
  },
  "hasRelance": boolean,
  "relance": {
    "delayDays": number,
    "message": "string"
  }
}`;
}

// ─────────────── Palier 1 : Google Gemini REST (avec cascade) ───────────────

function getCandidateModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const models = [
    preferred && preferred.startsWith("gemini-") ? preferred : null,
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
  ].filter(Boolean) as string[];
  return Array.from(new Set(models));
}

function parseDebriefJson(raw: string): DebriefResult | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as DebriefResult;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as DebriefResult;
    }
    return null;
  }
}

async function callGeminiDebrief(systemPrompt: string, userMessage: string): Promise<DebriefResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const models = getCandidateModels();

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2000,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(DEBRIEF_TIMEOUT_MS),
        },
      );

      if (!res.ok) {
        console.warn(`[assistant:debrief:gemini] HTTP ${res.status} sur ${model}: ${await res.text().catch(() => "")}`);
        continue;
      }

      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const parsed = parseDebriefJson(raw);
        if (parsed && parsed.vocalSummary) return parsed;
      }
    } catch (err) {
      console.warn(`[assistant:debrief:gemini] Échec sur ${model}:`, (err as Error).message);
    }
  }

  return null;
}

// ─────────────── Palier 2 : Z.ai SDK ───────────────

async function callZaiDebrief(systemPrompt: string, userMessage: string): Promise<DebriefResult | null> {
  const zai = await ZAI.create();
  const completion = await zaiCall(
    () =>
      zai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        thinking: { type: "disabled" },
      }),
    { label: "assistant:debrief", timeoutMs: DEBRIEF_TIMEOUT_MS, busyRetries: 1 },
  );

  const raw = completion.choices[0]?.message?.content ?? "";
  return parseDebriefJson(raw);
}

// ─────────────── Palier 3 : Moteur NLU Expert Kènè (Compréhension Totale) ───────────────

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const STOP_WORDS_AFTER_NAME = new Set([
  "demain",
  "aujourd",
  "aujourdhui",
  "hier",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
  "a",
  "au",
  "aux",
  "pour",
  "avec",
  "fait",
  "pris",
  "paye",
  "verse",
  "soldera",
  "doit",
  "veut",
  "vient",
  "sur",
  "dans",
  "en",
  "par",
  "de",
  "du",
  "des",
  "et",
  "ou",
  "qui",
  "elle",
  "il",
  "ce",
  "cet",
  "cette",
  "le",
  "la",
  "les",
  "un",
  "une",
  "son",
  "sa",
  "ses",
]);

function extractClientNameFromText(
  text: string,
  clients: Array<{ id: string; name: string; phone?: string | null }>,
): { name: string; clientProfileId?: string; isExisting: boolean; foundExplicitly: boolean } {
  const normText = normalizeStr(text);

  // 1. Recherche dans les clientes existantes du CRM
  for (const c of clients) {
    const normName = normalizeStr(c.name.trim());
    if (normName.length >= 3 && normText.includes(normName)) {
      return { name: c.name, clientProfileId: c.id, isExisting: true, foundExplicitly: true };
    }
    const firstPart = normName.split(/\s+/)[0];
    if (firstPart && firstPart.length >= 4 && new RegExp(`\\b${firstPart}\\b`, "i").test(normText)) {
      return { name: c.name, clientProfileId: c.id, isExisting: true, foundExplicitly: true };
    }
  }

  // 2. Titre explicite : Tantie Awa, Mme Bintou, Madame Koné, Mlle Fatou...
  const titleRegex = /\b(tantie|mme|madame|mlle|mademoiselle|soeur)\s+([A-ZÀ-Ÿa-zà-ÿ]{2,})(?:\s+([A-ZÀ-Ÿa-zà-ÿ]{2,}))?/i;
  const titleMatch = text.match(titleRegex);
  if (titleMatch) {
    const title = titleMatch[1].charAt(0).toUpperCase() + titleMatch[1].slice(1).toLowerCase();
    const first = titleMatch[2].charAt(0).toUpperCase() + titleMatch[2].slice(1).toLowerCase();
    const secondRaw = titleMatch[3];
    const secondNorm = secondRaw ? normalizeStr(secondRaw) : "";
    const keepSecond =
      secondRaw &&
      !STOP_WORDS_AFTER_NAME.has(secondNorm) &&
      !/^\d/.test(secondRaw);
    const fullName = keepSecond
      ? `${title} ${first} ${secondRaw.charAt(0).toUpperCase() + secondRaw.slice(1).toLowerCase()}`
      : `${title} ${first}`;
    return { name: fullName, isExisting: false, foundExplicitly: true };
  }

  // 3. Pattern "pour [Prénom]" ou "cliente [Prénom]" ou "inscrire [Prénom]"
  const afterKeywordRegex =
    /\b(?:rdv\s+pour|rendez-vous\s+pour|inscrire|inscris|pour\s+la\s+cliente|cliente|pour)\s+([A-ZÀ-Ÿa-zà-ÿ]{3,})(?:\s+([A-ZÀ-Ÿa-zà-ÿ]{2,}))?/i;
  const afterMatch = text.match(afterKeywordRegex);
  if (afterMatch) {
    const w1 = afterMatch[1];
    const w1Norm = normalizeStr(w1);
    if (
      !STOP_WORDS_AFTER_NAME.has(w1Norm) &&
      !["soin", "un", "une", "mon", "ma", "mes", "nos", "les", "des", "acheter", "faire", "voir", "controler", "renouveler"].includes(w1Norm)
    ) {
      const first = w1.charAt(0).toUpperCase() + w1.slice(1).toLowerCase();
      const w2 = afterMatch[2];
      const w2Norm = w2 ? normalizeStr(w2) : "";
      const keepW2 = w2 && !STOP_WORDS_AFTER_NAME.has(w2Norm) && !/^\d/.test(w2);
      const fullName = keepW2
        ? `${first} ${w2.charAt(0).toUpperCase() + w2.slice(1).toLowerCase()}`
        : first;
      return { name: fullName, isExisting: false, foundExplicitly: true };
    }
  }

  return { name: "Cliente", isExisting: false, foundExplicitly: false };
}

function findBestService(
  text: string,
  services: Array<{ id: string; name: string; price: number }>,
): { id: string; name: string; price: number } | undefined {
  const normText = normalizeStr(text);
  // Correspondance exacte d'abord
  const exact = services.find((s) => normText.includes(normalizeStr(s.name)));
  if (exact) return exact;

  // Correspondance par mots-clés significatifs
  let best: { id: string; name: string; price: number } | undefined;
  let bestScore = 0;

  for (const s of services) {
    const words = normalizeStr(s.name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);
    let score = 0;
    for (const w of words) {
      if (normText.includes(w)) {
        score += w === "soin" ? 1 : 2;
      }
    }
    if (score > bestScore && score >= 2) {
      bestScore = score;
      best = s;
    }
  }

  // Si l'utilisateur a dit "soin visage" ou "soin éclat" et qu'un soin contient "visage" ou "eclat"
  if (!best && normText.includes("soin")) {
    best =
      services.find((s) => normalizeStr(s.name).includes("visage") && normText.includes("visage")) ||
      services.find((s) => normalizeStr(s.name).includes("eclat") && normText.includes("eclat")) ||
      services.find((s) => normalizeStr(s.name).includes("gommage") && normText.includes("gommage")) ||
      services[0];
  }

  return best;
}

function findBestProduct(
  text: string,
  products: Array<{ id: string; name: string; price: number; stock: number }>,
): { id: string; name: string; price: number; stock: number } | undefined {
  const normText = normalizeStr(text);
  const exact = products.find((p) => normText.includes(normalizeStr(p.name)));
  if (exact) return exact;

  let best: { id: string; name: string; price: number; stock: number } | undefined;
  let bestScore = 0;

  for (const p of products) {
    const words = normalizeStr(p.name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);
    let score = 0;
    for (const w of words) {
      if (normText.includes(w)) {
        score += 2;
      }
    }
    if (score > bestScore && score >= 2) {
      bestScore = score;
      best = p;
    }
  }

  return best;
}

function extractDateTimeFromText(text: string): {
  hasExplicitDate: boolean;
  hasExplicitTime: boolean;
  dateStr: string;
  dateLabel: string;
  timeStr: string;
} {
  const norm = normalizeStr(text);
  const now = new Date();
  const targetDate = new Date(now);
  let hasExplicitDate = false;
  let dateLabel = "demain";

  if (norm.includes("apres-demain") || norm.includes("apres demain")) {
    targetDate.setDate(now.getDate() + 2);
    hasExplicitDate = true;
    dateLabel = "après-demain";
  } else if (norm.includes("demain")) {
    targetDate.setDate(now.getDate() + 1);
    hasExplicitDate = true;
    dateLabel = "demain";
  } else if (
    norm.includes("aujourd'hui") ||
    norm.includes("aujourdhui") ||
    norm.includes("ce soir") ||
    norm.includes("cet apres-midi")
  ) {
    hasExplicitDate = true;
    dateLabel = "aujourd'hui";
  } else {
    const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    for (let i = 0; i < weekdays.length; i++) {
      if (new RegExp(`\\b${weekdays[i]}\\b`).test(norm)) {
        const currentDay = now.getDay();
        let diff = (i - currentDay + 7) % 7;
        if (diff === 0) diff = 7;
        targetDate.setDate(now.getDate() + diff);
        hasExplicitDate = true;
        dateLabel = weekdays[i];
        break;
      }
    }
  }

  if (!hasExplicitDate) {
    targetDate.setDate(now.getDate() + 1);
  }

  // Heure : ex "14h", "14h30", "14:00", "à 10 heures"
  let hasExplicitTime = false;
  let timeStr = "14:00";
  const timeMatch = norm.match(/\b([01]?\d|2[0-3])\s*(?:h|heures?|:)\s*([0-5]\d)?\b/);
  if (timeMatch) {
    const hh = parseInt(timeMatch[1], 10);
    const mm = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (hh >= 6 && hh <= 22) {
      hasExplicitTime = true;
      timeStr = `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
      targetDate.setHours(hh, mm, 0, 0);
    }
  } else if (norm.includes("midi")) {
    hasExplicitTime = true;
    timeStr = "12:00";
    targetDate.setHours(12, 0, 0, 0);
  }

  return {
    hasExplicitDate,
    hasExplicitTime,
    dateStr: targetDate.toISOString(),
    dateLabel,
    timeStr,
  };
}

function extractAllAmounts(text: string): number[] {
  const results: number[] = [];
  const regex = /(\d[\d\s.,]*)\s*(mille\s*(?:f|cfa|fcfa|francs)?|f\b|cfa\b|fcfa\b|francs?\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const clean = m[1].replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
    const unit = m[2].toLowerCase();
    let val = parseFloat(clean) || 0;
    if (unit.startsWith("mille")) {
      val *= 1000;
    }
    if (val >= 100) {
      results.push(Math.round(val));
    }
  }
  return results;
}

function noActionBase(summary: string, vocalSummary: string): DebriefResult {
  return {
    summary,
    vocalSummary,
    needsClarification: false,
    hasSale: false,
    hasStockMovement: false,
    hasClient: false,
    hasAppointment: false,
    hasTeamCredit: false,
    hasExpense: false,
    hasRelance: false,
  };
}

function fallbackParser(
  text: string,
  tenant: {
    name: string;
    services: Array<{ id: string; name: string; price: number }>;
    products: Array<{ id: string; name: string; price: number; stock: number; stockAlert?: number }>;
    employees: Array<{ id: string; name: string; role?: string }>;
  },
  clients: Array<{ id: string; name: string; phone?: string | null; skinType?: string | null; notes?: string | null; totalSpent?: number; visitsCount?: number }>,
  liveStats: LiveSalonStats,
  managerName: string,
  previousDebrief?: any,
  isOwner = true,
  userRole = "",
  canViewCaisse = true,
  canViewStock = true,
  canManageExpenses = true,
): DebriefResult {
  const lower = text.toLowerCase().trim();
  const norm = normalizeStr(text);
  const bossCall = getBossCall(managerName, isOwner, userRole);

  // ═══ 0. GESTION DES RÉPONSES DE CLARIFICATION EN COURS (previousDebrief) ═══
  if (previousDebrief && previousDebrief.needsClarification) {
    // 0a. Clarification d'un RDV
    if (previousDebrief.hasAppointment) {
      const dt = extractDateTimeFromText(text);
      const matchedService = findBestService(text, tenant.services);
      const serviceName = matchedService?.name || previousDebrief.appointment?.serviceName || "Soin en cabine";
      const clientName = previousDebrief.client?.name || "la cliente";
      const finalTime = dt.hasExplicitTime ? dt.timeStr : previousDebrief.appointment?.timeStr || "14:00";
      const finalDateStr = dt.hasExplicitDate ? dt.dateStr : previousDebrief.appointment?.dateStr || new Date(Date.now() + 86400000).toISOString();

      return {
        ...previousDebrief,
        summary: `RDV planifié : ${clientName} (${dt.dateLabel} à ${finalTime})`,
        vocalSummary: `À vos ordres ${bossCall} ! J'ai bien inscrit ${clientName} pour son ${serviceName} ${dt.dateLabel} à ${finalTime}. Vous pouvez valider pour l'enregistrer dans l'agenda.`,
        needsClarification: false,
        clarificationQuestion: undefined,
        clarificationOptions: undefined,
        appointment: {
          ...previousDebrief.appointment,
          serviceName,
          serviceId: matchedService?.id || previousDebrief.appointment?.serviceId,
          dateStr: finalDateStr,
          timeStr: finalTime,
        },
      };
    }

    // 0b. Clarification d'une dépense de petite caisse
    if (previousDebrief.hasExpense) {
      if (!canManageExpenses) {
        return noActionBase(
          "Dépense réservée à la gérance",
          `Pardonnez-moi ${bossCall}, mais l'enregistrement des dépenses de caisse est restreint et réservé à la direction de l'institut.`,
        );
      }
      const amounts = extractAllAmounts(text);
      const amt = amounts[0] || previousDebrief.expense?.amount || 2500;
      return {
        ...previousDebrief,
        summary: `Sortie de petite caisse : ${amt.toLocaleString("fr-FR")} FCFA`,
        vocalSummary: `C'est parfait ${bossCall} ! J'ai noté la dépense de ${amt.toLocaleString("fr-FR")} francs CFA. Il ne vous reste plus qu'à valider pour mettre à jour la caisse.`,
        needsClarification: false,
        clarificationQuestion: undefined,
        clarificationOptions: undefined,
        expense: {
          ...previousDebrief.expense,
          amount: amt,
          description: previousDebrief.expense?.description || text.slice(0, 100),
        },
      };
    }

    // 0c. Clarification d'une vente (mode de paiement)
    if (previousDebrief.hasSale) {
      let method: "wave" | "orange" | "cash" | "card" = previousDebrief.sale?.paymentMethod || "cash";
      let methodLabel = "Espèces";
      if (norm.includes("wave")) {
        method = "wave";
        methodLabel = "Wave";
      } else if (norm.includes("orange") || norm.includes("om")) {
        method = "orange";
        methodLabel = "Orange Money";
      } else if (norm.includes("carte") || norm.includes("cb")) {
        method = "card";
        methodLabel = "Carte bancaire";
      }

      return {
        ...previousDebrief,
        needsClarification: false,
        clarificationQuestion: undefined,
        clarificationOptions: undefined,
        vocalSummary: `Parfait ${bossCall} ! J'ai bien enregistré le règlement par ${methodLabel}. Tout est prêt à être scellé dans la caisse.`,
        sale: {
          ...previousDebrief.sale,
          paymentMethod: method,
        },
      };
    }

    // 0d. Clarification d'une relance
    if (previousDebrief.hasRelance) {
      return {
        ...previousDebrief,
        needsClarification: false,
        clarificationQuestion: undefined,
        clarificationOptions: undefined,
        summary: `Campagne de relances prête (${text.slice(0, 50)})`,
        vocalSummary: `Très bien ${bossCall} ! J'ai préparé la liste et le message de relance correspondant à votre consigne. Vous pouvez sceller l'action.`,
        relance: {
          delayDays: 1,
          message: `Bonjour chère cliente, toute l'équipe de ${tenant.name} espère que vous allez bien ! Souhaitez-vous réserver votre prochain créneau beauté cette semaine ?`,
        },
      };
    }
  }

  // ═══ 1. DÉTECTION DES QUESTIONS & CONSULTATIONS D'INFORMATIONS (ZÉRO FAUSSE VENTE) ═══

  const amounts = extractAllAmounts(text);
  const detectedAmount = amounts[0] || 0;

  // Est-ce une commande explicite d'action ?
  const isBookingCommand =
    /\b(prends|prendre|ajoute|ajouter|bloque|bloquer|inscris|inscrire|planifie|planifier|programme|programmer|note|noter|fixe|fixer|mets|mettre)\b/.test(norm) &&
    /\b(rdv|rendez-vous|creneau|cabine|cliente)\b/.test(norm);

  const isExpenseCommand =
    norm.includes("pris dans la caisse") ||
    norm.includes("sortie de caisse") ||
    norm.includes("petite caisse") ||
    ((/\b(depense|depenses|achete|acheter|paye|payer|facture)\b/.test(norm)) &&
      /\b(eau|courant|electricite|cie|sodeci|fourniture|coton|savon|transport|taxi|livreur|course|credit|menage)\b/.test(norm));

  const isSaleTransaction =
    !isExpenseCommand &&
    !isBookingCommand &&
    (detectedAmount > 0 ||
      /\b(a fait|a pris|a paye|a regle|a verse|encaisse|encaisser|encaissement|vendu|vendre|vente de)\b/.test(norm));

  // 1A. Questions sur la CAISSE / CHIFFRE D'AFFAIRES / RECETTES / VENTES DU JOUR
  if (
    !isSaleTransaction &&
    !isExpenseCommand &&
    (/\b(caisse|chiffre d'affaires|recette|recettes|combien.*gagne|combien.*encaisse|combien.*fait|bilan|point de la caisse|etat de la caisse|ventes du jour)\b/.test(norm) ||
      (norm.includes("combien") && (norm.includes("aujourd") || norm.includes("vente") || norm.includes("wave") || norm.includes("orange"))))
  ) {
    if (!canViewCaisse) {
      return noActionBase(
        "Données financières confidentielles",
        `Pardonnez-moi ${bossCall}, mais le point de caisse et les chiffres financiers du salon sont confidentiels et réservés à la direction de l'institut. Je peux en revanche vous renseigner sur vos rendez-vous et vos soins cabine du jour !`,
      );
    }

    const details: string[] = [];
    if (liveStats.waveTotal > 0) details.push(`${liveStats.waveTotal.toLocaleString("fr-FR")} F sur Wave`);
    if (liveStats.orangeTotal > 0) details.push(`${liveStats.orangeTotal.toLocaleString("fr-FR")} F sur Orange Money`);
    if (liveStats.cashTotal > 0) details.push(`${liveStats.cashTotal.toLocaleString("fr-FR")} F en espèces`);
    if (liveStats.cardTotal > 0) details.push(`${liveStats.cardTotal.toLocaleString("fr-FR")} F par carte`);

    const vocal =
      liveStats.todayTotal > 0
        ? `${bossCall}, la caisse d'aujourd'hui s'élève à ${liveStats.todayTotal.toLocaleString("fr-FR")} francs CFA pour ${liveStats.salesCount} encaissement${liveStats.salesCount > 1 ? "s" : ""}${details.length > 0 ? ` (${details.join(", ")})` : ""}. Souhaitez-vous enregistrer une nouvelle opération ?`
        : `${bossCall}, aucun encaissement n'a encore été enregistré dans la caisse aujourd'hui. Dès que vous réalisez un soin ou une vente, dictez-le-moi et je l'enregistrerai aussitôt !`;

    return {
      ...noActionBase(`Point Caisse du jour : ${liveStats.todayTotal.toLocaleString("fr-FR")} FCFA`, vocal),
      initiatives: [
        {
          type: "loyalty",
          title: "Détail complet en Caisse",
          desc: `Vous avez ${liveStats.salesCount} vente(s) validée(s) aujourd'hui.`,
        },
      ],
    };
  }

  // 1B. Questions sur l'AGENDA / les RENDEZ-VOUS / le PLANNING (sans être une commande d'ajout)
  if (
    !isBookingCommand &&
    !isSaleTransaction &&
    /\b(rdv|rendez-vous|agenda|planning|programme|qui vient|combien de rdv|prochain rdv|prochains rdv)\b/.test(norm)
  ) {
    if (liveStats.appointmentsToday.length > 0) {
      const listStr = liveStats.appointmentsToday
        .slice(0, 4)
        .map((a) => `${a.clientName} à ${a.time} pour ${a.serviceName}`)
        .join(", ");
      const vocal = `${bossCall}, vous avez ${liveStats.appointmentsToday.length} rendez-vous prévu${liveStats.appointmentsToday.length > 1 ? "s" : ""} aujourd'hui : ${listStr}. Voulez-vous que je planifie un nouveau créneau ?`;
      return noActionBase(`${liveStats.appointmentsToday.length} RDV aujourd'hui à l'agenda`, vocal);
    } else if (liveStats.upcomingAppointments.length > 0) {
      const nextStr = liveStats.upcomingAppointments
        .slice(0, 3)
        .map((a) => `${a.clientName} (${a.dateLabel} à ${a.time} — ${a.serviceName})`)
        .join(", ");
      const vocal = `${bossCall}, vous n'avez plus de rendez-vous pour le reste de la journée, mais voici vos prochains rendez-vous à venir : ${nextStr}.`;
      return noActionBase(`Prochains RDV (${liveStats.upcomingAppointments.length} à venir)`, vocal);
    } else {
      return noActionBase(
        "Agenda libre aujourd'hui",
        `${bossCall}, votre agenda est entièrement libre pour aujourd'hui. Dites-moi par exemple « Prends RDV pour Awa demain à 14h » si vous souhaitez inscrire une cliente !`,
      );
    }
  }

  // 1C. Questions sur les STOCKS / PRODUITS / PRIX / TARIFS / PRESTATIONS
  if (
    !isSaleTransaction &&
    /\b(stock|stocks|rupture|combien il reste|reste combien|prix|tarif|tarifs|coute|combien coute|catalogue|nos soins|nos prestations|nos produits|disponible)\b/.test(norm)
  ) {
    const specificProduct = findBestProduct(text, tenant.products);
    const specificService = findBestService(text, tenant.services);

    if (specificProduct) {
      const vocal = `${bossCall}, pour le produit « ${specificProduct.name} », son prix est de ${specificProduct.price.toLocaleString("fr-FR")} francs CFA et il nous reste actuellement ${specificProduct.stock} unité${specificProduct.stock > 1 ? "s" : ""} en stock${specificProduct.stock <= 5 ? " (attention, le stock est bas)" : ""}.`;
      return noActionBase(`${specificProduct.name} : ${specificProduct.stock} en stock (${specificProduct.price.toLocaleString("fr-FR")} F)`, vocal);
    }

    if (specificService && (norm.includes("prix") || norm.includes("tarif") || norm.includes("coute") || norm.includes("soin"))) {
      const vocal = `${bossCall}, la prestation « ${specificService.name} » est au tarif de ${specificService.price.toLocaleString("fr-FR")} francs CFA.`;
      return noActionBase(`${specificService.name} : ${specificService.price.toLocaleString("fr-FR")} FCFA`, vocal);
    }

    if (norm.includes("prix") || norm.includes("tarif") || norm.includes("prestation") || norm.includes("catalogue")) {
      const sampleServices = tenant.services
        .slice(0, 4)
        .map((s) => `${s.name} à ${s.price.toLocaleString("fr-FR")} F`)
        .join(", ");
      const vocal = `${bossCall}, voici nos principales prestations : ${sampleServices || "aucune prestation configurée"}. Sur quel soin ou produit souhaitez-vous un détail ?`;
      return noActionBase("Tarifs des prestations de l'institut", vocal);
    }

    // État général des stocks
    const totalProducts = tenant.products.length;
    if (liveStats.lowStockProducts.length > 0) {
      const lowList = liveStats.lowStockProducts
        .slice(0, 4)
        .map((p) => `${p.name} (${p.stock} restant${p.stock > 1 ? "s" : ""})`)
        .join(", ");
      const vocal = `${bossCall}, nous suivons ${totalProducts} références en boutique et cabine. Attention, ${liveStats.lowStockProducts.length} produit${liveStats.lowStockProducts.length > 1 ? "s sont" : " est"} en alerte de stock bas : ${lowList}. Souhaitez-vous préparer un réassort ?`;
      return {
        ...noActionBase(`État du stock : ${liveStats.lowStockProducts.length} alerte(s)`, vocal),
        initiatives: [
          {
            type: "stock_reorder",
            title: "Réassort prioritaire conseillé",
            desc: `Produits à commander : ${lowList}`,
          },
        ],
      };
    }

    const sampleProd = tenant.products
      .slice(0, 3)
      .map((p) => `${p.name} (${p.stock} en stock)`)
      .join(", ");
    return noActionBase(
      `Stocks au complet (${totalProducts} références)`,
      `${bossCall}, tous vos stocks sont à un bon niveau aujourd'hui (${totalProducts} produits actifs, dont ${sampleProd}). Aucune rupture n'est à signaler !`,
    );
  }

  // 1D. Questions sur l'ÉQUIPE / EMPLOYÉES
  if (
    !isSaleTransaction &&
    !isBookingCommand &&
    /\b(equipe|employee|employees|estheticienne|praticienne|qui travaille|personnel|salarie)\b/.test(norm)
  ) {
    if (tenant.employees.length > 0) {
      const listEmp = tenant.employees.map((e) => `${e.name} (${e.role || "Praticienne"})`).join(", ");
      return noActionBase(
        `Équipe de l'institut (${tenant.employees.length} membre(s))`,
        `${bossCall}, votre équipe compte ${tenant.employees.length} collaboratrice${tenant.employees.length > 1 ? "s" : ""} : ${listEmp}.`,
      );
    }
    return noActionBase("Équipe du salon", `${bossCall}, aucun membre d'équipe supplémentaire n'est encore enregistré dans l'onglet Équipe & Paie.`);
  }

  // 1E. Questions sur les CLIENTES / CRM / ARDOISES
  if (
    !isSaleTransaction &&
    !isBookingCommand &&
    /\b(clientes|fiche cliente|combien de cliente|qui me doit|ardoise|credit client|numero de|parle-moi de)\b/.test(norm)
  ) {
    const extracted = extractClientNameFromText(text, clients);
    if (extracted.isExisting && extracted.clientProfileId) {
      const c = clients.find((cl) => cl.id === extracted.clientProfileId);
      if (c) {
        const vocal = `${bossCall}, voici la fiche de ${c.name} : numéro ${c.phone || "non renseigné"}, ${c.visitsCount || 1} visite(s) au salon pour un total de ${(c.totalSpent || 0).toLocaleString("fr-FR")} francs CFA${c.skinType ? `, peau ${c.skinType}` : ""}${c.notes ? `. Note dossier : ${c.notes}` : "."}`;
        return noActionBase(`Fiche CRM : ${c.name}`, vocal);
      }
    }
    const sampleClients = clients.slice(0, 4).map((c) => c.name).join(", ");
    return noActionBase(
      `Base CRM : ${clients.length} cliente(s) récente(s)`,
      `${bossCall}, votre fichier CRM compte ${clients.length} clientes enregistrées récemment${sampleClients ? `, notamment ${sampleClients}` : ""}. Demandez-moi le nom d'une cliente pour consulter son dossier ou dictez un soin pour mettre sa fiche à jour !`,
    );
  }

  // ═══ 2. EXÉCUTION DES INSTRUCTIONS OPÉRATIONNELLES MÉTIER ═══

  // 2A. Instruction de PRISE DE RENDEZ-VOUS ("Prends RDV pour Tantie Awa demain à 14h...")
  if (isBookingCommand) {
    const clientInfo = extractClientNameFromText(text, clients);
    const clientName = clientInfo.foundExplicitly ? clientInfo.name : "la cliente";
    const matchedService = findBestService(text, tenant.services);
    const matchedEmployee = tenant.employees.find((e) => norm.includes(normalizeStr(e.name)));
    const dt = extractDateTimeFromText(text);

    const hasDateOrTime = dt.hasExplicitDate || dt.hasExplicitTime;
    const serviceLabel = matchedService ? matchedService.name : "Soin Visage & Beauté";
    const practitionerLabel = matchedEmployee ? matchedEmployee.name : tenant.employees[0]?.name || "Équipe";

    // Si la date ou l'heure est DÉJÀ donnée dans la consigne (ex: "demain à 14h"), pas de question inutile !
    if (hasDateOrTime && clientInfo.foundExplicitly) {
      return {
        summary: `RDV prêt : ${clientName} · ${serviceLabel} (${dt.dateLabel} à ${dt.timeStr})`,
        vocalSummary: `À vos ordres ${bossCall} ! J'ai préparé le rendez-vous de ${clientName} pour demain ou le créneau demandé (${dt.dateLabel} à ${dt.timeStr}) pour un ${serviceLabel}${matchedEmployee ? ` avec ${matchedEmployee.name}` : ""}. Cliquez sur Valider pour l'inscrire dans l'agenda !`,
        needsClarification: false,
        initiatives: [
          {
            type: "whatsapp_followup",
            title: "Confirmation WhatsApp prête",
            desc: `Un rappel automatique sera programmé pour ${clientName}.`,
          },
        ],
        hasSale: false,
        hasStockMovement: false,
        hasClient: true,
        client: {
          name: clientName,
          isExisting: clientInfo.isExisting,
          clientProfileId: clientInfo.clientProfileId,
        },
        hasAppointment: true,
        appointment: {
          serviceName: serviceLabel,
          serviceId: matchedService?.id,
          practitionerName: practitionerLabel,
          dateStr: dt.dateStr,
          timeStr: dt.timeStr,
          notes: `RDV pris par la Secrétaire IA pour ${clientName}`,
        },
        hasTeamCredit: false,
        hasExpense: false,
        hasRelance: true,
        relance: {
          delayDays: 1,
          message: `Bonjour ${clientName}, votre rendez-vous pour « ${serviceLabel} » chez ${tenant.name} est bien confirmé pour ${dt.dateLabel} à ${dt.timeStr}. À très bientôt !`,
        },
      };
    }

    // Sinon, il manque le jour ou l'heure : on demande poliment la précision
    return {
      summary: `Prise de RDV pour ${clientName} (horaire à préciser)`,
      vocalSummary: `À vos ordres ${bossCall} ! Pour quel jour et à quelle heure souhaitez-vous inscrire ${clientName}${matchedService ? ` pour son ${matchedService.name}` : ""} dans l'agenda ?`,
      needsClarification: true,
      clarificationQuestion: `Pour quel jour et quelle heure dois-je planifier le rendez-vous de ${clientName}, ${bossCall} ?`,
      clarificationOptions: [
        { label: "📅 Aujourd'hui 15h", value: `Inscrire ${clientName} aujourd'hui à 15h00 pour ${serviceLabel}` },
        { label: "📅 Demain 10h", value: `Inscrire ${clientName} demain à 10h00 pour ${serviceLabel}` },
        { label: "📅 Demain 14h", value: `Inscrire ${clientName} demain à 14h00 pour ${serviceLabel}` },
        { label: "📅 Samedi 11h", value: `Inscrire ${clientName} samedi à 11h00 pour ${serviceLabel}` },
      ],
      hasSale: false,
      hasStockMovement: false,
      hasClient: true,
      client: {
        name: clientName,
        isExisting: clientInfo.isExisting,
        clientProfileId: clientInfo.clientProfileId,
      },
      hasAppointment: true,
      appointment: {
        serviceName: serviceLabel,
        serviceId: matchedService?.id,
        practitionerName: practitionerLabel,
        dateStr: dt.dateStr,
        timeStr: dt.timeStr,
        notes: `Prise de rendez-vous pour ${clientName}`,
      },
      hasTeamCredit: false,
      hasExpense: false,
      hasRelance: false,
    };
  }

  // 2B. Instruction de RELANCE CLIENTES ("Relance les clientes du mois dernier...")
  if (norm.includes("relance") || norm.includes("relancer") || norm.includes("rappelle les clientes")) {
    const hasSpecificTarget =
      norm.includes("mois dernier") ||
      norm.includes("j+30") ||
      norm.includes("soin") ||
      norm.includes("demain") ||
      norm.includes("ardoise") ||
      norm.includes("credit");

    if (hasSpecificTarget) {
      return {
        summary: `Campagne de relances clientes programmée`,
        vocalSummary: `C'est noté ${bossCall} ! J'ai préparé la relance pour vos clientes concernant leur suivi dermo-botanique. Vous pouvez valider pour l'enregistrer dans l'onglet Relances !`,
        needsClarification: false,
        initiatives: [
          {
            type: "loyalty",
            title: "Suivi fidélité J+30",
            desc: "Proposer un bilan d'évolution cutanée offert lors du prochain rendez-vous.",
          },
        ],
        hasSale: false,
        hasStockMovement: false,
        hasClient: false,
        hasAppointment: false,
        hasTeamCredit: false,
        hasExpense: false,
        hasRelance: true,
        relance: {
          delayDays: 1,
          message: `Bonjour chère cliente, cela fait un mois que nous avons réalisé votre protocole chez ${tenant.name}. Comment se porte votre peau ? Répondez à ce message pour réserver votre soin de contrôle !`,
        },
      };
    }

    return {
      summary: `Initiative de relances clientes pour ${bossCall}`,
      vocalSummary: `Excellente initiative ${bossCall} ! Quelles clientes souhaitez-vous que je relance en priorité aujourd'hui ?`,
      needsClarification: true,
      clarificationQuestion: `Quelles clientes souhaitez-vous relancer en priorité, ${bossCall} ?`,
      clarificationOptions: [
        { label: "💆 Clientes Soin (J+30)", value: "Relancer les clientes du mois dernier pour leur soin de contrôle" },
        { label: "📅 Rappels RDV Demain", value: "Envoyer les rappels WhatsApp pour les rendez-vous de demain" },
        { label: "💰 Rappels Ardoises", value: "Envoyer un rappel courtois pour les ardoises en attente" },
      ],
      hasSale: false,
      hasStockMovement: false,
      hasClient: false,
      hasAppointment: false,
      hasTeamCredit: false,
      hasExpense: false,
      hasRelance: true,
      relance: {
        delayDays: 1,
        message: `Bonjour chère cliente, toute l'équipe de ${tenant.name} est à votre disposition pour votre suivi beauté !`,
      },
    };
  }

  // 2C. Instruction de DÉPENSE DE PETITE CAISSE ("J'ai pris 3 500 F dans la caisse...")
  if (isExpenseCommand) {
    if (!canManageExpenses) {
      return noActionBase(
        "Sortie de caisse non autorisée",
        `Pardonnez-moi ${bossCall}, mais l'enregistrement de dépenses de caisse est restreint et réservé à la direction de l'institut. Je ne peux pas enregistrer cette sortie de caisse.`,
      );
    }

    if (detectedAmount === 0) {
      return {
        summary: `Sortie de caisse demandée par ${bossCall}`,
        vocalSummary: `Bien reçu ${bossCall} ! Quel est le montant exact de cette dépense prise dans la caisse ?`,
        needsClarification: true,
        clarificationQuestion: `Quel est le montant de cette dépense, ${bossCall} ?`,
        clarificationOptions: [
          { label: "💵 2 000 F · Espèces", value: `${text} — montant de 2 000 F en espèces` },
          { label: "💵 3 500 F · Espèces", value: `${text} — montant de 3 500 F en espèces` },
          { label: "💵 5 000 F · Espèces", value: `${text} — montant de 5 000 F en espèces` },
          { label: "🌊 10 000 F · Wave", value: `${text} — montant de 10 000 F par Wave` },
        ],
        hasSale: false,
        hasStockMovement: false,
        hasClient: false,
        hasAppointment: false,
        hasTeamCredit: false,
        hasExpense: true,
        expense: {
          amount: 0,
          description: text.slice(0, 120),
          category: "fournitures",
        },
        hasRelance: false,
      };
    }

    const category =
      norm.includes("courant") || norm.includes("electricite") || norm.includes("cie") || norm.includes("sodeci")
        ? "energie"
        : norm.includes("taxi") || norm.includes("transport") || norm.includes("livreur")
          ? "transport"
          : "fournitures";

    return {
      summary: `Sortie de petite caisse : ${detectedAmount.toLocaleString("fr-FR")} FCFA`,
      vocalSummary: `C'est bien noté, ${bossCall} ! J'ai préparé la sortie de caisse de ${detectedAmount.toLocaleString("fr-FR")} francs CFA pour « ${text.slice(0, 70)} ». Cliquez sur Valider pour l'inscrire en Caisse et en Comptabilité SYSCOHADA.`,
      needsClarification: false,
      hasSale: false,
      hasStockMovement: false,
      hasClient: false,
      hasAppointment: false,
      hasTeamCredit: false,
      hasExpense: true,
      expense: {
        amount: detectedAmount,
        description: text.slice(0, 120),
        category,
      },
      hasRelance: false,
    };
  }

  // 2D. Instruction de VENTE / PRESTATION / ENCAISSEMENT (uniquement si transaction avérée !)
  if (isSaleTransaction) {
    const clientInfo = extractClientNameFromText(text, clients);
    const clientName = clientInfo.foundExplicitly ? clientInfo.name : "Cliente de passage";

    const matchedService = findBestService(text, tenant.services);
    const matchedProduct = findBestProduct(text, tenant.products);

    let method: "wave" | "orange" | "cash" | "card" = "cash";
    let hasExplicitPayment = false;
    if (norm.includes("wave")) {
      method = "wave";
      hasExplicitPayment = true;
    } else if (norm.includes("orange") || norm.includes("om")) {
      method = "orange";
      hasExplicitPayment = true;
    } else if (norm.includes("carte") || norm.includes("cb")) {
      method = "card";
      hasExplicitPayment = true;
    } else if (norm.includes("espece") || norm.includes("cash") || norm.includes("liquide")) {
      method = "cash";
      hasExplicitPayment = true;
    }

    const items: Array<{ kind: "service" | "product"; id?: string; label: string; qty: number; unitPrice: number; total: number }> = [];
    let subtotal = 0;

    if (matchedService) {
      const sPrice = amounts[0] && !matchedProduct ? amounts[0] : matchedService.price;
      items.push({
        kind: "service",
        id: matchedService.id,
        label: matchedService.name,
        qty: 1,
        unitPrice: sPrice,
        total: sPrice,
      });
      subtotal += sPrice;
    }

    const stockDecrements: Array<{ productId: string; productName: string; qty: number; currentStock: number; newStock: number; isLowStock: boolean }> = [];
    const initiatives: Array<{ type: "stock_reorder" | "whatsapp_followup" | "debt_reminder" | "loyalty"; title: string; desc: string }> = [];

    if (matchedProduct) {
      const pPrice = matchedService && amounts[1] ? amounts[1] : !matchedService && amounts[0] ? amounts[0] : matchedProduct.price;
      items.push({
        kind: "product",
        id: matchedProduct.id,
        label: matchedProduct.name,
        qty: 1,
        unitPrice: pPrice,
        total: pPrice,
      });
      subtotal += pPrice;

      const remainingStock = Math.max(0, matchedProduct.stock - 1);
      const isLow = remainingStock <= 5;
      stockDecrements.push({
        productId: matchedProduct.id,
        productName: matchedProduct.name,
        qty: 1,
        currentStock: matchedProduct.stock,
        newStock: remainingStock,
        isLowStock: isLow,
      });

      if (isLow) {
        initiatives.push({
          type: "stock_reorder",
          title: "Alerte réassort produit",
          desc: `Il ne reste que ${remainingStock} ${matchedProduct.name} en stock.`,
        });
      }
    }

    const total = subtotal || (detectedAmount > 0 ? detectedAmount : 15000);
    if (items.length === 0) {
      items.push({
        kind: "service",
        label: "Prestation salon",
        qty: 1,
        unitPrice: total,
        total,
      });
    }

    // Détection d'acompte / reste à payer (ex: "a versé 20 000 F et soldera 5 000 F")
    let paidAmount = total;
    let remainingDebt = 0;
    const verseMatch = text.match(/(?:vers[eé]|pay[eé]|donn[eé])\s*(\d[\d\s.,]*)\s*(?:f|cfa|fcfa|mille)?/i);
    const soldeMatch = text.match(/(?:soldera|reste|doit)\s*(\d[\d\s.,]*)\s*(?:f|cfa|fcfa|mille)?/i);
    if (soldeMatch) {
      const rawDebt = parseInt(soldeMatch[1].replace(/\s+/g, ""), 10) || 0;
      if (rawDebt > 0 && rawDebt < total) {
        remainingDebt = rawDebt;
        paidAmount = total - remainingDebt;
      }
    } else if (verseMatch) {
      const rawPaid = parseInt(verseMatch[1].replace(/\s+/g, ""), 10) || 0;
      if (rawPaid > 0 && rawPaid < total) {
        paidAmount = rawPaid;
        remainingDebt = total - paidAmount;
      }
    }

    const matchedEmployee = tenant.employees.find((e) => norm.includes(normalizeStr(e.name)));
    const employeeName = matchedEmployee?.name || tenant.employees[0]?.name || "Équipe";
    const commission = Math.round(total * 0.1);

    const needsClarification = !hasExplicitPayment;
    const clarificationQuestion = needsClarification
      ? `${bossCall}, est-ce que ${clientName} a réglé les ${paidAmount.toLocaleString("fr-FR")} FCFA par Wave, Orange Money ou en Espèces ?`
      : undefined;

    const clarificationOptions = needsClarification
      ? [
          { label: "🌊 Wave", value: "Payé par Wave" },
          { label: "🍊 Orange Money", value: "Payé par Orange Money" },
          { label: "💵 Espèces", value: "Payé en espèces" },
        ]
      : undefined;

    const debtPhrase = remainingDebt > 0 ? ` (avec une ardoise de ${remainingDebt.toLocaleString("fr-FR")} F à solder)` : "";
    const vocalSummary = needsClarification
      ? `C'est bien noté ${bossCall} pour ${clientName} (${total.toLocaleString("fr-FR")} francs CFA${debtPhrase}) ! Pouvez-vous me préciser si le règlement a été fait par Wave, Orange Money ou en Espèces ?`
      : `C'est bien noté ${bossCall} ! J'ai préparé l'encaissement de ${paidAmount.toLocaleString("fr-FR")} francs par ${method.toUpperCase()} pour ${clientName}${debtPhrase}${matchedProduct ? `, décompté 1 ${matchedProduct.name} du stock` : ""}, et mis à jour sa fiche cliente. Tout est prêt à être scellé !`;

    return {
      summary: `Encaissement ${clientName} : ${total.toLocaleString("fr-FR")} FCFA${hasExplicitPayment ? ` (${method.toUpperCase()})` : ""}`,
      vocalSummary,
      needsClarification,
      clarificationQuestion,
      clarificationOptions,
      initiatives: initiatives.length > 0 ? initiatives : undefined,
      hasSale: true,
      sale: {
        items,
        subtotal: total,
        total,
        paidAmount,
        remainingDebt,
        paymentMethod: method,
        discount: 0,
        tipAmount: 0,
      },
      hasStockMovement: stockDecrements.length > 0,
      stock: stockDecrements.length > 0 ? { decrements: stockDecrements } : undefined,
      hasClient: true,
      client: {
        name: clientName,
        debtAmount: remainingDebt,
        isExisting: clientInfo.isExisting,
        clientProfileId: clientInfo.clientProfileId,
      },
      hasAppointment: false,
      hasTeamCredit: Boolean(matchedEmployee),
      team: {
        employeeName,
        employeeId: matchedEmployee?.id,
        commissionAmount: commission,
        tipAmount: 0,
      },
      hasExpense: false,
      hasRelance: true,
      relance: {
        delayDays: 3,
        message: `Bonjour ${clientName}, toute l'équipe de ${tenant.name} vous remercie de votre visite ! Comment se porte votre peau suite à votre soin ?`,
      },
    };
  }

  // ═══ 3. RÉPONSE INTELLIGENTE POUR TOUTE AUTRE QUESTION, SALUTATION OU DEMANDE GÉNÉRALE ═══
  const summaryParts: string[] = [];
  if (liveStats.appointmentsToday.length > 0) {
    summaryParts.push(`${liveStats.appointmentsToday.length} RDV aujourd'hui`);
  } else {
    summaryParts.push("aucun RDV calé aujourd'hui");
  }
  if (liveStats.todayTotal > 0) {
    summaryParts.push(`${liveStats.todayTotal.toLocaleString("fr-FR")} F en caisse`);
  }
  if (liveStats.lowStockProducts.length > 0) {
    summaryParts.push(`${liveStats.lowStockProducts.length} produit(s) en alerte stock`);
  }

  const vocal = `À vos ordres ${bossCall} ! Pour votre demande « ${text.slice(0, 80)} » : sachez qu'actuellement au salon nous avons ${summaryParts.join(", ")}. Vous pouvez me demander l'état de la caisse, vos rendez-vous du jour, vos stocks, les tarifs, ou me dicter directement une vente, une dépense ou un rendez-vous à enregistrer !`;

  return {
    ...noActionBase(`Réponse de votre Secrétaire IA (${tenant.name})`, vocal),
    initiatives: [
      {
        type: "whatsapp_followup",
        title: "Point de situation en direct",
        desc: `Aujourd'hui : ${summaryParts.join(" · ")}.`,
      },
    ],
  };
}
