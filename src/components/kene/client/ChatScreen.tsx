"use client";
// Kènè Cliente — Chat Dr. Kènè : WhatsApp-like, micro serveur (ASR), triage
// photo IA, TTS. ÉCLAT 2026 : bulles verre (IA) / dégradé terre-bissap
// (cliente), avatar NeaOnnim à halo doré, chips verre — présentation seule,
// logique chat (store persist, triage photo, TTS) inchangée.
// La conversation vit dans le store persist « kene-chat » (src/store/chat.ts) :
// elle survit au changement d'onglet et au rechargement, sans les photos
// (base64 — mémoire de session uniquement, jamais dans localStorage).
//
// MICRO SERVEUR (t. 71-d) : la cliente parle → MediaRecorder (webm/opus,
// 12 s max, annulable) → POST /api/asr → la transcription arrive DANS LE
// CHAMP DE SAISIE — jamais d'envoi automatique, elle relit et valide.
// Safari (mp4/aac non supporté par le moteur) → ré-encodage WAV mono via
// WebAudio avant l'envoi (toAsrBlob). Remplace la dictée webkitSpeechRecognition
// (Chrome-only, navigateur) par l'ASR serveur — disponible partout.
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, CircleCheck, ImagePlus, Loader2, Mic, OctagonAlert, Send, ShieldCheck, Square, TriangleAlert, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { apiPost, resizeImage } from "@/lib/kene/api";
import { KeneEmblem, NeaOnnimIcon } from "@/components/kene/icons";
import { Chip, IconBadge } from "@/components/kene/ui2026";
import { useKene } from "@/store/kene";
import { useChat } from "@/store/chat";
import type { ChatMsg } from "./types";

const SUGGESTIONS = [
  "Comment atténuer mes taches PIH ?",
  "Le karité sur peau acnéique ?",
  "Routine minimaliste matin/soir ?",
];

/** Contrat badge cloche chat (63-a) : un message de Dr. Kènè vient d'arriver
 *  — c'est le SEUL point de couplage, l'événement est figé. */
function notifyChatNew() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kene:chat:new", { detail: { at: Date.now() } }));
  }
}

/* ── Micro serveur (t. 71-d) — types & helpers purs ── */
type MicState = "idle" | "recording" | "transcribing" | "unavailable";

/** 12 s max d'enregistrement (couvre une question beauté posée à l'oral). */
const MAX_RECORD_MS = 12_000;

function mmss(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/** webm/opus si supporté (Chrome/Android/Firefox) ; undefined sinon → Safari
 *  enregistre en mp4/aac, converti en WAV par toAsrBlob avant l'envoi. */
function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
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

/** Le moteur ASR n'accepte QUE WAV et WebM (erreur amont explicite) : tout
 *  autre conteneur (mp4/aac Safari) est ré-encodé en WAV mono 16 bits via
 *  WebAudio — conversion minimale côté client, documentée dans la route. */
async function toAsrBlob(blob: Blob): Promise<Blob> {
  const t = blob.type.toLowerCase();
  if (t.includes("webm") || t.includes("wav")) return blob;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return blob; // dernier recours : tenter l'envoi tel quel
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
  } finally {
    void ctx.close();
  }
}

const TRIAGE = {
  vert: { border: "border-l-4 border-success", bg: "bg-success/5", text: "text-success", Icon: CircleCheck, cta: "Voir la boutique", tab: "boutique" as const },
  jaune: { border: "border-l-4 border-gold", bg: "bg-gold/5", text: "text-gold-text", Icon: TriangleAlert, cta: "Prendre RDV", tab: "rdv" as const },
  rouge: { border: "border-l-4 border-bissap", bg: "bg-bissap/5", text: "text-destructive", Icon: OctagonAlert, cta: "Voir les instituts", tab: "rdv" as const },
};

/* Ids uniques entre sessions : un simple compteur entrerait en collision avec
   les ids persistés ("m1" déjà pris par un ancien message) → préfixe horodaté. */
