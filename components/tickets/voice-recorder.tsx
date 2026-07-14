"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Mic, Square, Trash2, X } from "lucide-react";

import type { AttachmentMeta } from "@/lib/attachments";
import { uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "./audio-player";

// 5-minute cap keeps files well under the 10MB attachment limit and avoids runaway
// recordings; the timer auto-stops at the cap.
const MAX_SECONDS = 300;

function supportsRecording(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

/** First supported container/codec — Chrome/Firefox use webm, Safari uses mp4. */
function pickMimeType(): string {
  for (const t of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ]) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* isTypeSupported can throw on some engines */
    }
  }
  return "";
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function extFor(type: string): string {
  if (type === "audio/mp4") return "m4a";
  if (type === "audio/ogg") return "ogg";
  return "webm";
}

type Phase = "idle" | "recording" | "uploading" | "done" | "error";

/**
 * Record a voice note in the browser (like a WhatsApp voice message) and upload
 * it as a ticket attachment — an accessible alternative to typing the problem.
 * Reports the finished AttachmentMeta (or null) to the parent, and its busy state
 * so the form can block submit while recording/uploading.
 */
export function VoiceRecorder({
  onChange,
  onBusyChange,
  disabled = false,
}: {
  onChange: (meta: AttachmentMeta | null) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(true);
  const [insecure, setInsecure] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  // Compute support after mount so SSR + first client render match (no hydration
  // mismatch); an unsupported browser just hides the recorder (typing still works).
  useEffect(() => {
    const ok = supportsRecording();
    setSupported(ok);
    // Distinguish "old browser" from "not on https" — mic access needs a secure
    // context, which trips up an internal app opened over a plain LAN http URL.
    setInsecure(
      !ok &&
        typeof window !== "undefined" &&
        window.isSecureContext === false
    );
  }, []);

  // Report busy (recording or uploading) so the form blocks submit until ready.
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;
  useEffect(() => {
    onBusyRef.current?.(phase === "recording" || phase === "uploading");
  }, [phase]);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const revokePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  };

  // Full teardown on unmount: stop the mic, timers, recorder, and object URLs.
  useEffect(() => {
    return () => {
      clearTimer();
      try {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.onstop = null;
          recorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      stopTracks();
      revokePreview();
    };
  }, []);

  async function doUpload(blob: Blob, type: string) {
    setPhase("uploading");
    const file = new File([blob], `voice-note-${Date.now()}.${extFor(type)}`, {
      type,
    });
    try {
      const url = await uploadFile(file);
      setPhase("done");
      onChange({
        url,
        filename: file.name,
        contentType: type,
        sizeBytes: file.size,
      });
    } catch (e) {
      setError((e as Error).message || "Couldn't upload the voice note.");
      setPhase("error");
    }
  }

  async function startRecording() {
    if (disabled) return;
    if (!supportsRecording()) {
      setSupported(false);
      setError("Voice recording isn't supported in this browser.");
      setPhase("error");
      return;
    }
    setError(null);
    // Discard any previous note first.
    revokePreview();
    setPreviewUrl(null);
    onChange(null);
    chunksRef.current = [];
    secondsRef.current = 0;
    setSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearTimer();
        stopTracks();
        const type =
          (recorder.mimeType || mimeType || "audio/webm").split(";")[0] ||
          "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (blob.size === 0) {
          setPhase("idle");
          setSeconds(0);
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        void doUpload(blob, type);
      };

      recorder.start();
      setPhase("recording");
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_SECONDS) {
          try {
            if (recorder.state === "recording") recorder.stop();
          } catch {
            /* ignore */
          }
        }
      }, 1000);
    } catch (e) {
      stopTracks();
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Microphone permission was denied — allow mic access to record."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "Couldn't start recording. You can type the description instead."
      );
      setPhase("error");
    }
  }

  function stopRecording() {
    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop(); // onstop builds the blob + uploads
      }
    } catch {
      /* ignore */
    }
  }

  function cancelRecording() {
    clearTimer();
    try {
      const r = recorderRef.current;
      if (r) {
        r.onstop = null; // don't build/upload a discarded take
        if (r.state === "recording") r.stop();
      }
    } catch {
      /* ignore */
    }
    stopTracks();
    chunksRef.current = [];
    secondsRef.current = 0;
    setSeconds(0);
    setPhase("idle");
  }

  function deleteNote() {
    revokePreview();
    setPreviewUrl(null);
    secondsRef.current = 0;
    setSeconds(0);
    setError(null);
    setPhase("idle");
    onChange(null);
  }

  if (!supported) {
    // On an insecure origin, tell the user why (typing still works either way).
    if (insecure) {
      return (
        <p className="mt-2 text-xs text-text-muted">
          Voice recording needs a secure (https) connection — type the
          description instead, or open the app over https.
        </p>
      );
    }
    return null;
  }

  return (
    <div className="mt-2 rounded-[var(--radius-input)] border border-border bg-surface-muted/40 p-3">
      {phase === "idle" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
            disabled={disabled}
          >
            <Mic className="size-4" /> Record voice note
          </Button>
          <span className="text-xs text-text-muted">
            Prefer speaking? Record your problem instead of typing.
          </span>
        </div>
      ) : null}

      {phase === "recording" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
            Recording
            <span className="font-mono tabular-nums text-text-muted">
              {fmt(seconds)}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" onClick={stopRecording}>
              <Square className="size-3.5" /> Stop
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelRecording}
              aria-label="Discard recording"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {(phase === "uploading" || phase === "done") && previewUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            {phase === "uploading" ? (
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <Loader2 className="size-3.5 animate-spin" /> Uploading voice note…
              </span>
            ) : (
              <span className="font-medium text-status-resolved">
                Voice note ready · {fmt(seconds)}
              </span>
            )}
            <button
              type="button"
              onClick={deleteNote}
              disabled={phase === "uploading"}
              className="ml-auto inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-muted hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
          <AudioPlayer src={previewUrl} className="w-full" />
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" /> {error}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("ml-auto")}
            onClick={startRecording}
            disabled={disabled}
          >
            <Mic className="size-4" /> Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
