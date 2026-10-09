"use client";
// Kènè Cliente — Chat Dr. Kènè: WhatsApp-like, micro serveur (ASR), triage
// photo IA, TTS. ÉCLAT 2026: bulles verre (IA) / dégradé terre-bissap
// (cliente), avatar NeaOnnim à halo doré, chips verre — présentation seule,
// logique chat (store persist, triage photo, TTS) inchangée.
// La conversation vit dans le store persist « kene-chat » (src/store/chat.ts):
// elle survit au changement d'onglet et au rechargement, sans les photos
// (base64 — mémoire de session uniquement, jamais dans localStorage).
//
// MICRO SERVEUR: la cliente parle → MediaRecorder (webm/opus,
// 12 s max, annulable) → POST /api/asr → la transcription arrive DANS LE
// CHAMP DE SAISIE — jamais d'envoi automatique, elle relit et valide.
// Safari (mp4/aac non supporté par le moteur) → ré-encodage WAV mono via
// WebAudio avant l'envoi (toAsrBlob). Remplace la dictée webkitSpeechRecognition
// (Chrome-only, navigateur) par l'ASR serveur — disponible partout.
//
// CONFORMITÉ MATÉRIEL: Demande d'autorisation explicite pour chaque accès
// au matériel du téléphone (Microphone & Caméra/Galerie) avec garantie de
// confidentialité médicale stricte.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CircleCheck,
  ImagePlus,
  Loader2,
  Lock,
  Mic,
  OctagonAlert,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Square,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost, resizeImage } from "@/lib/kene/api";
import { KeneEmblem, NeaOnnimIcon, CauriIcon } from "@/components/kene/icons";
import { Chip, IconBadge } from "@/components/kene/ui2026";
import { useKene } from "@/store/kene";
import { useChat } from "@/store/chat";
import type { ChatMsg } from "./types";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { LiveCameraModal } from "./LiveCameraModal";
import { playSpeech, stopBrowserVoice, unlockAudioContext, type SpeechController } from "./ttsAudio";
import { SpeakButton } from "./SpeakButton";
import { isHardwarePermGranted, saveHardwarePermGranted, syncHardwarePermissions } from "@/lib/kene/hardware-perm";

export interface QuickSuggestion {
  theme: string;
  question: string;
  iconText: string;
}

export const THEMED_SUGGESTIONS: QuickSuggestion[] = [
  { theme: "Taches", question: "Comment estomper mes taches d'hyperpigmentation ?", iconText: "🪞" },
  { theme: "Sébum", question: "Ma peau brille à midi, quelle routine matifiante adopter ?", iconText: "💧" },
  { theme: "Solaire", question: "Faut-il vraiment mettre une crème solaire sur peau noire ?", iconText: "☀️" },
  { theme: "Actifs", question: "Peut-on associer Niacinamide et Vitamine C sans risque ?", iconText: "🌿" },
  { theme: "Boutons", question: "Comment éviter les cicatrices noires après un bouton ?", iconText: "🛡️" },
  { theme: "Cheveux", question: "Que faire pour fortifier mes bordures de tempes ?", iconText: "👑" },
  { theme: "Karité", question: "Le beurre de karité est-il adapté à ma zone T ?", iconText: "🌰" },
];

/** Contrat badge cloche chat (63-a): un message de Dr. Kènè vient d'arriver
 * — c'est le SEUL point de couplage, l'événement est figé. */
function notifyChatNew() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kene:chat:new", { detail: { at: Date.now() } }));
  }
}

/* ── Micro serveur — types & helpers purs ── */
type MicState = "idle" | "recording" | "transcribing" | "unavailable";

/** 30 s max d'enregistrement (couvre amplement l'explication d'un souci cutané). */
const MAX_RECORD_MS = 30_000;

