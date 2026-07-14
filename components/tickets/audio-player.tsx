"use client";

import { useRef } from "react";

/**
 * Audio playback for voice notes. MediaRecorder streams WebM without a duration
 * in the container header, so a plain <audio> reports duration=Infinity and its
 * seek bar is dead. On metadata load we force the browser to compute the real
 * duration (seek far past the end, then snap back to 0) — after which the seek
 * bar works. No-ops for well-formed files (mp4/ogg) that already have a duration.
 */
export function AudioPlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const fixedRef = useRef(false);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      src={src}
      controls
      preload="metadata"
      className={className}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        if (fixedRef.current) return;
        if (el.duration === Infinity || Number.isNaN(el.duration)) {
          fixedRef.current = true;
          const onSeeked = () => {
            el.removeEventListener("seeked", onSeeked);
            // Snap back so playback still starts from the beginning.
            el.currentTime = 0;
          };
          el.addEventListener("seeked", onSeeked);
          // Seeking well past the end makes the browser resolve the true duration.
          el.currentTime = 1e7;
        }
      }}
    />
  );
}
