"use client";
// Kènè Cliente — Chat Dr. Kènè : WhatsApp-like, STT fr-FR, triage photo IA, TTS.
// La conversation vit dans le store persist « kene-chat » (src/store/chat.ts) :
// elle survit au changement d'onglet et au rechargement, sans les photos
// (base64 — mémoire de session uniquement, jamais dans localStorage).
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, CircleCheck, ImagePlus, Mic, OctagonAlert, Send, ShieldCheck, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { apiPost, resizeImage } from "@/lib/kene/api";
import { DuafeIcon } from "@/components/kene/icons";
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

/* ── SpeechRecognition (webkit) typé maison ── */
interface SRResult { 0: { transcript: string }; isFinal: boolean }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRCtor = new () => SRLike;

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
  const [listening, setListening] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SRLike | null>(null);
  const srSupported = useRef<boolean>(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    srSupported.current = Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  }, []);

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

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return toast.info("Dictée vocale non supportée par ce navigateur — essaie Chrome.");
    try {
      const rec = new Ctor();
      recRef.current = rec;
      rec.lang = "fr-FR";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (e: SREvent) => {
        const res = e.results[e.results.length - 1];
        const t = res?.[0]?.transcript ?? "";
        if (t) setInput((prev) => (prev ? `${prev} ${t}` : t));
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start();
      setListening(true);
    } catch {
      toast.error("Micro indisponible");
    }
  }

  return (
    <div className="flex flex-col min-h-[68vh] pt-4">
      <header className="flex items-center gap-3 pb-3 border-b border-border">
        <span className="relative grid place-items-center h-11 w-11 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] shadow shrink-0">
          <DuafeIcon size={22} />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#3F7D3F] border-2 border-background" aria-hidden="true" />
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
                  {m.photo && <img src={m.photo} alt="Photo envoyée" className="rounded-2xl rounded-br-md mb-1.5 max-h-52 object-cover border border-border" />}
                  <div className="rounded-2xl rounded-br-md bg-primary/90 text-primary-foreground px-3.5 py-2.5 shadow">
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                  <p className="text-[9px] text-muted-foreground text-right mt-1">{new Date(m.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                </motion.div>
              );
            }
            const tri = m.niveau ? TRIAGE[m.niveau] : null;
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="self-start max-w-[86%] flex items-end gap-2">
                <span className="grid place-items-center h-8 w-8 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] shrink-0 mb-4">
                  <DuafeIcon size={15} />
                </span>
                <div>
                  <div className={`rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 shadow-sm ${tri ? `${tri.border} ${tri.bg}` : ""}`}>
                    {tri && (
                      <p className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide ${tri.text} mb-1.5`}>
                        <tri.Icon size={13} />
                        {m.niveau === "vert" ? "Rassurant" : m.niveau === "jaune" ? "À surveiller" : "Consultation conseillée"}
                      </p>
                    )}
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                  {tri && (
                    <button
                      onClick={() => setClientTab(tri.tab)}
                      className={`mt-1.5 h-9 px-3.5 rounded-full ${tri.text} border ${m.niveau === "vert" ? "border-[#3F7D3F]/50 bg-[#3F7D3F]/10" : m.niveau === "jaune" ? "border-[#C8951E]/50 bg-[#C8951E]/10" : "border-[#8B1A3B]/50 bg-[#8B1A3B]/10"} text-[11px] font-bold active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary`}
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
              <span className="grid place-items-center h-8 w-8 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] shrink-0">
                <DuafeIcon size={15} />
              </span>
              <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm flex gap-1.5" aria-label="Dr. Kènè écrit">
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
            <button key={s} onClick={() => send(s)} className="self-start rounded-full border border-primary/40 bg-primary/5 px-4 py-2.5 text-xs font-medium text-left text-primary active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Saisie */}
      <div className="sticky bottom-0 pt-2">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg">
          <button
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label="Dicter mon message"
            title={srSupported.current ? "Dictée vocale" : "Dictée non supportée par ce navigateur"}
            className={`h-11 w-11 grid place-items-center rounded-full shrink-0 active:scale-90 transition-all focus-visible:outline-2 focus-visible:outline-primary ${listening ? "bg-destructive text-white animate-pulse" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Mic size={19} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            placeholder={listening ? "Je t'écoute…" : "Écris à Dr. Kènè…"}
            aria-label="Message pour Dr. Kènè"
            className="flex-1 min-w-0 bg-transparent px-1 py-2.5 text-sm rounded-lg outline-none placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-primary"
          />
          <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Envoyer une photo" className="h-11 w-11 grid place-items-center rounded-full text-muted-foreground hover:bg-muted active:scale-90 transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
            {photoBusy ? <ImagePlus size={19} className="animate-pulse text-primary" /> : <Camera size={19} />}
          </button>
          <button onClick={() => send()} disabled={!input.trim() || sending} aria-label="Envoyer" className="h-11 w-11 grid place-items-center rounded-full bg-primary text-primary-foreground shadow active:scale-90 transition-all disabled:opacity-50 shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
            <Send size={18} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} aria-label="Photo à analyser" />
        <p className="mt-2 mb-1 flex items-center justify-center gap-1.5 text-[9.5px] text-muted-foreground">
          <ShieldCheck size={11} className="text-primary" /> Éducation cutanée — pas de prescription médicale
        </p>
      </div>
    </div>
  );
}