function mmss(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/** webm/opus si supporté (Chrome/Android/Firefox); undefined sinon → Safari
 * enregistre en mp4/aac, converti en WAV par toAsrBlob avant l'envoi. */
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

/** Le moteur ASR n'accepte QUE WAV et WebM (erreur amont explicite): tout
 * autre conteneur (mp4/aac Safari) est ré-encodé en WAV mono 16 bits via
 * WebAudio — conversion minimale côté client, documentée dans la route. */
async function toAsrBlob(blob: Blob): Promise<Blob> {
  const t = blob.type.toLowerCase();
  if (t.includes("wav")) return blob;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return blob; // dernier recours: tenter l'envoi tel quel
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
    console.warn("[kene:asr:transcode]", err);
    return blob;
  } finally {
    void ctx.close();
  }
}

const TRIAGE = {
  vert: { border: "border-l-4 border-success", bg: "bg-success/5", text: "text-success", Icon: CircleCheck, cta: "Voir la boutique", tab: "boutique" as const },
  jaune: { border: "border-l-4 border-gold", bg: "bg-gold/5", text: "text-gold-text", Icon: TriangleAlert, cta: "Prendre RDV", tab: "rdv" as const },
  rouge: { border: "border-l-4 border-bissap", bg: "bg-bissap/5", text: "text-destructive", Icon: OctagonAlert, cta: "Voir les instituts", tab: "rdv" as const },
};

/* ── Déverrouillage audio préventif mobile ── */

/** Déverrouillage préventif de l'AudioContext pour les navigateurs mobiles (iOS Safari / Android Chrome)
 * afin que la réponse vocale automatique de Dr. Kènè démarre immédiatement sans blocage autoplay. */
function primeAudioContext() {
  unlockAudioContext();
}

/* Ids uniques entre sessions: un simple compteur entrerait en collision avec
 les ids persistés ("m1" déjà pris par un ancien message) → préfixe horodaté. */
