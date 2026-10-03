// Kènè Pro — POST /api/pro/assistant/debrief
// Moteur d'analyse IA du débriefing de la Maman (gérante de salon)
// Architecture multi-paliers (Zero-Failure) :
//   1. Palier 1 : Google Gemini REST (si GEMINI_API_KEY défini)
//   2. Palier 2 : Z.ai SDK (si .z-ai-config présent)
//   3. Palier 3 : Analyseur NLP déterministe (toujours disponible)
// Reçoit un compte-rendu oralisé ou tapé et découpe automatiquement les actions par onglet :
// Caisse, Stock, CRM, Agenda, Équipe/Paie, Relances, Petite Caisse et Dépenses.
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
  text: z.string().min(2).max(2000),
});

export interface DebriefResult {
  summary: string;
  vocalSummary: string; // Texte parlé chaleureux pour le retour audio à la Maman
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

    const { tenantId, text } = parsed.data;

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

    // Construire le prompt système (partagé entre paliers)
    const systemPrompt = buildSystemPrompt(contextServices, contextProducts, contextEmployees, contextClients);

    // Architecture multi-paliers : Gemini → ZAI → Fallback NLP
    let debrief: DebriefResult | null = null;

    // Palier 1 : Google Gemini REST
    try {
      debrief = await callGeminiDebrief(systemPrompt, text);
      if (debrief) {
        console.log("[assistant:debrief] Palier Gemini ✓");
      }
    } catch (err) {
      console.warn("[assistant:debrief] Palier Gemini échoué, bascule ZAI :", (err as Error).message);
    }

    // Palier 2 : Z.ai SDK
    if (!debrief) {
      try {
        debrief = await callZaiDebrief(systemPrompt, text);
        if (debrief) {
          console.log("[assistant:debrief] Palier ZAI ✓");
        }
      } catch (err) {
        console.warn("[assistant:debrief] Palier ZAI échoué, bascule NLP :", (err as Error).message);
      }
    }

    // Palier 3 : Analyseur NLP déterministe (toujours disponible)
    if (!debrief) {
      debrief = fallbackParser(text, tenant, recentClients);
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
): string {
  return `Tu es l'Assistante d'entreprise intelligente de "La Maman" (la gérante de salon de beauté en Afrique subsaharienne).
La maman te dicte ou écrit son compte-rendu (débriefing) après un soin, une vente ou une dépense.
Ton rôle est d'analyser le texte, de faire correspondre avec le catalogue de l'institut, et de structurer les actions pour tous les onglets : Caisse, Stock, CRM, Agenda, Équipe/Paie, Relances, Petite Caisse.

RÈGLES IMPORTANTES :
1. Devises : FCFA / Francs CFA. Les montants peuvent être formulés oralement ("15 mille" = 15000, "25 000 F", "2 briques" = 20000).
2. Modes de paiement : wave, orange (Orange Money), cash (espèces), card.
3. Reste à payer / ardoise : Si la cliente ne paie qu'une partie (ex: "donné 10 000 F sur 15 000 F"), calcule paidAmount=10000 et remainingDebt=5000.
4. Petite caisse : Si la maman dit avoir pris de l'argent dans la caisse pour le salon (ex: "pris 2000 F pour l'eau ou le courant"), configure hasExpense=true.
5. Pourboires : S'il y a un pourboire pour une employée, isole-le dans tipAmount (distinct du CA salon).
6. Stock : Tout produit vendu (crème, sérum, baume) doit être décompté du stock.
7. RDV futur : Si un futur rendez-vous est mentionné ("dans 3 semaines", "vendredi prochain à 14h"), planifie-le dans hasAppointment.
8. vocalSummary : Rédige une confirmation orale bienveillante et chaleureuse en français (2 à 3 phrases courtes), commençant par "C'est bien noté, Maman !" résumant les montants et les actions.

CONTEXTE DE L'INSTITUT :
- Prestations : ${JSON.stringify(services)}
- Produits : ${JSON.stringify(products)}
- Équipe : ${JSON.stringify(employees)}
- Clientes connues : ${JSON.stringify(clients)}

Réponds UNIQUEMENT par un JSON valide respectant cette structure exacte, sans markdown autour :
{
  "summary": "Résumé concis de l'action",
  "vocalSummary": "C'est bien noté, Maman ! J'ai préparé ...",
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

async function callGeminiDebrief(systemPrompt: string, text: string): Promise<DebriefResult | null> {
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
        contents: [{ role: "user", parts: [{ text }] }],
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

async function callZaiDebrief(systemPrompt: string, text: string): Promise<DebriefResult | null> {
  const zai = await ZAI.create();
  const completion = await zaiCall(
    () =>
      zai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
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
  clients: Array<{ id: string; name: string; phone?: string | null }>
): DebriefResult {
  const lower = text.toLowerCase();

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
  if (lower.includes("wave")) method = "wave";
  else if (lower.includes("orange") || lower.includes("om")) method = "orange";
  else if (lower.includes("carte") || lower.includes("cb")) method = "card";

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
      vocalSummary: `C'est bien noté, Maman ! J'ai enregistré une sortie de caisse de ${detectedAmount.toLocaleString("fr-FR")} francs pour les frais du salon.`,
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

    stockDecrements.push({
      productId: matchedProduct.id,
      productName: matchedProduct.name,
      qty: 1,
      currentStock: matchedProduct.stock,
      newStock: Math.max(0, matchedProduct.stock - 1),
      isLowStock: matchedProduct.stock - 1 <= 5,
    });
  }

  const total = subtotal || (detectedAmount > 0 ? detectedAmount : 15000);
  const paidAmount = total;
  const remainingDebt = 0;

  // 5. Détection employée
  const matchedEmployee = tenant.employees.find((e) => lower.includes(e.name.toLowerCase()));
  const employeeName = matchedEmployee?.name || tenant.employees[0]?.name || "Équipe";
  const commission = Math.round(total * 0.1); // 10% commission standard

  // 6. Détection de RDV
  const hasAppt = lower.includes("rdv") || lower.includes("revient") || lower.includes("semaine") || lower.includes("vendredi");

  return {
    summary: `Prestation avec ${clientName} (${total.toLocaleString("fr-FR")} FCFA par ${method.toUpperCase()})`,
    vocalSummary: `C'est bien noté, Maman ! J'ai préparé l'encaissement de ${total.toLocaleString("fr-FR")} francs par ${method.toUpperCase()} pour ${clientName}${matchedProduct ? ", décompté le produit du stock" : ""}, et attribué la prestation à ${employeeName}. Tu veux que j'enregistre ?`,
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
      delayDays: 14,
      message: `Bonjour ${clientName} ! 🌸 Comment réagit votre peau suite à votre soin chez ${tenant.services[0]?.name ?? "l'institut"} ?`,
    },
  };
}
