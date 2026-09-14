// GET /api/push/public-key — clé publique VAPID pour pushManager.subscribe.
// Répond TOUJOURS 200: { publicKey: "<base64url>" } ou { publicKey: null }
// quand la clé n'est pas configurée — le front désactive alors la carte
// « Rappels sur mon téléphone » au lieu d'échouer.
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  return NextResponse.json({ publicKey });
}
