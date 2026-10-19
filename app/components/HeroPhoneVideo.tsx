"use client";

import { useEffect, useRef, useState } from "react";

export default function HeroPhoneVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    // Safari uses HEVC with alpha; other browsers use transparent VP9.
    const safari = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.vendor === "Apple Computer, Inc." && !/Chrome|Chromium|CriOS|FxiOS|Edg/.test(navigator.userAgent));
    setSource(safari ? "/iphone-demo.mp4?v=3" : "/iphone-demo.webm?v=3");
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  function toggleAudio() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted && video.paused) void video.play().catch(() => setPlaying(false));
  }

  return (
    <>
      <video
        ref={videoRef}
        className="hero-phone"
        src={source}
        poster="/iphone-demo-poster.png?v=3"
        aria-label="iPhone audiobook reader preview"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
      />
      <div className="hero-phone-controls" role="group" aria-label="iPhone demo playback controls">
        <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause preview video" : "Play preview video"}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {playing ? <><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></>
              : <path d="M7 4.5v15l12-7.5Z" />}
          </svg>
        </button>
        <button type="button" onClick={toggleAudio} aria-label={muted ? "Unmute preview audio" : "Mute preview audio"} aria-pressed={!muted}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            {muted ? <path d="m17 9 4 6m0-6-4 6" /> : <><path d="M17 9a4 4 0 0 1 0 6" /><path d="M19 6a8 8 0 0 1 0 12" /></>}
          </svg>
        </button>
      </div>
    </>
  );
}