let idCounter = 0;
const nid = () => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** Bulle de note vocale WhatsApp-style avec lecteur interactif et ondes sonores */
function AudioMessageBubble({ message }: { message: ChatMsg }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlay = () => {
    if (!message.audioUrl) {
      toast.info("Audio de la session précédente — texte conservé ci-dessous");
      return;
    }
    if (!audioRef.current) {
      const a = new Audio(message.audioUrl);
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      a.ontimeupdate = () => {
        if (a.duration && !isNaN(a.duration) && a.duration > 0) {
          setProgress(a.currentTime / a.duration);
        }
      };
      audioRef.current = a;
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        toast.error("Impossible de lire l'audio");
      });
      setPlaying(true);
    }
  };

  const dur = message.audioDuration || 0;

  return (
    <div className="k-cta rounded-[20px] rounded-br-[6px] p-3 text-[#FFF9EC] min-w-[210px] sm:min-w-[250px] shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Mettre en pause" : "Écouter la note vocale"}
          className="h-10 w-10 shrink-0 rounded-full bg-[#FFF9EC]/20 hover:bg-[#FFF9EC]/30 active:scale-95 transition-all flex items-center justify-center text-[#FFF9EC] shadow-sm focus-visible:outline-2 focus-visible:outline-white"
        >
          {playing ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
          {/* Ondes sonores animées interactives */}
          <div className="flex items-center gap-[3px] h-5 py-0.5" aria-hidden="true">
            {[45, 75, 50, 90, 60, 100, 45, 80, 50, 95, 70, 85, 40, 65, 85, 55].map((h, i) => {
              const active = progress > i / 16;
              return (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`w-[2.5px] rounded-full transition-all duration-150 ${
                    active ? "bg-[#FFF9EC]" : "bg-[#FFF9EC]/40"
                  } ${playing ? "animate-pulse" : ""}`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#FFF9EC]/80 font-mono font-medium">
            <span>{dur > 0 ? mmss(dur) : "Note vocale"}</span>
            <span className="flex items-center gap-1 opacity-90 text-[9.5px]">
              <Mic size={11} className="text-[#E0A838]" /> Note vocale
            </span>
          </div>
        </div>
      </div>

      {/* Retranscription mot à mot affichée sous la note vocale */}
      {message.transcription ? (
        <div className="mt-2.5 pt-2 border-t border-white/15">
          <p className="text-[11.5px] italic text-[#FFF9EC]/95 leading-relaxed font-sans">
            « {message.transcription} »
          </p>
        </div>
      ) : null}
    </div>
  );
}

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

  // Sélecteur de source photo & Caméra Live (zéro modal bloquant de permission)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [micHelpOpen, setMicHelpOpen] = useState(false);
  const [liveCamOpen, setLiveCamOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronisation proactive avec les permissions réelles du navigateur / appareil
  useEffect(() => {
    void syncHardwarePermissions();
  }, []);

  // Rehydratation paresseuse et idempotente (pattern use-t.ts): le premier
  // montage relit le localStorage persisté; les montages suivants ne
  // relisent PAS — les photos de session restent en mémoire (hasHydrated
  // évite qu'une relecture n'écrase le fil courant sans ses photos).
  useEffect(() => {
    if (!useChat.persist.hasHydrated()) void useChat.persist.rehydrate();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  /* ── Micro serveur: machine à états idle → recording → transcribing ── */

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

  /** Rendu du flux: le micro s'éteint réellement (getUserMedia +
   * recorder.stream, tous deux référencés — même objet en pratique). */
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

  // Démontage (changement d'onglet): plus aucune piste/timer ne survit,
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
    unlockAudioContext();
    if (micState !== "idle") return;
    if (
      typeof window === "undefined" ||
      typeof window.MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setMicState("idle");
      toast.error("L'enregistrement vocal n'est pas supporté par ce navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      saveHardwarePermGranted();
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
        void sendAudioRecording();
      };
      rec.start(250); // segments réguliers → robuste à un stop à tout instant
      setMicState("recording");
      setMicElapsed(0);
      tickRef.current = setInterval(() => setMicElapsed((s) => s + 1), 1000);
      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_RECORD_MS);
    } catch {
      // Permission refusée / bloquée dans les paramètres du navigateur
      releaseStream();
      setMicState("idle");
      setMicHelpOpen(true);
    }
  }

  function stopRecording() {
    if (micState !== "recording") return;
    primeAudioContext(); // Déverrouillage AudioContext pour mobile afin d'autoriser l'autoplay de la réponse
    clearMicTimers();
    const rec = recorderRef.current;
    if (rec?.state === "recording") rec.stop(); // → onstop → sendAudioRecording
  }

  function cancelRecording() {
    if (micState !== "recording") return;
    cancelledRef.current = true;
    clearMicTimers();
    const rec = recorderRef.current;
    if (rec?.state === "recording") {
      rec.stop(); // onstop → annulé, aucun envoi
    } else {
      releaseStream();
      resetMic();
    }
  }

  async function sendAudioRecording() {
    const elapsed = micElapsed;
    releaseStream();
    clearMicTimers();
    if (cancelledRef.current) {
      resetMic();
      return;
    }
    const type = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    if (blob.size < 1200) {
      resetMic();
      toast.info("Aucun son capté — réessaie");
      return;
    }

    resetMic();

    // 1. URL locale pour réécoute instantanée dans la bulle vocale
    const audioUrl = URL.createObjectURL(blob);
    const audioDuration = Math.max(elapsed, 1);
    const userMsgId = nid();

    // 2. Ajout immédiat de la bulle vocale dans le fil de discussion
    const userVoiceMsg: ChatMsg = {
      id: userMsgId,
      role: "user",
      content: `Note vocale (${mmss(audioDuration)})`,
      kind: "audio",
      audioUrl,
      audioDuration,
      time: Date.now(),
    };
    add(userVoiceMsg);
    setSending(true);

    try {
      const payload = await toAsrBlob(blob);
      const audioBase64 = await blobToBase64(payload);

      // Historique des messages précédents pour conserver le fil clinique
      const history = messages
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.transcription || m.content }));

      // Envoi direct de l'audio à Dr. Kènè (aucun intermédiaire textuel dans le champ)
      const r = await apiPost<{ reply: string; transcription?: string }>(
        "/api/dermato/chat",
        {
          audio: audioBase64,
          mimeType: payload.type,
          messages: history,
          userId: user.id,
        },
        { timeoutMs: 45_000 }
      );

      // Si le modèle a extrait une retranscription fidèle, on enrichit la bulle
      if (r?.transcription) {
        useChat.setState((state) => ({
          messages: state.messages.map((m) =>
            m.id === userMsgId ? { ...m, transcription: r.transcription } : m
          ),
        }));
      }

      // 3. Réponse directe et bienveillante de Dr. Kènè
      const assistantMsgId = nid();
      add({
        id: assistantMsgId,
        role: "assistant",
        content: r.reply,
        kind: "text",
        time: Date.now(),
      });
      notifyChatNew();
      // LECTURE AUDIO AUTOMATIQUE : L'utilisateur s'est exprimé en audio,
      // la lecture vocale de la réponse de Dr. Kènè démarre immédiatement et automatiquement !
      speak(r.reply, true, assistantMsgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi de la note vocale");
      add({
        id: nid(),
        role: "assistant",
        content: "Pardon, je n'ai pas pu recevoir ta note vocale. Peux-tu me la réenregistrer ?",
        kind: "text",
        time: Date.now(),
      });
      notifyChatNew();
    } finally {
      setSending(false);
    }
  }

  const currentAudioCtrlRef = useRef<SpeechController | null>(null);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  const stopCurrentSpeech = useCallback(() => {
    currentAudioCtrlRef.current?.stop();
    currentAudioCtrlRef.current = null;
    stopBrowserVoice();
    setPlayingMsgId(null);
  }, []);

  useEffect(() => {
    return () => {
      currentAudioCtrlRef.current?.stop();
      currentAudioCtrlRef.current = null;
      stopBrowserVoice();
      setPlayingMsgId(null);
    };
  }, []);

  const speak = useCallback(
    (text: string, force = false, messageId?: string) => {
      if ((!ttsOn && !force) || typeof window === "undefined") return;
      unlockAudioContext();
      currentAudioCtrlRef.current?.stop();
      currentAudioCtrlRef.current = null;
      stopBrowserVoice();
      if (messageId) setPlayingMsgId(messageId);

      void playSpeech({
        text,
        speed: 1,
        lang: "fr",
        onStart: () => {
          if (messageId) setPlayingMsgId(messageId);
          toast.info("🔊 Dermo Kènè vous répond à voix haute", {
            description: "Conseil : vérifiez que le son de votre téléphone est activé (bouton silencieux / vibreur désactivé).",
            duration: 4500,
          });
        },
        onEnd: () => {
          currentAudioCtrlRef.current = null;
          setPlayingMsgId(null);
        },
        onError: () => {
          currentAudioCtrlRef.current = null;
          setPlayingMsgId(null);
        },
      })
        .then((ctrl) => {
          currentAudioCtrlRef.current = ctrl;
        })
        .catch(() => {
          setPlayingMsgId(null);
        });
    },
    [ttsOn]
  );

  async function send(text?: string) {
    unlockAudioContext();
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    const mine: ChatMsg = { id: nid(), role: "user", content, kind: "text", time: Date.now() };
    add(mine); // le store re-sème le message d'accueil si le fil est vide
    setSending(true);
    try {
      // Transport compact: 10 derniers messages avec texte complet préservé (incluant transcriptions vocales)
      const history = [...messages, mine]
        .slice(-10)
        .map((m) => ({ role: m.role, content: (m.transcription || m.content).slice(0, 1500) }));
      const r = await apiPost<{ reply: string }>("/api/dermato/chat", { messages: history, userId: user.id }, { timeoutMs: 35_000 });
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

  async function processPhotosDataUrls(dataUrls: string[]) {
    if (photoBusy || dataUrls.length === 0) return;
    setPhotoBusy(true);
    try {
      const isMulti = dataUrls.length > 1;
      const countLabel = isMulti
        ? `Regarde ces ${dataUrls.length} photos sous différents angles, s'il te plaît.`
        : "Regarde cette zone, stp.";

      // La photo vit en mémoire de session: jamais persistée (partialize du
      // store la retire), le fil texte lui survit.
      add({
        id: nid(),
        role: "user",
        content: countLabel,
        kind: "photo",
        photo: dataUrls[0],
        photos: dataUrls,
        time: Date.now(),
      });
      setSending(true);

      const r = await apiPost<{ niveau: "vert" | "jaune" | "rouge"; message: string }>(
        "/api/dermato/photo",
        { images: dataUrls, image: dataUrls[0], userId: user.id }
      );
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

  async function processPhotoDataUrl(dataUrl: string) {
    await processPhotosDataUrls([dataUrl]);
  }

  async function onPhotoFiles(files: File[]) {
    if (!files || files.length === 0 || photoBusy) return;
    try {
      const slice = files.slice(0, 4);
      if (slice.length > 1) {
        toast.info(`Optimisation de ${slice.length} photos...`);
      }
      const dataUrls = await Promise.all(slice.map((f) => resizeImage(f)));
      await processPhotosDataUrls(dataUrls);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de charger les photos");
    }
  }

  async function onPhotoFile(f: File | undefined) {
    if (f) await onPhotoFiles([f]);
  }

  return (
    <div className="flex flex-col min-h-[68vh] pt-4">
      <header className="flex items-center gap-3 pb-3 border-b border-border">
        <span className="relative shrink-0">
          {/* Sceau 2026 — le Médaillon Kènè est l'avatar du Dr. Kènè */}
          <span className="k-glow-gold inline-grid rounded-[14px]">
            <KeneEmblem size={40} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#346834] border-2 border-background" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 md:hidden">
          <p className="font-heading font-bold text-sm">Dermo Kènè <span className="text-xs font-mono font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-md">IA</span></p>
          <p className="text-xs text-success font-semibold">Conseillère dermo-cosmétique · En ligne</p>
        </div>
        <div className="hidden md:flex items-center gap-2 min-w-0 flex-1">
          <span className="h-2 w-2 rounded-full bg-[#346834] animate-pulse" aria-hidden="true" />
          <p className="text-xs text-muted-foreground font-medium">Assistant dermo-conseil IA &amp; éducation cutanée (non-médecin)</p>
        </div>
        <button
          onClick={() => {
            setTtsOn((v) => {
              const next = !v;
              if (!next) {
                stopCurrentSpeech();
              }
              return next;
            });
          }}
          aria-pressed={ttsOn}
          aria-label={ttsOn ? "Désactiver la lecture vocale" : "Activer la lecture vocale"}
          title={ttsOn ? "Voix automatique activée (cliquer pour couper)" : "Activer la voix de Dermo Kènè"}
          className={`h-10 w-10 grid place-items-center rounded-full active:scale-90 transition-all focus-visible:outline-2 focus-visible:outline-primary ${ttsOn ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground"}`}
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
                <motion.div key={m.id} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="self-end max-w-[85%]">
                  {m.photos && m.photos.length > 1 ? (
                    <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                      {m.photos.map((p, idx) => (
                        <img
                          key={idx}
                          src={p}
                          alt={`Photo ${idx + 1}`}
                          className="rounded-xl max-h-36 w-full object-cover border border-border shadow-sm"
                        />
                      ))}
                    </div>
                  ) : m.photo ? (
                    <img src={m.photo} alt="Photo envoyée" className="rounded-[20px] rounded-br-[6px] mb-1.5 max-h-52 object-cover border border-border" />
                  ) : null}
                  {m.kind === "audio" ? (
                    <AudioMessageBubble message={m} />
                  ) : (
                    <div className="k-cta rounded-[20px] rounded-br-[6px] px-3.5 py-2.5 text-[#FFF9EC]">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground text-right mt-1 font-medium">{new Date(m.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
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
                        <p className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wide ${tri.text} mb-1.5`}>
                          <tri.Icon size={14} />
                          {m.niveau === "vert" ? "Rassurant" : m.niveau === "jaune" ? "À surveiller" : "Consultation conseillée"}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  </div>
                  {tri && (
                    <button
                      onClick={() => setClientTab(tri.tab)}
                      className={`mt-1.5 h-9 px-3.5 rounded-full ${tri.text} border ${m.niveau === "vert" ? "border-[#346834]/50 bg-[#346834]/10" : m.niveau === "jaune" ? "border-[#C8951E]/50 bg-[#C8951E]/10" : "border-[#8B1A3B]/50 bg-[#8B1A3B]/10"} text-xs font-bold active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary`}
                    >
                      {tri.cta} →
                    </button>
                  )}
                  <div className="flex items-center justify-between gap-3 mt-1.5 px-0.5">
                    <p className="text-xs text-muted-foreground font-medium">Dermo Kènè · {new Date(m.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                    {playingMsgId === m.id ? (
                      <button
                        type="button"
                        onClick={stopCurrentSpeech}
                        aria-label="Arrêter la voix de Dermo Kènè"
                        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-xs active:scale-95 transition-all"
                      >
                        <span className="flex items-end gap-[2px] h-3 mr-0.5" aria-hidden="true">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className="w-[2px] h-full bg-primary-foreground rounded-full animate-pulse"
                              style={{ animationDelay: `${i * 150}ms` }}
                            />
                          ))}
                        </span>
                        <Square size={10} className="fill-current" />
                        <span>Pause</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          unlockAudioContext();
                          speak(m.content, true, m.id);
                        }}
                        aria-label="Écouter la réponse de Dermo Kènè"
                        className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[10px] font-bold min-h-0 border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary rounded-full active:scale-95 transition-all"
                      >
                        <Volume2 size={12} />
                        <span>Écouter</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {sending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start flex items-end gap-2">
              <IconBadge icon={<NeaOnnimIcon size={14} />} size="sm" tone="gold" className="h-8 w-8 rounded-[10px]" />
              <div className="k-card rounded-[20px] rounded-bl-[6px] px-4 py-3 flex gap-1.5" aria-label="Dermo Kènè écrit">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-primary" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggestions initiales complètes si conversation vide */}
      {messages.length <= 1 && !sending && (
        <div className="flex flex-col gap-2 py-3">
          <p className="text-xs text-muted-foreground font-medium">Questions fréquentes pour démarrer :</p>
          <div className="flex flex-col gap-2">
            {THEMED_SUGGESTIONS.slice(0, 3).map((s) => (
              <Chip
                key={s.question}
                selected={false}
                onClick={() => {
                  haptic(HAPTIC.light);
                  send(s.question);
                }}
                className="self-start text-left"
              >
                {s.iconText} {s.question}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Ruban horizontal de questions thématiques rapides toujours accessible */}
      {!sending && (
        <div className="pt-2 pb-1 overflow-x-auto no-scrollbar flex items-center gap-2 -mx-1 px-1">
          {THEMED_SUGGESTIONS.map((s) => (
            <button
              key={s.theme}
              type="button"
              onClick={() => {
                haptic(HAPTIC.light);
                send(s.question);
              }}
              title={s.question}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/70 bg-card/85 hover:bg-primary/10 hover:border-primary/40 active:scale-95 transition-all text-foreground shadow-2xs"
            >
              <span aria-hidden="true" className="text-sm">{s.iconText}</span>
              <span className="font-semibold">{s.theme}</span>
            </button>
          ))}
        </div>
      )}

      {/* Saisie */}
      <div className="sticky bottom-0 pt-2">
        <div className="k-card flex items-center gap-2 rounded-[20px] p-2">
          {micState === "recording" ? (
            <>
              {/* Annulation: jette l'enregistrement sans rien envoyer */}
              <button
                type="button"
                onClick={cancelRecording}
                aria-label="Annuler l'enregistrement"
                title="Annuler la note vocale"
                className="h-11 w-11 grid place-items-center rounded-full shrink-0 text-muted-foreground hover:bg-muted active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X size={19} />
              </button>

              {/* Timer + ondes d'enregistrement */}
              <div className="h-12 min-w-0 flex-1 flex items-center gap-2.5 rounded-2xl bg-bissap/8 border border-bissap/25 px-3.5" role="status">
                <span className="sr-only">Enregistrement de la note vocale en cours — 30 secondes maximum</span>
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bissap opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-bissap" />
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-bissap" aria-hidden="true">{mmss(micElapsed)}</span>
                <span className="flex items-end gap-[3px] h-3.5" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[3px] h-full rounded-full bg-bissap/70"
                      animate={{ scaleY: [0.35, 1, 0.5, 0.85, 0.35] }}
                      transition={{ duration: 0.95, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                    />
                  ))}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0 font-medium" aria-hidden="true">max 30 s</span>
              </div>

              {/* Bouton ENVOYER direct de la note vocale à Dermo Kènè */}
              <button
                type="button"
                onClick={stopRecording}
                aria-label="Envoyer la note vocale à Dermo Kènè"
                title="Envoyer la note vocale à Dermo Kènè"
                className="k-btn-gold h-12 w-12 grid place-items-center rounded-full text-primary-foreground active:scale-90 transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-primary shadow-md"
              >
                <Send size={18} />
              </button>
            </>
          ) : (
            <>
              {/* Micro: Enregistrement vocal direct sans modal intermédiaire */}
              <button
                type="button"
                onClick={() => {
                  void startRecording();
                }}
                disabled={micState === "transcribing"}
                aria-label="Parler à Dermo Kènè"
                title="Enregistrer et envoyer une note vocale à Dermo Kènè"
                className="h-11 w-11 grid place-items-center rounded-full shrink-0 text-muted-foreground hover:bg-muted active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
              >
                {micState === "transcribing" ? <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" /> : <Mic size={19} />}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                placeholder="Écris ou envoie une note vocale à Dermo Kènè…"
                aria-label="Message pour Dermo Kènè"
                className="k-input h-12 min-w-0 flex-1 rounded-2xl px-3.5 text-sm outline-none placeholder:text-muted-foreground/70"
              />
              {/* Photo: Choix de la source (Caméra Live ou Galerie) */}
              <button
                type="button"
                onClick={() => setPhotoPickerOpen(true)}
                disabled={photoBusy}
                aria-label="Envoyer une photo à Dermo Kènè"
                title="Envoyer une photo à Dermo Kènè"
                className="h-12 w-12 grid place-items-center rounded-full text-muted-foreground hover:bg-muted active:scale-90 transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
              >
                {photoBusy ? <Loader2 size={19} className="animate-spin text-primary" /> : <Camera size={19} />}
              </button>
              <button
                type="button"
                onClick={() => send()}
                disabled={!input.trim() || sending}
                aria-label="Envoyer"
                className="k-btn-gold h-12 w-12 grid place-items-center rounded-full text-primary-foreground active:scale-90 transition-all disabled:opacity-50 shrink-0 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Send size={18} />
              </button>
            </>
          )}
        </div>
        <p className="mt-2 mb-1 flex items-center justify-center gap-1.5 text-[9.5px] text-muted-foreground text-center px-2">
          <ShieldCheck size={11} className="text-primary shrink-0" />
          <span>Orientation dermo-cosmétique IA · Ne pose aucun diagnostic médical et ne remplace pas un dermatologue</span>
        </p>
      </div>

      {/* Hidden inputs pour la capture photo et galerie */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) void onPhotoFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPhotoFiles([file]);
          e.target.value = "";
        }}
      />

      {/* ── Modal Caméra Live ── */}
      {liveCamOpen && (
        <LiveCameraModal
          zoneLabel="Visage / Peau"
          onCapture={(dataUrl) => {
            setLiveCamOpen(false);
            void processPhotoDataUrl(dataUrl);
          }}
          onClose={() => setLiveCamOpen(false)}
        />
      )}

      {/* ── Sélecteur de source Photo (Live / Appareil natif / Galerie) ── */}
      <AnimatePresence>
        {photoPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] bg-card border border-border shadow-2xl p-5 sm:p-6 pb-8 sm:pb-6 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="photo-picker-title"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-2xl bg-primary/15 text-primary grid place-items-center shadow-sm">
                    <Camera size={20} />
                  </span>
                  <div>
                    <h3 id="photo-picker-title" className="font-heading font-black text-sm text-foreground">
                      Joindre une photo
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Pour votre échange avec Dermo Kènè
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoPickerOpen(false)}
                  className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted text-muted-foreground active:scale-95 transition-all"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2.5 pt-3">
                {/* Option 1: Live Camera (avec guide facial et contrôle d'éclairage) */}
                <button
                  type="button"
                  onClick={() => {
                    saveHardwarePermGranted();
                    setPhotoPickerOpen(false);
                    setLiveCamOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border-2 border-primary/60 bg-primary/10 hover:bg-primary/15 text-left active:scale-[0.99] transition-all group shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                      <Camera size={19} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">Prendre une photo en direct</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                          Recommandé
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Guide facial ovale &amp; vérification de la lumière en temps réel
                      </p>
                    </div>
                  </div>
                  <CauriIcon size={16} className="text-primary shrink-0 mr-1" />
                </button>

                {/* Option 2: Appareil photo natif smartphone */}
                <button
                  type="button"
                  onClick={() => {
                    saveHardwarePermGranted();
                    setPhotoPickerOpen(false);
                    nativeCameraInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-card hover:bg-muted/50 text-left active:scale-[0.99] transition-all"
                >
                  <span className="h-10 w-10 rounded-xl bg-muted grid place-items-center text-foreground shrink-0">
                    <Smartphone size={19} />
                  </span>
                  <div>
                    <span className="text-xs font-bold text-foreground">Appareil photo du téléphone</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Déclencher l&apos;application appareil photo native de votre téléphone
                    </p>
                  </div>
                </button>

                {/* Option 3: Galerie photo */}
                <button
                  type="button"
                  onClick={() => {
                    saveHardwarePermGranted();
                    setPhotoPickerOpen(false);
                    galleryInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-card hover:bg-muted/50 text-left active:scale-[0.99] transition-all"
                >
                  <span className="h-10 w-10 rounded-xl bg-muted grid place-items-center text-foreground shrink-0">
                    <ImagePlus size={19} />
                  </span>
                  <div>
                    <span className="text-xs font-bold text-foreground">Choisir dans la galerie</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Sélectionnez une ou plusieurs photos (face, profil, gros plan)
                    </p>
                  </div>
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setPhotoPickerOpen(false)}
                  className="w-full h-10 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal d'aide Microphone Bloqué ── */}
      <AnimatePresence>
        {micHelpOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-t-[32px] sm:rounded-[32px] bg-card border border-border shadow-2xl p-5 sm:p-6 pb-8 sm:pb-6 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mic-help-title"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-2xl bg-gold/15 text-gold-text grid place-items-center shadow-sm">
                    <Lock size={20} />
                  </span>
                  <div>
                    <h3 id="mic-help-title" className="font-heading font-black text-sm text-foreground">
                      Microphone bloqué dans le navigateur
                    </h3>
                    <p className="text-[11px] text-muted-foreground">Activation des autorisations</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMicHelpOpen(false)}
                  className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted text-muted-foreground active:scale-95 transition-all"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="my-4 space-y-3">
                <p className="text-xs text-foreground/90 leading-relaxed">
                  Votre navigateur bloque actuellement l&apos;accès au microphone pour Kènè. Pour le débloquer sur votre téléphone :
                </p>

                <div className="space-y-2 rounded-2xl bg-muted/40 border border-border/60 p-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/20 text-primary font-bold text-[10px] grid place-items-center shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="text-muted-foreground leading-snug">
                      Touchez l&apos;icône de cadenas <strong className="text-foreground">🔒</strong> ou de paramètres dans la barre d&apos;adresse (en haut ou en bas).
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/20 text-primary font-bold text-[10px] grid place-items-center shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="text-muted-foreground leading-snug">
                      Activez ou autorisez l&apos;option <strong className="text-foreground">Microphone</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/20 text-primary font-bold text-[10px] grid place-items-center shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="text-muted-foreground leading-snug">
                      Revenez ici et touchez <strong className="text-foreground">Réessayer</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMicHelpOpen(false);
                    void startRecording();
                  }}
                  className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all hover:opacity-90"
                >
                  <RotateCcw size={16} />
                  Réessayer l&apos;autorisation
                </button>
                <button
                  type="button"
                  onClick={() => setMicHelpOpen(false)}
                  className="w-full h-10 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
