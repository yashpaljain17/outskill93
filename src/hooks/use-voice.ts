"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings for the Web Speech API (not in lib.dom for all TS versions). */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceEngine = "elevenlabs" | "browser" | "none";

/**
 * Voice I/O. Uses ElevenLabs (via our API routes) when configured, otherwise the
 * browser's speech recognition and speech synthesis.
 */
export function useVoice() {
  const [engine, setEngine] = useState<VoiceEngine>("none");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/voice/status")
      .then((r) => r.json())
      .then((s: { elevenlabs: boolean }) => {
        if (!alive) return;
        const canRecord = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices;
        if (s.elevenlabs && canRecord) setEngine("elevenlabs");
        else if (getRecognitionCtor()) setEngine("browser");
        else setEngine("none");
      })
      .catch(() => setEngine(getRecognitionCtor() ? "browser" : "none"));
    return () => {
      alive = false;
    };
  }, []);

  /** Records one utterance and resolves with its transcript ("" if nothing was heard). */
  const listen = useCallback(async (): Promise<string> => {
    if (engine === "elevenlabs") return listenWithRecorder();
    if (engine === "browser") return listenWithBrowser();
    throw new Error("Voice input isn't supported in this browser. Try Chrome or Edge.");

    async function listenWithRecorder(): Promise<string> {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

      // Simple voice-activity detection: stop after ~1.3s of silence once speech started.
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let heard = false;
      let silentSince = performance.now();
      const startedAt = performance.now();
      let raf = 0;

      const done = new Promise<Blob | null>((resolve) => {
        let cancelled = false;
        cancelRef.current = () => {
          cancelled = true;
          if (recorder.state !== "inactive") recorder.stop();
        };
        recorder.onstop = () => {
          cancelAnimationFrame(raf);
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
          setLevel(0);
          resolve(cancelled || !heard ? null : new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
      });

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 6));
        const now = performance.now();
        if (rms > 0.035) {
          heard = true;
          silentSince = now;
        }
        const silentFor = now - silentSince;
        if ((heard && silentFor > 1300) || (!heard && now - startedAt > 8000) || now - startedAt > 30000) {
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        raf = requestAnimationFrame(tick);
      };

      recorder.start(250);
      setListening(true);
      raf = requestAnimationFrame(tick);
      const blob = await done;
      setListening(false);
      cancelRef.current = null;
      if (!blob) return "";

      const form = new FormData();
      form.append("audio", blob, "speech.webm");
      const res = await fetch("/api/voice/stt", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Transcription failed");
      return String(body.text ?? "");
    }

    function listenWithBrowser(): Promise<string> {
      const Ctor = getRecognitionCtor()!;
      return new Promise((resolve, reject) => {
        const rec = new Ctor();
        rec.lang = navigator.language || "en-US";
        rec.interimResults = false;
        rec.continuous = false;
        let transcript = "";
        rec.onresult = (e) => {
          transcript = Array.from(e.results)
            .map((r) => r[0]?.transcript ?? "")
            .join(" ");
        };
        rec.onerror = (e) => {
          if (e.error === "no-speech" || e.error === "aborted") return;
          reject(new Error(e.error === "not-allowed" ? "Microphone permission was denied." : `Speech error: ${e.error}`));
        };
        rec.onend = () => {
          setListening(false);
          setLevel(0);
          cancelRef.current = null;
          resolve(transcript.trim());
        };
        cancelRef.current = () => rec.abort();
        setListening(true);
        setLevel(0.5);
        rec.start();
      });
    }
  }, [engine]);

  /** Speaks text aloud; resolves when playback finishes or is stopped. */
  const speak = useCallback(
    async (text: string) => {
      const clean = text.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
      if (!clean) return;
      setSpeaking(true);
      try {
        if (engine === "elevenlabs") {
          const res = await fetch("/api/voice/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean.slice(0, 2500) }),
          });
          if (res.ok) {
            const url = URL.createObjectURL(await res.blob());
            const audio = new Audio(url);
            audioRef.current = audio;
            await new Promise<void>((resolve) => {
              audio.onended = () => resolve();
              audio.onerror = () => resolve();
              audio.onpause = () => resolve();
              audio.play().catch(() => resolve());
            });
            URL.revokeObjectURL(url);
            return;
          }
          // fall through to the browser voice on failure
        }
        if ("speechSynthesis" in window) {
          await new Promise<void>((resolve) => {
            const u = new SpeechSynthesisUtterance(clean);
            u.rate = 1.03;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
          });
        }
      } finally {
        audioRef.current = null;
        setSpeaking(false);
      }
    },
    [engine]
  );

  const stopAll = useCallback(() => {
    cancelRef.current?.();
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setListening(false);
    setSpeaking(false);
    setLevel(0);
  }, []);

  useEffect(() => stopAll, [stopAll]);

  return { engine, listening, speaking, level, listen, speak, stopAll };
}
