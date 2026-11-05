---
name: api-contract-generator
description: Génération de Server Actions Next.js, endpoints REST et schémas de validation Zod de bout en bout avec sécurité et typage TypeScript strict. À utiliser pour créer de nouvelles fonctionnalités backend et formulaires sécurisés.
---

# API Contract Generator & Zod Validation

Ce skill établit un pont infaillible et fortement typé entre le client et le serveur.

## 1. Principe "Zero Untyped Input"
- Tout payload reçu par une API route ou une Server Action Next.js DOIT être analysé avec un schéma Zod (`schema.safeParse(input)`).
- Ne jamais caster `as any` ou faire confiance aux données envoyées par le client.

## 2. Structure Standard d'une Server Action Kènè
```typescript
"use server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const InputSchema = z.object({
  salonId: z.string().uuid(),
  amount: z.number().positive(),
  clientPhone: z.string().regex(/^\+?[0-9]{8,15}$/)
});

export async function createBookingAction(formData: unknown) {
  const parsed = InputSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  
  try {
    // Exécution métier sécurisée
    return { success: true, data: ... };
  } catch (error) {
    console.error("Action error:", error);
    return { success: false, message: "Une erreur interne est survenue." };
  }
}
```
