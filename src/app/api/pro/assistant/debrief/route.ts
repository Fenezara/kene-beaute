// Kènè Pro — POST /api/pro/assistant/debrief
// Moteur d'analyse IA et Secrétaire de Direction Intelligente
// Architecture multi-paliers (Zero-Failure) :
//   1. Palier 1 : Google Gemini REST (si GEMINI_API_KEY défini)
//   2. Palier 2 : Z.ai SDK (si .z-ai-config présent)
//   3. Palier 3 : Analyseur NLP déterministe (toujours disponible)
// Rôle : Raisonnement proactif de secrétaire humaine d'élite.
// Pose des questions de clarification si des informations manquent,
// propose des initiatives (stock bas, relances WhatsApp), et s'adresse toujours
// avec distinction à la directrice par son nom/prénom (JAMAIS "Maman").

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
  managerName: z.string().max(100).optional(),
  previousDebrief: z.any().optional(),
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

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:assistant:debrief");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const { tenantId, text, userName, previousDebrief } = parsed.data;

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

    // Récupérer les clientes récentes pour réconciliation des prénoms
    const recentClients = await db.clientProfile.findMany({
      where: { tenantId },
      select: { id: true, name: true, phone: true, skinType: true },
      take: 40,
      orderBy: { createdAt: "desc" },
    });

    const contextServices = tenant.services.map((s) => ({ id: s.id, name: s.name, price: s.price }));
    const contextProducts = tenant.products.map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stock }));
    const contextEmployees = tenant.employees.map((e) => ({ id: e.id, name: e.name, role: e.role }));
    const contextClients = recentClients.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));

    const managerName = (parsed.data.managerName || parsed.data.userName)?.trim() || "Madame";

    // Construire le prompt système personnalisé
    const systemPrompt = buildSystemPrompt(
      contextServices,
      contextProducts,
      contextEmployees,
      contextClients,
      managerName
    );

    let userPromptText = text;
    if (previousDebrief) {
      userPromptText = `[CONTEXTE EN COURS DE CLARIFICATION] : ${JSON.stringify(previousDebrief)}\n[NOUVELLE PRÉCISION DE ${managerName}] : "${text}"\nConsigne : Intègre cette précision (ex: moyen de paiement, téléphone ou date), complète l'objet, passe "needsClarification": false si tout est clair maintenant, et mets à jour vocalSummary et les montants.`;
    }

    // Architecture multi-paliers : Gemini → ZAI → Fallback NLP
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
        console.warn("[assistant:debrief] Palier ZAI échoué, bascule NLP :", (err as Error).message);
      }
    }

    // Palier 3 : Analyseur NLP déterministe (toujours disponible)
    if (!debrief) {
      debrief = fallbackParser(text, tenant, recentClients, managerName, previousDebrief);
      console.log("[assistant:debrief] Palier NLP déterministe ✓");
    }

    return NextResponse.json({ debrief });
  } catch (err) {
    return serverError("pro/assistant:debrief", err);
  }
}

// ─────────────────────────── Prompt système ───────────────────────────

