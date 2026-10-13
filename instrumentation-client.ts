import posthog from "posthog-js";
import { isEduSurface, registerEduAnalyticsPause } from "./lib/edu-analytics-boundary";

// EDU uses its authenticated, schema-isolated telemetry pipeline. Do not attach
// consumer autocapture/session analytics to school documents or invitation URLs.
const eduSurface = isEduSurface();

if (eduSurface) {
  // Explicit EDU events are recorded by app/edu/telemetry.ts.
} else if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
  if (process.env.NODE_ENV === "development") {
    console.error(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured"
    );
  }
} else {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    before_send: (event) => isEduSurface() ? null : event,
  });
  registerEduAnalyticsPause(() => {
    const previous = { autocapture: posthog.config.autocapture, capture_pageview: posthog.config.capture_pageview,
      capture_pageleave: posthog.config.capture_pageleave, disable_session_recording: posthog.config.disable_session_recording };
    const recording = posthog.sessionRecordingStarted();
    posthog.set_config({ autocapture: false, capture_pageview: false, capture_pageleave: false, disable_session_recording: true });
    posthog.stopSessionRecording();
    return () => { posthog.set_config(previous); if (recording && !isEduSurface()) posthog.startSessionRecording(); };
  });
}