let idCounter = 0;
const nid = () => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function ChatScreen() {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);
  // Fil persisté (survit au changement d'onglet) — voir src/store/chat.ts.
  const messages = useChat((s) => s.messages);
  const add = useChat((s) => s.add);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [micElapsed, setMicElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rehydratation paresseuse et idempotente (pattern use-t.ts) : le premier
  // montage relit le localStorage persisté ; les montages suivants ne
  // relisent PAS — les photos de session restent en mémoire (hasHydrated
  // évite qu'une relecture n'écrase le fil courant sans ses photos).
  useEffect(() => {
    if (!useChat.persist.hasHydrated()) void useChat.persist.rehydrate();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  /* ── Micro serveur : machine à états idle → recording → transcribing ── */

  function clearMicTimers() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }

  /** Rendu du flux : le micro s'éteint réellement (getUserMedia +
   *  recorder.stream, tous deux référencés — même objet en pratique). */
  function releaseStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }

  function resetMic() {
    setMicState("idle");
    setMicElapsed(0);
    chunksRef.current = [];
  }

  // Démontage (changement d'onglet) : plus aucune piste/timer ne survit,
  // et aucun setState post-démontage (onstop neutralisé).
  useEffect(
    () => () => {
      cancelledRef.current = true;
      clearMicTimers();
      const rec = recorderRef.current;
      if (rec) {
        rec.onstop = null;
        if (rec.state === "recording") rec.stop();
      }
      recorderRef.current = null;
      releaseStream();
    },
    [],
  );

  async function startRecording() {
    if (micState !== "idle") return;
    if (
      typeof window === "undefined" ||
      typeof window.MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setMicState("unavailable");
      toast.info("Micro indisponible sur cet appareil");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void transcribeRecording();
      };
      rec.start(250); // segments réguliers → robuste à un stop à tout instant
      setMicState("recording");
      setMicElapsed(0);
      tickRef.current = setInterval(() => setMicElapsed((s) => s + 1), 1000);
      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_RECORD_MS);
    } catch {
      // Permission refusée / micro absent → bouton grisé, aucun crash.
      releaseStream();
      setMicState("unavailable");
      toast.info("Micro indisponible sur cet appareil");
    }
  }

  function stopRecording() {
    if (micState !== "recording") return;
    clearMicTimers();
    const rec = recorderRef.current;
    if (rec?.state === "recording") rec.stop(); // → onstop → transcribeRecording
  }

  function cancelRecording() {
    if (micState !== "recording") return;
    cancelledRef.current = true;
    clearMicTimers();
    const rec = recorderRef.current;
    if (rec?.state === "recording") {
      rec.stop(); // onstop → annulé, aucune transcription
    } else {
      releaseStream();
      resetMic();
    }
  }

  async function transcribeRecording() {
    releaseStream();
    clearMicTimers();
    if (cancelledRef.current) {
      resetMic();
      return;
    }
    const type = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    if (blob.size < 2000) {
      resetMic();
      toast.info("Aucun son capté — réessaie");
      return;
    }
    setMicState("transcribing");
    try {
      const payload = await toAsrBlob(blob);
      const audio = await blobToBase64(payload);
      const r = await apiPost<{ text: string }>("/api/asr", { audio, mimeType: payload.type });
      const text = (r?.text ?? "").trim();
      if (!text) {
        toast.info("Je n'ai pas bien entendu — réessaie");
        return;
      }
      // Le texte arrive dans le champ : replace si vide, append sinon.
      // JAMAIS d'envoi automatique — la cliente relit et valide.
      setInput((prev) => (prev ? `${prev} ${text}` : text));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription impossible");
    } finally {
      resetMic();
    }
  }

  const speak = useCallback((text: string) => {
    if (!ttsOn || typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text.slice(0, 260));
    u.lang = "fr-FR";
    u.rate = 1.02;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [ttsOn]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    const mine: ChatMsg = { id: nid(), role: "user", content, kind: "text", time: Date.now() };
    add(mine); // le store re-sème le message d'accueil si le fil est vide
    setSending(true);
    try {
      const history = [...messages, mine].slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const r = await apiPost<{ reply: string }>("/api/dermato/chat", { messages: history, userId: user.id });
      add({ id: nid(), role: "assistant", content: r.reply, kind: "text", time: Date.now() });
      notifyChatNew();
      speak(r.reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Réponse impossible");
      add({ id: nid(), role: "assistant", content: "Pardon, une erreur est survenue. Reformule ta question dans un instant.", kind: "text", time: Date.now() });
      notifyChatNew();
    } finally {
      setSending(false);
    }
  }

  async function onPhoto(f: File | undefined) {
    if (!f || photoBusy) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImage(f);
      // La photo vit en mémoire de session : jamais persistée (partialize du
      // store la retire), le fil texte lui survit.
      add({ id: nid(), role: "user", content: "Regarde cette zone, stp.", kind: "photo", photo: dataUrl, time: Date.now() });
      setSending(true);
      const r = await apiPost<{ niveau: "vert" | "jaune" | "rouge"; message: string }>("/api/dermato/photo", { image: dataUrl, userId: user.id });
      add({ id: nid(), role: "assistant", content: r.message, kind: "photo", niveau: r.niveau, time: Date.now() });
      notifyChatNew();
      speak(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyse photo impossible");
    } finally {
      setSending(false);
      setPhotoBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-[68vh] pt-4">
      <header className="flex items-center gap-3 pb-3 border-b border-border">
        <span className="relative shrink-0">
          {/* Sceau 2026 (t. 86) — le Médaillon Kènè est l'avatar du Dr. Kènè */}
          <span className="k-glow-gold inline-grid rounded-[14px]">
            <KeneEmblem size={40} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#346834] border-2 border-background" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold text-sm">Dr. Kènè</p>
          <p className="text-[11px] text-success font-semibold">En ligne — éducation cutanée</p>
        </div>
        <button
          onClick={() => {
            setTtsOn((v) => {
              if (v && typeof window !== "undefined") window.speechSynthesis?.cancel();
              return !v;
            });
          }}
          aria-pressed={ttsOn}
          aria-label={ttsOn ? "Désactiver la lecture vocale" : "Activer la lecture vocale"}
          className={`h-10 w-10 grid place-items-center rounded-full active:scale-90 transition-all focus-visible:outline-2 focus-visible:outline-primary ${ttsOn ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"}`}
        >
          {ttsOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      </header>

      {/* Fil de discussion */}
      <div className="relative flex-1 overflow-y-auto py-4 max-h-[56vh]" aria-live="polite">
        <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-50 pointer-events-none" />
        <div className="relative flex flex-col gap-3">
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="self-end max-w-[82%]">
                  {m.photo && <img src={m.photo} alt="Photo envoyée" className="rounded-[20px] rounded-br-[6px] mb-1.5 max-h-52 object-cover border border-border" />}
                  <div className="k-cta rounded-[20px] rounded-br-[6px] px-3.5 py-2.5 text-[#FFF9EC]">
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                  <p className="text-[9px] text-muted-foreground text-right mt-1">{new Date(m.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                </motion.div>
              );
            }
            const tri = m.niveau ? TRIAGE[m.niveau] : null;
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="self-start max-w-[86%] flex items-end gap-2">
                <IconBadge icon={<NeaOnnimIcon size={14} />} size="sm" tone="gold" className="mb-4 h-8 w-8 rounded-[10px]" />
                <div>
                  <div className="relative k-card rounded-[20px] rounded-bl-[6px] px-3.5 py-2.5">
                    {tri && (
                      <span aria-hidden="true" className={`pointer-events-none absolute inset-0 rounded-[20px] rounded-bl-[6px] ${tri.border} ${tri.bg}`} />
                    )}
                    <div className="relative">
                      {tri && (
                        <p className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide ${tri.text} mb-1.5`}>
                          <tri.Icon size={13} />
                          {m.niveau === "vert" ? "Rassurant" : m.niveau === "jaune" ? "À surveiller" : "Consultation conseillée"}
                        </p>
                      )}
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  </div>
                  {tri && (
                    <button
                      onClick={() => setClientTab(tri.tab)}
                      className={`mt-1.5 h-9 px-3.5 rounded-full ${tri.text} border ${m.niveau === "vert" ? "border-[#346834]/50 bg-[#346834]/10" : m.niveau === "jaune" ? "border-[#C8951E]/50 bg-[#C8951E]/10" : "border-[#8B1A3B]/50 bg-[#8B1A3B]/10"} text-[11px] font-bold active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary`}
                    >
                      {tri.cta} →
                    </button>
                  )}
                  <p className="text-[9px] text-muted-foreground mt-1">Dr. Kènè · {new Date(m.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </motion.div>
            );
          })}

          {sending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start flex items-end gap-2">
              <IconBadge icon={<NeaOnnimIcon size={14} />} size="sm" tone="gold" className="h-8 w-8 rounded-[10px]" />
              <div className="k-card rounded-[20px] rounded-bl-[6px] px-4 py-3 flex gap-1.5" aria-label="Dr. Kènè écrit">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-primary" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggestions initiales */}
      {messages.length <= 1 && !sending && (
        <div className="flex flex-col gap-2 py-3">
          {SUGGESTIONS.map((s) => (
            <Chip key={s} selected={false} onClick={() => send(s)} className="self-start text-left">
              {s}
            </Chip>
          ))}
        </div>
      )}

      {/* Saisie */}
      <div className="sticky bottom-0 pt-2">
        <div className="k-card flex items-center gap-2 rounded-[20px] p-2">
          {micState === "recording" ? (
            <>
              {/* Le micro devient pastille STOP bissap à halo pulse */}
              <button
                onClick={stopRecording}
                aria-label="Arrêter l'enregistrement et transcrire"
                className="relative h-11 w-11 grid place-items-center rounded-full shrink-0 bg-bissap text-[#FFF9EC] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              >
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-bissap/50"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.55, 0, 0.55] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                />
                <Square size={13} fill="currentColor" className="relative" aria-hidden="true" />
              </button>
              {/* Timer + onde — remplacent le champ le temps de parler */}
              <div className="h-12 min-w-0 flex-1 flex items-center gap-3 rounded-2xl bg-bissap/8 border border-bissap/25 px-4" role="status">
                <span className="sr-only">Enregistrement en cours — 12 secondes maximum</span>
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bissap opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-bissap" />
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-bissap" aria-hidden="true">{mmss(micElapsed)}</span>
                <span className="flex items-end gap-[3px] h-3.5" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[3px] h-full rounded-full bg-bissap/70"
                      animate={{ scaleY: [0.4, 1, 0.55, 0.85, 0.4] }}
                      transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.13, ease: "easeInOut" }}
                    />
                  ))}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0" aria-hidden="true">max 12 s</span>
              </div>
              {/* Annulation : jette l'enregistrement, rien n'est transcrit */}
              <button
                onClick={cancelRecording}
                aria-label="Annuler l'enregistrement"
                title="Annuler l'enregistrement"
                className="h-11 w-11 grid place-items-center rounded-full shrink-0 text-muted-foreground hover:bg-muted active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              {/* Micro serveur : parler → transcription ASR dans le champ */}
              <button
                onClick={startRecording}
                disabled={micState === "unavailable" || micState === "transcribing"}
                aria-disabled={micState === "unavailable"}
                aria-label="Parler à Dr. Kènè"
                title={micState === "unavailable" ? "Micro indisponible sur cet appareil" : "Parler à Dr. Kènè — 12 secondes max"}
                className="h-11 w-11 grid place-items-center rounded-full shrink-0 text-muted-foreground hover:bg-muted active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 disabled:pointer-events-none"
              >
                {micState === "transcribing" ? <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" /> : <Mic size={19} />}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                placeholder={micState === "transcribing" ? "Transcription en cours…" : "Écris à Dr. Kènè…"}
                aria-label="Message pour Dr. Kènè"
                className="k-input h-12 min-w-0 flex-1 rounded-2xl px-3.5 text-sm outline-none placeholder:text-muted-foreground/70"
              />
              <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Envoyer une photo" className="h-12 w-12 grid place-items-center rounded-full text-muted-foreground hover:bg-muted active:scale-90 transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
                {photoBusy ? <ImagePlus size={19} className="animate-pulse text-primary" /> : <Camera size={19} />}
              </button>
              <button onClick={() => send()} disabled={!input.trim() || sending} aria-label="Envoyer" className="k-btn-gold h-12 w-12 grid place-items-center rounded-full text-primary-foreground active:scale-90 transition-all disabled:opacity-50 shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
                <Send size={18} />
              </button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} aria-label="Photo à analyser" />
        <p className="mt-2 mb-1 flex items-center justify-center gap-1.5 text-[9.5px] text-muted-foreground">
          <ShieldCheck size={11} className="text-primary" /> Éducation cutanée — pas de prescription médicale
        </p>
      </div>
    </div>
  );
}