function buildSystemPrompt(
  services: Array<{ id: string; name: string; price: number }>,
  products: Array<{ id: string; name: string; price: number; stock: number }>,
  employees: Array<{ id: string; name: string; role: string }>,
  clients: Array<{ id: string; name: string; phone: string | null }>,
  managerName: string,
): string {
  return `Tu es la Secrétaire de Direction et Assistante d'Entreprise intelligente de ${managerName} (gérante et directrice d'institut de beauté en Côte d'Ivoire et Afrique de l'Ouest).
Ton rôle est d'analyser son compte-rendu, de structurer les écritures pour son salon, de faire preuve d'intelligence humaine et de prendre des initiatives de gestion.

RÈGLE D'ADRESSE STRICTE ET IMPÉRATIVE :
1. Adresse-toi TOUJOURS à elle avec respect et distinction en utilisant son nom ou prénom : "${managerName}".
2. INTERDICTION ABSOLUE : N'utilise JAMAIS le mot "Maman". Ne dis JAMAIS "Maman" dans aucune réponse ni dans aucun texte.
3. Commence ton vocalSummary par exemple par "C'est bien noté, ${managerName} !", "Très bien, ${managerName}.", "Compris ${managerName} !".

RAISONNEMENT HUMAIN & PRISES D'INITIATIVES PROACTIVES :
4. QUESTIONS DE CLARIFICATION :
   - Si une information financière ou opérationnelle essentielle manque ou est ambiguë, définis "needsClarification": true.
   - Formule alors une question orale douce et précise dans "clarificationQuestion" (et inclus-la dans "vocalSummary").
   - Fournis dans "clarificationOptions" 2 à 4 choix rapides en 1-Tap pour l'aider.
   - Exemples de manques :
     * Moyen de paiement non précisé pour un soin ou une vente : demande si c'est Wave, Orange Money ou Espèces.
       clarificationOptions: [{"label": "🌊 Wave", "value": "Payé par Wave"}, {"label": "🍊 Orange Money", "value": "Payé par Orange Money"}, {"label": "💵 Espèces", "value": "Payé en espèces"}]
     * Ardoise (reste à payer) sans date d'échéance : demande pour quel jour noter le rappel.
     * Nouvelle cliente sans contact : demande si elle a son numéro pour le reçu WhatsApp.
   - Si les informations sont claires et suffisantes, "needsClarification" doit être false (ou omis).

5. INITIATIVES DE GESTION :
   - Alerte Stock : Si un produit vendu laisse le stock à 2 unités ou moins, ajoute dans "initiatives" une proposition de réassort fournisseur.
   - Relance WhatsApp : Si une prestation cabine (soin visage, peeling, traitement) a été effectuée, propose dans "initiatives" une relance à J+3 pour prendre des nouvelles de sa peau.

RÈGLES MÉTIER :
6. Devises : FCFA / Francs CFA. ("15 mille" = 15000, "20 000 F", "2 briques" = 20000).
7. Modes de paiement : wave, orange (Orange Money), cash (espèces), card.
8. Ardoise / Reste à payer : Calcule distinctement paidAmount et remainingDebt.
9. Petite caisse : Si prise d'argent pour des dépenses du salon (eau, courant, fournitures), hasExpense=true.
10. vocalSummary : 2 à 3 phrases parlées chaleureuses, fluides et professionnelles, appelant la gérante par "${managerName}".

CONTEXTE DE L'INSTITUT :
- Prestations : ${JSON.stringify(services)}
- Produits : ${JSON.stringify(products)}
- Équipe : ${JSON.stringify(employees)}
- Clientes connues : ${JSON.stringify(clients)}

Réponds UNIQUEMENT par un JSON valide respectant cette structure exacte, sans balise markdown :
{
  "summary": "Résumé concis",
  "vocalSummary": "C'est bien noté, ${managerName} ! J'ai préparé ...",
  "needsClarification": boolean,
  "clarificationQuestion": "Question posée à ${managerName} si information manquante",
  "clarificationOptions": [{ "label": "string", "value": "string" }],
  "initiatives": [{ "type": "stock_reorder"|"whatsapp_followup"|"debt_reminder"|"loyalty", "title": "string", "desc": "string" }],
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

// ─────────────── Palier 1 : Google Gemini REST ───────────────

function parseDebriefJson(raw: string): DebriefResult | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (!cleaned) return null;
  return JSON.parse(cleaned) as DebriefResult;
}

async function callGeminiDebrief(systemPrompt: string, userMessage: string): Promise<DebriefResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== "gemini-1.5-flash") ? process.env.GEMINI_MODEL : "gemini-2.5-flash";
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
    console.warn(`[assistant:debrief:gemini] HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return raw ? parseDebriefJson(raw) : null;
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

// ─────────────── Palier 3 : Analyseur NLP déterministe ───────────────
function fallbackParser(
  text: string,
  tenant: {
    services: Array<{ id: string; name: string; price: number }>;
    products: Array<{ id: string; name: string; price: number; stock: number }>;
    employees: Array<{ id: string; name: string; role?: string }>;
  },
  clients: Array<{ id: string; name: string; phone?: string | null }>,
  managerName: string,
  previousDebrief?: any,
): DebriefResult {
  const lower = text.toLowerCase();

  // Si on est dans une boucle de clarification et que l'utilisateur a donné le mode de paiement
  if (previousDebrief && previousDebrief.hasSale) {
    let method: "wave" | "orange" | "cash" | "card" = previousDebrief.sale?.paymentMethod || "cash";
    if (lower.includes("wave")) method = "wave";
    else if (lower.includes("orange") || lower.includes("om")) method = "orange";
    else if (lower.includes("cash") || lower.includes("espèce") || lower.includes("espece")) method = "cash";
    else if (lower.includes("carte") || lower.includes("cb")) method = "card";

    return {
      ...previousDebrief,
      needsClarification: false,
      clarificationQuestion: undefined,
      clarificationOptions: undefined,
      vocalSummary: `Parfait, ${managerName} ! J'ai bien enregistré le règlement par ${method.toUpperCase()}. Tout est prêt à être scellé.`,
      sale: {
        ...previousDebrief.sale,
        paymentMethod: method,
      },
    };
  }

  // 1. Détection de paiement & montants
  const amountMatch = text.match(/(\d[\d\s.,]*)\s*(?:f|cfa|fcfa|mille|francs)/i);
  let detectedAmount = 0;
  if (amountMatch) {
    let clean = amountMatch[1].replace(/\s+/g, "").replace(",", ".");
    if (amountMatch[0].toLowerCase().includes("mille")) {
      detectedAmount = (parseFloat(clean) || 1) * 1000;
    } else {
      detectedAmount = parseInt(clean, 10) || 0;
    }
  }

  // Moyen de paiement
  let method: "wave" | "orange" | "cash" | "card" = "cash";
  let hasExplicitPayment = false;
  if (lower.includes("wave")) {
    method = "wave";
    hasExplicitPayment = true;
  } else if (lower.includes("orange") || lower.includes("om")) {
    method = "orange";
    hasExplicitPayment = true;
  } else if (lower.includes("carte") || lower.includes("cb")) {
    method = "card";
    hasExplicitPayment = true;
  } else if (lower.includes("espèce") || lower.includes("espece") || lower.includes("cash")) {
    method = "cash";
    hasExplicitPayment = true;
  }

  // 2. Détection de cliente
  let clientName = "Cliente de passage";
  let clientProfileId: string | undefined;
  const tantieMatch = text.match(/(?:tantie|mme|madame|soeur|fille)\s+([A-ZÀ-ÿa-z]+)/i);
  if (tantieMatch) {
    clientName = tantieMatch[0].trim();
  }
  const matchedClient = clients.find((c) =>
    c.name.toLowerCase().includes(clientName.toLowerCase()) || lower.includes(c.name.toLowerCase())
  );
  if (matchedClient) {
    clientName = matchedClient.name;
    clientProfileId = matchedClient.id;
  }

  // 3. Détection de dépense de petite caisse
  const isExpense = lower.includes("pris dans la caisse") || lower.includes("dépense") || lower.includes("acheté de l'eau") || lower.includes("courant");
  if (isExpense && detectedAmount > 0) {
    return {
      summary: `Sortie de petite caisse : ${detectedAmount.toLocaleString("fr-FR")} FCFA`,
      vocalSummary: `C'est bien noté, ${managerName} ! J'ai enregistré une sortie de caisse de ${detectedAmount.toLocaleString("fr-FR")} francs pour les frais du salon.`,
      hasSale: false,
      hasStockMovement: false,
      hasClient: false,
      hasAppointment: false,
      hasTeamCredit: false,
      hasExpense: true,
      expense: {
        amount: detectedAmount,
        description: text.slice(0, 100),
        category: lower.includes("eau") ? "fournitures" : lower.includes("courant") ? "energie" : "autre",
      },
      hasRelance: false,
    };
  }

  // 4. Détection de prestation et produit
  const matchedService = tenant.services.find((s) => lower.includes(s.name.toLowerCase())) || tenant.services[0];
  const matchedProduct = tenant.products.find((p) => lower.includes(p.name.toLowerCase()));

  const items: Array<{ kind: "service" | "product"; id?: string; label: string; qty: number; unitPrice: number; total: number }> = [];
  let subtotal = 0;

  if (matchedService) {
    const sPrice = detectedAmount > 0 && !matchedProduct ? detectedAmount : matchedService.price;
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
    items.push({
      kind: "product",
      id: matchedProduct.id,
      label: matchedProduct.name,
      qty: 1,
      unitPrice: matchedProduct.price,
      total: matchedProduct.price,
    });
    subtotal += matchedProduct.price;

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
        desc: `Il ne reste que ${remainingStock} ${matchedProduct.name} en stock. Prévoir une commande fournisseur ?`,
      });
    }
  }

  const total = subtotal || (detectedAmount > 0 ? detectedAmount : 15000);
  const paidAmount = total;
  const remainingDebt = 0;

  // 5. Détection employée
  const matchedEmployee = tenant.employees.find((e) => lower.includes(e.name.toLowerCase()));
  const employeeName = matchedEmployee?.name || tenant.employees[0]?.name || "Équipe";
  const commission = Math.round(total * 0.1);

  // 6. Détection de RDV
  const hasAppt = lower.includes("rdv") || lower.includes("revient") || lower.includes("semaine") || lower.includes("vendredi");

  // Proactivité : Relance WhatsApp
  if (matchedService) {
    initiatives.push({
      type: "whatsapp_followup",
      title: "Relance WhatsApp post-soin",
      desc: `Programmer un suivi bienveillant à J+3 pour ${clientName} après son ${matchedService.name} ?`,
    });
  }

  // Si le mode de paiement n'a pas été précisé du tout, la secrétaire pose la question !
  const needsClarification = !hasExplicitPayment;
  const clarificationQuestion = needsClarification
    ? `${managerName}, est-ce que ${clientName} a réglé par Wave, Orange Money ou en Espèces ?`
    : undefined;

  const clarificationOptions = needsClarification
    ? [
        { label: "🌊 Wave", value: "Payé par Wave" },
        { label: "🍊 Orange Money", value: "Payé par Orange Money" },
        { label: "💵 Espèces", value: "Payé en espèces" },
      ]
    : undefined;

  const vocalSummary = needsClarification
    ? `C'est bien noté, ${managerName} pour le soin de ${clientName} ! Mais dis-moi : est-ce que le montant de ${total.toLocaleString("fr-FR")} francs a été réglé par Wave, Orange Money ou en Espèces ?`
    : `C'est bien noté, ${managerName} ! J'ai préparé l'encaissement de ${total.toLocaleString("fr-FR")} francs par ${method.toUpperCase()} pour ${clientName}${matchedProduct ? ", décompté le stock" : ""}, et attribué la prestation à ${employeeName}. Tout est prêt à sceller.`;

  return {
    summary: `Prestation avec ${clientName} (${total.toLocaleString("fr-FR")} FCFA${hasExplicitPayment ? ` par ${method.toUpperCase()}` : ""})`,
    vocalSummary,
    needsClarification,
    clarificationQuestion,
    clarificationOptions,
    initiatives: initiatives.length > 0 ? initiatives : undefined,
    hasSale: true,
    sale: {
      items: items.length > 0 ? items : [{ kind: "service", label: "Prestation salon", qty: 1, unitPrice: total, total }],
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
      skinNotes: lower.includes("sèche") ? "Peau sèche" : lower.includes("grasse") ? "Peau grasse" : undefined,
      debtAmount: remainingDebt,
      isExisting: Boolean(matchedClient),
      clientProfileId,
    },
    hasAppointment: hasAppt,
    appointment: hasAppt
      ? {
          serviceName: matchedService ? matchedService.name : "Soin de contrôle",
          serviceId: matchedService?.id,
          practitionerName: employeeName,
          dateStr: new Date(Date.now() + 21 * 86400000).toISOString(),
          timeStr: "11:00",
          notes: "Rendez-vous de suivi post-soin",
        }
      : undefined,
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
      message: `Bonjour ${clientName}, c'est l'équipe de ${tenant.services[0]?.name || "l'institut"}. Comment se porte votre peau suite à votre soin ? N'hésitez pas si vous avez la moindre question !`,
    },
  };
}
