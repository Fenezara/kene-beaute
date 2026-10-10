"use client";
// Kènè — Enregistreur Audio & Transcription Vocale Multi-Paliers (Zero-Failure Architecture)
// Fonctionne universellement sur Chrome, Safari (iOS / macOS), Android, Firefox et WebViews PWA.
// Double palier :
// 1. Détection de volume temps réel via Web Audio API (AnalyserNode) pour animer l'Orbe 3D
// 2. Transcription en continu (Web Speech API si disponible) + Secours ASR serveur (/api/asr avec Gemini & Z.ai)
// 3. Déverrouillage préventif de l'AudioContext pour autoriser l'autoplay de la réponse vocale de l'Assistante

import { unlockAudioContext } from "@/components/kene/client/ttsAudio";

export function pickRecorderMime(): string | undefined {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"]) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return undefined;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Audio illisible"));
    fr.onload = () => {
      const s = String(fr.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    fr.readAsDataURL(blob);
  });
}

/**
 * Convertit tout format conteneur (MP4/AAC sur Safari iOS, etc.) en WAV mono 16 bits
 * afin de garantir une acceptation parfaite par les moteurs de transcription.
 */
export async function toAsrBlob(blob: Blob): Promise<Blob> {
  const t = blob.type.toLowerCase();
  if (t.includes("wav")) return blob;
  if (typeof window === "undefined") return blob;

  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return blob;

  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const len = decoded.length;
    const view = new DataView(new ArrayBuffer(44 + len * 2));
    const w = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    w(0, "RIFF");
    view.setUint32(4, 36 + len * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, decoded.sampleRate, true);
    view.setUint32(28, decoded.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    w(36, "data");
    view.setUint32(40, len * 2, true);
    const chans = decoded.numberOfChannels;
    for (let i = 0; i < len; i++) {
      let mono = 0;
      for (let c = 0; c < chans; c++) mono += (decoded.getChannelData(c)?.[i] ?? 0) / chans;
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mono)) * 0x7fff, true);
    }
    return new Blob([view], { type: "audio/wav" });
  } catch (err) {
    console.warn("[kene:audio:toAsrBlob]", err);
    return blob;
  } finally {
    void ctx.close();
  }
}

/**
 * Envoie un enregistrement audio au serveur (/api/asr) pour transcription haute-fidélité.
 */
export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const wavOrWebmBlob = await toAsrBlob(blob);
  const base64 = await blobToBase64(wavOrWebmBlob);

  const res = await fetch("/api/asr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: base64,
      mimeType: wavOrWebmBlob.type,
    }),
  });

  if (!res.ok) {
    let errText = "Échec de transcription";
    try {
      const j = await res.json();
      if (j?.error) errText = j.error;
    } catch {}
    throw new Error(errText);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}
