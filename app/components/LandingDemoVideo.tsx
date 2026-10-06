"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

// Duration of the bundled demo, available even before the browser loads metadata.
const DEMO_DURATION = 39.066667;

function playbackTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export default function LandingDemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(DEMO_DURATION);

  function syncPlayback(video: HTMLVideoElement) {
    if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    setCurrentTime(video.currentTime);
    setPlaying(!video.paused && !video.ended);
  }

  useEffect(() => {
    // Metadata and autoplay events can fire before React hydrates the video.
    if (videoRef.current) syncPlayback(videoRef.current);
  }, []);

  function toggleAudio() {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) void video.play().catch(() => undefined);
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }

  function seek(time: number) {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.max(0, Math.min(time, duration));
    video.currentTime = target;
    setCurrentTime(target);
  }

  return (
    <div className="landing-video-frame">
      <video
        ref={videoRef}
        src="/landing-page-demo.mp4?v=2"
        poster="/landing-page-demo-poster.jpg?v=2"
        aria-label="Audiobook reader demo"
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => syncPlayback(event.currentTarget)}
        onDurationChange={(event) => syncPlayback(event.currentTarget)}
        onLoadedData={(event) => syncPlayback(event.currentTarget)}
        onTimeUpdate={(event) => syncPlayback(event.currentTarget)}
      />
      <div className="landing-video-controls" role="group" aria-label="Demo playback controls">
        <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause demo" : "Play demo"}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {playing ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>
              : <path d="M7 4.5v15l12-7.5Z" />}
          </svg>
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
        <span className="landing-video-time">{playbackTime(currentTime)} / {playbackTime(duration)}</span>
        <input type="range" min="0" max={duration} step="0.1"
          value={Math.min(currentTime, duration)} aria-label="Seek demo"
          aria-valuetext={`${playbackTime(currentTime)} of ${playbackTime(duration)}`}
          style={{ "--demo-progress": `${Math.min(100, currentTime / duration * 100)}%` } as CSSProperties}
          onChange={(event) => seek(Number(event.target.value))} />
        <button type="button" onClick={toggleAudio} aria-label={muted ? "Unmute audio" : "Mute audio"} aria-pressed={!muted}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            {muted ? <path d="m17 9 4 6m0-6-4 6" /> : <><path d="M17 9a4 4 0 0 1 0 6" /><path d="M19 6a8 8 0 0 1 0 12" /></>}
          </svg>
          <span>{muted ? "Unmute" : "Mute"}</span>
        </button>
      </div>
    </div>
  );
}
