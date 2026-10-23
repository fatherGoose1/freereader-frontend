"use client";

import { useRef, type PointerEvent } from "react";
import { clampPhononWindow, PHONON_CLIP_SECONDS } from "./phononAudio";
import styles from "./reader.module.css";

export default function PhononWaveformWindow({ peaks, duration, visibleStart, visibleDuration, start, onChange }: {
  peaks: number[];
  duration: number;
  visibleStart: number;
  visibleDuration: number;
  start: number;
  onChange: (start: number) => void;
}) {
  const drag = useRef<{ x: number; start: number } | null>(null);
  const bars = 72;
  const windowWidth = PHONON_CLIP_SECONDS / visibleDuration * 100;
  const windowLeft = (start - visibleStart) / visibleDuration * 100;

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = bounds.width;
    if (!width) return;
    const x = event.clientX - bounds.left;
    const left = width * windowLeft / 100;
    const selectionWidth = width * windowWidth / 100;
    const origin = x >= left && x <= left + selectionWidth ? start
      : clampPhononWindow(visibleStart + (x - selectionWidth / 2) / width * visibleDuration, visibleStart, visibleDuration);
    drag.current = { x: event.clientX, start: origin };
    onChange(origin);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    if (!width) return;
    const next = drag.current.start + (event.clientX - drag.current.x) / width * visibleDuration;
    onChange(clampPhononWindow(next, visibleStart, visibleDuration));
  }

  return <div className={styles.phononWaveform} role="group" aria-label="Ten-second voice sample window"
    onPointerDown={pointerDown} onPointerMove={pointerMove}
    onPointerUp={(event) => {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; }}>
    <div className={styles.phononWaveformBars} aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => {
        const moment = visibleStart + (index + 0.5) / bars * visibleDuration;
        const peak = peaks[Math.min(peaks.length - 1, Math.floor(moment / duration * peaks.length))] ?? 0;
        return <i key={index} className={moment >= start && moment <= start + PHONON_CLIP_SECONDS ? styles.phononWaveformSelected : ""}
          style={{ height: `${Math.max(3, peak * 70)}px` }} />;
      })}
    </div>
    <div className={styles.phononWaveformWindow} aria-hidden="true"
      style={{ left: `${windowLeft}%`, width: `${windowWidth}%` }} />
  </div>;
}
