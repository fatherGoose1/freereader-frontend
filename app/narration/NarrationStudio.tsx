"use client";

import Link from "next/link";
import BrandMark from "../components/BrandMark";
import { useEffect, useId, useRef, useState } from "react";
import { synthesize } from "../reader/narration";
import { getAudio, listNarrationProjects, saveAudio, saveNarrationProject } from "../reader/storage";
import { isClonedVoice, type NarratorVoice } from "../reader/voices";
import { detectSpeechLanguage, voiceForLanguage, voicesForLanguage } from "../reader/speech";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "../languages";
import { currentAccessToken, initAuthToken } from "../reader/authToken";
import { supabaseClient } from "../reader/supabase";
import { fetchUsage, formatRemaining, linkInstallation, type UsageSummary } from "../reader/usage";
import { listClonedVoices, removeClonedVoice, saveClonedVoice, voiceRefFor, type ClonedVoiceRecord } from "../reader/cloneVoices";
import { MAX_CLONE_SECONDS, MIN_CLONE_SECONDS, VoiceRecorder, prepareCloneAudio } from "../reader/voiceCloneAudio";
import { exportVoiceover } from "./exportAudio";
import {
  createNarrationProject,
  effectivePronunciations,
  invalidateSegment,
  mergePassages,
  movePassage,
  pronunciationParts,
  segmentScript,
  splitPassage,
  spokenText,
  type NarrationProject,
  type NarrationSegment,
  type PronunciationOverride,
  updateGlobalPronunciations,
} from "./model";
import styles from "./narration.module.css";

const speeds = [0.75, 0.85, 0.9, 1, 1.1, 1.2, 1.35];
const pauses = [["Short", 250], ["Medium", 600], ["Long", 1000]] as const;

type CloneDraft = { blob: Blob; durationSeconds: number; base64: string; url: string };

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function voiceOptions(language: SpeechLanguage, clonedVoices: ClonedVoiceRecord[], premium = true) {
  const builtIn = voicesForLanguage(language).map(([value, name]) => <option key={value} value={value}>{name}</option>);
  if (!clonedVoices.length) return builtIn;
  return [
    <optgroup key="cloned" label={premium ? "Your cloned voices" : "Your cloned voices — Premium"} disabled={!premium}>
      {clonedVoices.map((record) => <option key={record.id} value={voiceRefFor(record)}>{record.name}</option>)}
    </optgroup>,
    ...builtIn,
  ];
}

function passageLanguage(segment: NarrationSegment, project: NarrationProject): SpeechLanguage {
  return segment.languageOverride ?? project.language;
}

function languageName(language: SpeechLanguage): string {
  return SPEECH_LANGUAGES.find(([code]) => code === language)?.[1] ?? language;
}

function inputKey(segment: NarrationSegment, project: NarrationProject): string {
  const language = passageLanguage(segment, project);
  return JSON.stringify({
    text: segment.text,
    spoken: spokenText(segment, project.pronunciations),
    language,
    voice: voiceForLanguage(segment.voiceId ?? project.defaultVoice, language),
    speed: segment.speedOverride ?? project.globalSpeed,
  });
}

function statusLabel(segment: NarrationSegment): string {
  if (segment.status === "generating") return "Generating…";
  if (segment.status === "ready") return "Ready";
  if (segment.status === "error") return "Needs attention";
  return segment.needsRegeneration ? "Needs regeneration" : "Not generated";
}

function formatTime(seconds: number): string {
  const whole = Math.floor(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function StudioDialog({ title, description, onClose, children }: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("input, button, select, textarea")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, []);

  return <div className={styles.dialogBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className={styles.dialogHeader}>
        <div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
        <button type="button" className={styles.dialogClose} aria-label={`Close ${title}`} onClick={onClose}>×</button>
      </div>
      {children}
    </div>
  </div>;
}

function PassageEditor({ segment, index, active, rules, onFocus, onChange, onSelection, editorRef }: {
  segment: NarrationSegment;
  index: number;
  active: boolean;
  rules: PronunciationOverride[];
  onFocus: () => void;
  onChange: (text: string) => void;
  onSelection: (text: string) => void;
  editorRef: (node: HTMLTextAreaElement | null) => void;
}) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  const [editing, setEditing] = useState(false);
  const parts = pronunciationParts(segment.text, rules);
  const showAnnotations = !editing && parts.some(({ pronunciation }) => pronunciation !== undefined);
  useEffect(() => {
    if (showAnnotations) return;
    const resize = () => {
      if (!field.current) return;
      field.current.style.height = "auto";
      field.current.style.height = `${field.current.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (field.current) observer.observe(field.current);
    return () => observer.disconnect();
  }, [segment.text, showAnnotations]);

  useEffect(() => { if (editing) field.current?.focus(); }, [editing]);

  function captureSelection() {
    const input = field.current;
    if (input && input.selectionStart !== input.selectionEnd) {
      onSelection(input.value.slice(input.selectionStart, input.selectionEnd).trim());
    }
  }

  return <>
    {showAnnotations && <button type="button" className={styles.annotatedPassage} aria-label={`Edit passage ${index + 1}`} aria-current={active ? "true" : undefined} onClick={() => { onFocus(); setEditing(true); }}>
      {parts.map((part, position) => part.pronunciation
        ? <ruby key={position} className={styles.pronunciationMark}><s>{part.written}</s><rt>{part.pronunciation}</rt></ruby>
        : <span key={position}>{part.written}</span>)}
    </button>}
    <textarea
    ref={(node) => { field.current = node; editorRef(node); }}
    aria-label={`Passage ${index + 1} text`}
    aria-current={active ? "true" : undefined}
    hidden={showAnnotations}
    value={segment.text}
    rows={2}
    onFocus={() => { setEditing(true); onFocus(); }}
    onBlur={() => setEditing(false)}
    onChange={(event) => onChange(event.target.value)}
    onSelect={captureSelection}
    onMouseUp={captureSelection}
    onKeyUp={captureSelection}
    />
  </>;
}

export default function NarrationStudio() {
  const [project, setProject] = useState<NarrationProject>(() => createNarrationProject());
  const projectRef = useRef(project);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("Loading project...");
  const [scriptDraft, setScriptDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState("");
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; completed: number; total: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [globalPhrase, setGlobalPhrase] = useState("");
  const [globalPronunciation, setGlobalPronunciation] = useState("");
  const [globalPronunciationsOpen, setGlobalPronunciationsOpen] = useState(false);
  const [pronunciationOpen, setPronunciationOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrl = useRef<string | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackEpoch = useRef(0);
  const playingIdRef = useRef<string | null>(null);
  const voicePreviewRef = useRef(false);
  const generationEpoch = useRef(0);
  const editors = useRef(new Map<string, HTMLTextAreaElement>());
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceRecord[]>([]);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneMode, setCloneMode] = useState<"upload" | "record">("upload");
  const [cloneName, setCloneName] = useState("");
  const [cloneDraft, setCloneDraft] = useState<CloneDraft | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneError, setCloneError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorderSupported, setRecorderSupported] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const selected = project.segments.find((segment) => segment.id === selectedId) ?? null;
  const readyCount = project.segments.filter((segment) => segment.status === "ready").length;
  const hasGeneratedAudio = project.segments.some((segment) => !!segment.audio || !!segment.needsRegeneration);
  const playable = project.segments.filter((segment) => segment.status === "ready" && segment.audio);
  const totalDuration = playable.reduce((sum, segment, index) => sum + (segment.audio?.duration ?? 0) + (index < playable.length - 1 ? segment.pauseAfterMs / 1000 : 0), 0);
  const generationPercent = generationProgress ? Math.round(generationProgress.completed / generationProgress.total * 100) : 0;
  const hasPremium = usage?.plan === "premium";

  function refreshUsage() {
    fetchUsage(currentAccessToken()).then(setUsage).catch(() => undefined);
  }

  useEffect(() => { setPlayerTime((time) => Math.min(time, totalDuration)); }, [totalDuration]);

  function passageStart(id: string): number {
    let elapsed = 0;
    const ready = projectRef.current.segments.filter((segment) => segment.status === "ready" && segment.audio);
    for (const [index, segment] of ready.entries()) {
      if (segment.id === id) return elapsed;
      elapsed += (segment.audio?.duration ?? 0) + (index < ready.length - 1 ? segment.pauseAfterMs / 1000 : 0);
    }
    return 0;
  }

  function stopPlayback() {
    playbackEpoch.current += 1;
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
    audioRef.current?.pause();
    playingIdRef.current = null;
    voicePreviewRef.current = false;
    setPlayingId(null);
    setVoicePreviewPlaying(false);
    setIsPlaying(false);
  }

  function stopGeneration() {
    generationEpoch.current += 1;
    setGeneratingAll(false);
    setGenerationProgress(null);
  }

  function commit(update: (current: NarrationProject) => NarrationProject) {
    const next = { ...update(projectRef.current), updatedAt: new Date().toISOString() };
    projectRef.current = next;
    setProject(next);
  }

  function replaceSegment(id: string, update: (segment: NarrationSegment) => NarrationSegment) {
    commit((current) => ({
      ...current,
      segments: current.segments.map((segment) => segment.id === id ? update(segment) : segment),
    }));
  }

  function configureSegment(id: string, changes: Partial<NarrationSegment>, invalidatesAudio = true) {
    if (invalidatesAudio && playingIdRef.current === id) stopPlayback();
    replaceSegment(id, (segment) => {
      const next = { ...segment, ...changes };
      return invalidatesAudio ? invalidateSegment(next) : next;
    });
  }

  function changePassageVoice(id: string, voiceId: NarratorVoice | null) {
    stopPlayback();
    stopGeneration();
    configureSegment(id, { voiceId });
    setGenerationMessage("Generating this passage with the selected voice…");
    void generateSegment(id, true);
  }

  useEffect(() => {
    listNarrationProjects()
      .then((projects) => {
        const saved = projects[0] ?? createNarrationProject();
        const language = saved.language ?? detectSpeechLanguage(saved.segments.map((segment) => segment.text).join(" ")) ?? "en";
        const restored = {
          ...saved,
          language,
          defaultVoice: voiceForLanguage(saved.defaultVoice, language),
          pronunciations: saved.pronunciations ?? [],
          segments: saved.segments.map((segment) => {
            const restoredSegment = { ...segment, languageOverride: segment.languageOverride ?? null };
            return !saved.language && language !== "en" ? invalidateSegment(restoredSegment) : restoredSegment;
          }),
        };
        projectRef.current = restored;
        setProject(restored);
        setSelectedId(null);
        setSaveState("Saved locally");
      })
      .catch(() => setSaveState("Local project storage is unavailable"))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaveState("Saving...");
    const timer = setTimeout(() => {
      saveNarrationProject(project)
        .then(() => setSaveState("Saved locally"))
        .catch(() => setSaveState("Could not save locally"));
    }, 400);
    return () => clearTimeout(timer);
  }, [loaded, project]);

  useEffect(() => {
    initAuthToken();
    const apply = (token: string | null) => {
      (token ? linkInstallation(token) : fetchUsage(null)).then(setUsage).catch(() => undefined);
    };
    const supabase = supabaseClient();
    if (!supabase) {
      apply(null);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.access_token ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => apply(next?.access_token ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setClonedVoices(listClonedVoices());
    setRecorderSupported(VoiceRecorder.supported());
  }, []);

  useEffect(() => () => {
    generationEpoch.current += 1;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    recorderRef.current?.cancel();
    recorderRef.current = null;
  }, []);

  function importScript() {
    if (!scriptDraft.trim()) return;
    if (project.segments.length && !window.confirm("Replace this script and its generated voiceover?")) return;
    stopPlayback();
    stopGeneration();
    const segments = segmentScript(scriptDraft);
    const language = detectSpeechLanguage(scriptDraft) ?? "en";
    commit((current) => ({ ...current, language, defaultVoice: voiceForLanguage(current.defaultVoice, language), segments }));
    setSelectedId(null);
    setPlayerTime(0);
    setScriptDraft("");
    setImportOpen(false);
    setGenerationMessage(`Detected ${languageName(language)}. Edit your script, then generate your voiceover.`);
  }

  async function importScriptFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) { setGenerationMessage("Choose a script under 2 MB."); return; }
    try {
      setScriptDraft(await file.text());
      setGenerationMessage(`${file.name} is ready to add.`);
    } catch {
      setGenerationMessage("Could not read this script file. Try pasting its text instead.");
    }
  }

  function newProject() {
    if (project.segments.length && !window.confirm("Start a new narration project? Your current project will remain saved locally.")) return;
    stopPlayback();
    stopGeneration();
    const next = createNarrationProject();
    projectRef.current = next;
    setProject(next);
    setSelectedId(null);
    setScriptDraft("");
    setImportOpen(false);
    setPlayerTime(0);
    setGenerationMessage("");
  }

  function changeDefaults(changes: Partial<Pick<NarrationProject, "defaultVoice" | "globalSpeed">>) {
    if (voicePreviewRef.current && changes.defaultVoice) stopPlayback();
    if (playingIdRef.current) {
      const current = projectRef.current.segments.find((item) => item.id === playingIdRef.current);
      if (current && ((changes.defaultVoice && !current.voiceId) || (changes.globalSpeed && !current.speedOverride))) stopPlayback();
    }
    commit((current) => ({
      ...current,
      ...changes,
      segments: current.segments.map((segment) =>
        (changes.defaultVoice && !segment.voiceId) || (changes.globalSpeed && !segment.speedOverride)
          ? invalidateSegment(segment) : segment),
    }));
  }

  function changeProjectLanguage(language: SpeechLanguage) {
    if (projectRef.current.language === language) return;
    stopPlayback();
    stopGeneration();
    commit((current) => {
      const next = { ...current, language, defaultVoice: voiceForLanguage(current.defaultVoice, language) };
      return { ...next, segments: current.segments.map((segment) =>
        inputKey(segment, current) === inputKey(segment, next) ? segment : invalidateSegment(segment)) };
    });
    setGenerationMessage(`Project language set to ${languageName(language)}. Regenerate affected passages to hear it.`);
  }

  function changePassageLanguage(id: string, languageOverride: SpeechLanguage | null) {
    const current = projectRef.current;
    const segment = current.segments.find((item) => item.id === id);
    if (!segment) return;
    const language = languageOverride ?? current.language;
    const voiceId = segment.voiceId && (isClonedVoice(segment.voiceId) || voicesForLanguage(language).some(([value]) => value === segment.voiceId))
      ? segment.voiceId : null;
    const updated = { ...segment, languageOverride, voiceId };
    const changed = inputKey(segment, current) !== inputKey(updated, current);
    if (changed) { stopPlayback(); stopGeneration(); }
    replaceSegment(id, () => changed ? invalidateSegment(updated) : updated);
    if (changed) {
      setGenerationMessage(`Generating this passage in ${languageName(language)}…`);
      void generateSegment(id, true);
    }
  }

  async function playAudio(segment: NarrationSegment, offset = 0) {
    if (!segment.audio) return;
    stopPlayback();
    const epoch = playbackEpoch.current;
    playingIdRef.current = segment.id;
    setPlayingId(segment.id);
    setSelectedId(segment.id);
    setPlayerTime(passageStart(segment.id) + offset);
    const blob = await getAudio(segment.audio.path);
    if (epoch !== playbackEpoch.current) return;
    if (!blob) {
      configureSegment(segment.id, { status: "idle", audio: null, needsRegeneration: true, error: "Saved audio is missing. Regenerate this passage." }, false);
      stopPlayback();
      return;
    }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = URL.createObjectURL(blob);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = audioUrl.current;
    audio.currentTime = offset;
    try {
      await audio.play();
      if (epoch === playbackEpoch.current) setIsPlaying(true);
    } catch {
      if (epoch === playbackEpoch.current) { stopPlayback(); setGenerationMessage("Playback could not start. Try again."); }
    }
  }

  async function generateSegment(id: string, playWhenReady = false): Promise<boolean> {
    const currentProject = projectRef.current;
    const segment = currentProject.segments.find((item) => item.id === id);
    if (!segment?.text.trim()) return false;
    if (playingIdRef.current === id) stopPlayback();
    const requestKey = inputKey(segment, currentProject);
    const language = passageLanguage(segment, currentProject);
    const voice = voiceForLanguage(segment.voiceId ?? currentProject.defaultVoice, language);
    const speed = segment.speedOverride ?? currentProject.globalSpeed;
    replaceSegment(id, (item) => ({ ...item, status: "generating", error: undefined }));
    setGenerationMessage(`Generating passage ${currentProject.segments.findIndex((item) => item.id === id) + 1}…`);
    try {
      const result = await synthesize(
        spokenText(segment, currentProject.pronunciations), voice, 12,
        (message) => setGenerationMessage(message), false, speed, language, undefined, "youtube_narration",
      );
      const latestProject = projectRef.current;
      const latest = latestProject.segments.find((item) => item.id === id);
      if (!latest || inputKey(latest, latestProject) !== requestKey) return false;
      const path = `narrations/${latestProject.id}/${id}/${randomId()}`;
      await saveAudio(path, result.blob);
      const savedProject = projectRef.current;
      const savedSegment = savedProject.segments.find((item) => item.id === id);
      if (!savedSegment || inputKey(savedSegment, savedProject) !== requestKey) return false;
      const ready: NarrationSegment = {
        ...savedSegment,
        modelId: result.route.model,
        status: "ready",
        needsRegeneration: false,
        error: undefined,
        audio: {
          path,
          mimeType: result.blob.type,
          duration: result.duration,
          generatedAt: new Date().toISOString(),
          voice,
          model: result.route.model,
          speed,
        },
      };
      replaceSegment(id, () => ready);
      refreshUsage();
      setGenerationMessage(`Passage ${savedProject.segments.findIndex((item) => item.id === id) + 1} is ready.`);
      if (playWhenReady) {
        try {
          await playAudio(ready);
        } catch {
          setGenerationMessage("Audio was generated, but this browser could not start playback.");
        }
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Narration generation failed.";
      refreshUsage();
      const latestProject = projectRef.current;
      const latest = latestProject.segments.find((item) => item.id === id);
      if (latest && inputKey(latest, latestProject) === requestKey) {
        replaceSegment(id, (item) => ({ ...item, status: "error", error: message }));
      }
      setGenerationMessage(message);
      return false;
    }
  }

  async function generateAll() {
    const epoch = ++generationEpoch.current;
    setGeneratingAll(true);
    const ids = projectRef.current.segments.map((segment) => segment.id);
    const total = ids.length;
    let completed = projectRef.current.segments.filter((segment) => segment.status === "ready").length;
    setGenerationProgress({ current: 1, completed, total });
    let failed = false;
    for (const [index, id] of ids.entries()) {
      if (generationEpoch.current !== epoch) break;
      const segment = projectRef.current.segments.find((item) => item.id === id);
      if (segment?.status === "ready") continue;
      setGenerationProgress({ current: index + 1, completed, total });
      if (!await generateSegment(id)) failed = true;
      if (generationEpoch.current === epoch) setGenerationProgress({ current: index + 1, completed: ++completed, total });
    }
    if (generationEpoch.current === epoch) {
      setGenerationMessage(failed ? "Some passages need attention. Retry them here or generate again." : "Voiceover ready. Listen through and refine any passage.");
      setGeneratingAll(false);
      setGenerationProgress(null);
    }
  }

  function revokeDraftUrl() {
    setCloneDraft((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function closeClone() {
    if (cloneBusy) return;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    recordingTimer.current = null;
    setRecording(false);
    setCloneOpen(false);
    revokeDraftUrl();
    setCloneError("");
  }

  async function loadCloneSource(source: Blob) {
    setCloneError("");
    setCloneBusy(true);
    try {
      const prepared = await prepareCloneAudio(source);
      setCloneDraft((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { ...prepared, url: URL.createObjectURL(prepared.blob) };
      });
      setCloneName((name) => name.trim() || "My voice");
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : "Could not prepare that audio.");
    } finally {
      setCloneBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      const recorder = recorderRef.current;
      setRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      recorderRef.current = null;
      if (!recorder) return;
      try {
        await loadCloneSource(await recorder.stop());
      } catch (error) {
        setCloneError(error instanceof Error ? error.message : "Recording failed.");
      }
      return;
    }
    setCloneError("");
    try {
      const recorder = new VoiceRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimer.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : "Microphone access was blocked.");
    }
  }

  async function createVoiceClone() {
    if (!cloneDraft || !cloneName.trim() || cloneBusy) return;
    setCloneBusy(true);
    setCloneError("");
    try {
      const supabase = supabaseClient();
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const session = data.session;
      if (!session) throw new Error("Sign in with a Premium account to clone a voice.");
      const response = await fetch("/api/voices/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          userId: session.user.id,
          voiceId: randomId(),
          name: cloneName.trim(),
          language: projectRef.current.language,
          audio: cloneDraft.base64,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        voice_id?: unknown; user_id?: unknown; duration_seconds?: unknown; error?: unknown;
      } | null;
      if (!response.ok || typeof payload?.voice_id !== "string") {
        throw new Error(payload?.error === "premium_required" ? "A Premium subscription is required to clone a voice." : typeof payload?.error === "string" ? payload.error : "Voice cloning failed. Try again.");
      }
      const record: ClonedVoiceRecord = {
        id: payload.voice_id,
        userId: typeof payload.user_id === "string" ? payload.user_id : session.user.id,
        name: cloneName.trim(),
        createdAt: new Date().toISOString(),
        durationSeconds: typeof payload.duration_seconds === "number" ? payload.duration_seconds : cloneDraft.durationSeconds,
        language: projectRef.current.language,
      };
      setClonedVoices(saveClonedVoice(record));
      changeDefaults({ defaultVoice: voiceRefFor(record) });
      setGenerationMessage(`Cloned voice "${record.name}" is ready. Generate a passage to hear it.`);
      revokeDraftUrl();
      setCloneName("");
      setCloneOpen(false);
      setCloneMode("upload");
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : "Voice cloning failed. Try again.");
    } finally {
      setCloneBusy(false);
    }
  }

  function deleteVoiceClone(record: ClonedVoiceRecord) {
    setClonedVoices(removeClonedVoice(record.id));
    if (projectRef.current.defaultVoice === voiceRefFor(record)) changeDefaults({ defaultVoice: "af_heart" });
    setGenerationMessage(`Removed cloned voice "${record.name}".`);
  }

  async function previewVoice() {
    stopPlayback();
    const epoch = playbackEpoch.current;
    const voice = voiceForLanguage(project.defaultVoice, project.language);
    if (isClonedVoice(voice)) {
      setGenerationMessage("Cloned voices have no instant preview. Generate a passage to hear this voice.");
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
    }
    audio.src = project.language === "en"
      ? `/voice-previews/${voice}.m4a`
      : `/voice-previews/${project.language}/${voice}.m4a`;
    voicePreviewRef.current = true;
    setVoicePreviewPlaying(true);
    setGenerationMessage(`Playing voice sample in ${languageName(project.language)}…`);
    try {
      await audio.play();
      if (epoch === playbackEpoch.current) setIsPlaying(true);
    } catch {
      if (epoch !== playbackEpoch.current) return;
      stopPlayback();
      setGenerationMessage("Voice sample could not play. Try again.");
    }
  }

  function openPronunciation() {
    if (!selected) return;
    const editor = editors.current.get(selected.id);
    const selection = editor?.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    if (selection) setPhrase(selection);
    setPronunciationOpen(true);
  }

  function addPronunciation(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !phrase.trim() || !pronunciation.trim()) return;
    const override: PronunciationOverride = {
      id: randomId(),
      phrase: phrase.trim(),
      pronunciation: pronunciation.trim(),
    };
    configureSegment(selected.id, { pronunciations: [...selected.pronunciations, override] });
    setPhrase("");
    setPronunciation("");
    setPronunciationOpen(false);
  }

  function changeGlobalPronunciations(rules: PronunciationOverride[]) {
    const current = projectRef.current;
    if (playingIdRef.current) {
      const passage = current.segments.find((item) => item.id === playingIdRef.current);
      if (passage && spokenText(passage, current.pronunciations) !== spokenText(passage, rules)) stopPlayback();
    }
    commit((project) => updateGlobalPronunciations(project, rules));
    setGenerationMessage("Pronunciation updated. Regenerate affected passages to hear the change.");
  }

  function addGlobalPronunciation(event: React.FormEvent) {
    event.preventDefault();
    const written = globalPhrase.trim();
    const spoken = globalPronunciation.trim();
    if (!written || !spoken) return;
    const rules = projectRef.current.pronunciations;
    const existing = rules.find((rule) => rule.phrase.toLocaleLowerCase() === written.toLocaleLowerCase());
    changeGlobalPronunciations(existing
      ? rules.map((rule) => rule.id === existing.id ? { ...rule, phrase: written, pronunciation: spoken } : rule)
      : [...rules, { id: randomId(), phrase: written, pronunciation: spoken }]);
    setGlobalPhrase("");
    setGlobalPronunciation("");
  }

  function handleAudioEnded() {
    if (voicePreviewRef.current) { stopPlayback(); return; }
    const id = playingIdRef.current;
    const ready = projectRef.current.segments.filter((item) => item.status === "ready" && item.audio);
    const index = ready.findIndex((item) => item.id === id);
    const segment = ready[index];
    if (!segment) { stopPlayback(); return; }
    const next = ready[index + 1];
    if (!next) { setPlayerTime(passageStart(segment.id) + (segment.audio?.duration ?? 0)); stopPlayback(); return; }
    const epoch = playbackEpoch.current;
    setPlayerTime(passageStart(segment.id) + (segment.audio?.duration ?? 0));
    setIsPlaying(true);
    pauseTimer.current = setTimeout(() => {
      if (epoch === playbackEpoch.current) void playAudio(next);
    }, segment.pauseAfterMs);
  }

  function seekProject(time: number) {
    if (!playable.length) return;
    const target = Math.max(0, Math.min(time, totalDuration));
    let start = 0;
    for (const [index, segment] of playable.entries()) {
      const duration = segment.audio?.duration ?? 0;
      if (target < start + duration || index === playable.length - 1) {
        void playAudio(segment, Math.min(Math.max(target - start, 0), Math.max(0, duration - .01)));
        return;
      }
      start += duration + segment.pauseAfterMs / 1000;
      if (target < start) { void playAudio(playable[index + 1]); return; }
    }
  }

  function toggleProjectPlayback() {
    if (isPlaying) { stopPlayback(); return; }
    const current = playable.find((item) => item.id === playingId);
    if (current) void playAudio(current, Math.max(0, playerTime - passageStart(current.id)));
    else if (playable.length) seekProject(playerTime < totalDuration ? playerTime : 0);
  }

  async function downloadVoiceover() {
    setExporting(true);
    setGenerationMessage("Preparing your voiceover download…");
    try {
      const blob = await exportVoiceover(projectRef.current.segments);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(projectRef.current.title.trim() || "voiceover").replace(/[^\w -]/g, "").trim() || "voiceover"}.wav`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setGenerationMessage("Voiceover downloaded.");
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : "Could not export this voiceover.");
    } finally {
      setExporting(false);
    }
  }

  function reorderPassage(id: string, destination: number) {
    stopPlayback();
    setPlayerTime(0);
    commit((current) => ({ ...current, segments: movePassage(current.segments, id, destination) }));
    setGenerationMessage("Passage moved. The voiceover will play in the new order.");
  }

  function splitSelectedPassage(id: string) {
    const editor = editors.current.get(id);
    if (!editor || editor.selectionStart !== editor.selectionEnd) {
      setGenerationMessage("Place the cursor between words, then split the passage.");
      return;
    }
    try {
      const next = splitPassage(projectRef.current.segments, id, editor.selectionStart);
      stopPlayback();
      stopGeneration();
      setPlayerTime(0);
      commit((current) => ({ ...current, segments: next }));
      setSelectedId(next[next.findIndex((segment) => segment.id === id) + 1].id);
      setPhrase("");
      setPronunciationOpen(false);
      setGenerationMessage("Passage split. Only the changed passages need new audio.");
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : "Could not split this passage.");
    }
  }

  function mergeAdjacentPassages(firstId: string) {
    const next = mergePassages(projectRef.current.segments, firstId);
    if (next === projectRef.current.segments) return;
    stopPlayback();
    stopGeneration();
    setPlayerTime(0);
    commit((current) => ({ ...current, segments: mergePassages(current.segments, firstId) }));
    setSelectedId(firstId);
    setPhrase("");
    setPronunciationOpen(false);
    setGenerationMessage("Passages combined. The earlier voice and speed apply; regenerate this passage to hear it.");
  }

  return (
    <main className={styles.studio}>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <Link href="/" className={styles.brand}><BrandMark />FreeReader</Link>
          <span className={styles.mode}>Video narration</span>
        </div>
        <input
          className={styles.projectTitle}
          aria-label="Project title"
          value={project.title}
          onChange={(event) => commit((current) => ({ ...current, title: event.target.value }))}
        />
        <div className={styles.topActions}>
          <span>{saveState}</span>
          <Link href="/reader/audiobooks" className={styles.readerLink}>Audiobook reader ↗</Link>
          <button onClick={newProject}>New project</button>
        </div>
      </header>

      <section className={styles.controlbar} aria-label="Voiceover settings">
        <div className={styles.settingsHeading}>
          <div><span className={styles.kicker}>Narration setup</span><h2>Set the sound for your script</h2><p>These settings apply to every passage unless you change it below.</p></div>
          <div className={styles.generationActions}>
            {usage && <span className={styles.usageRemaining}>{formatRemaining(usage.remaining_seconds)} narration left{hasPremium && <> · {formatRemaining(usage.premium_voice_remaining_seconds)} Premium voice left</>}</span>}
            <button className={styles.generateButton} disabled={!project.segments.length || (readyCount === project.segments.length && !generatingAll)} onClick={generatingAll ? stopGeneration : () => void generateAll()}>
              {generatingAll && generationProgress ? <>
                <span className={styles.generateFill} style={{ width: `${generationPercent}%` }} aria-hidden="true" />
                <span className={styles.generateLabel}>Generating {generationProgress.current} of {generationProgress.total} · {generationPercent}%</span>
                <small>Click to stop after this passage</small>
              </> : readyCount === project.segments.length && readyCount > 0 ? "Voiceover ready" : "Generate voiceover"}
            </button>
          </div>
        </div>
        <div className={styles.settingsFields}>
          <label>Language
            <select value={project.language} onChange={(event) => changeProjectLanguage(event.target.value as SpeechLanguage)}>
              {SPEECH_LANGUAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <label>Voice
            <select value={project.defaultVoice} onChange={(event) => changeDefaults({ defaultVoice: event.target.value as NarratorVoice })}>
              {voiceOptions(project.language, clonedVoices, hasPremium)}
            </select>
          </label>
          <label>Speaking speed
            <select value={project.globalSpeed} onChange={(event) => changeDefaults({ globalSpeed: Number(event.target.value) })}>
              {speeds.map((speed) => <option key={speed} value={speed}>{speed}x</option>) }
            </select>
          </label>
        </div>
        <div className={styles.settingsTools}>
          <button type="button" className={styles.toolButton} onClick={() => void previewVoice()}>▶ <span>Preview voice</span></button>
          <span className={styles.toolDivider} aria-hidden="true" />
          <button type="button" className={styles.toolButton} onClick={() => setGlobalPronunciationsOpen(true)}>Pronunciations{project.pronunciations.length > 0 && <span className={styles.toolCount}>{project.pronunciations.length}</span>}</button>
          <button type="button" className={styles.toolButton} onClick={() => setCloneOpen(true)}>Clone a voice{!hasPremium && <span className={styles.toolCount}>Premium</span>}</button>
        </div>
      </section>

      {cloneOpen && <StudioDialog title="Clone a voice" description={hasPremium ? `Upload or record ${MIN_CLONE_SECONDS}–${MAX_CLONE_SECONDS} seconds of clear speech. We use at most the first ${MAX_CLONE_SECONDS} seconds.` : "Sign in with Premium to create and use a cloned voice."} onClose={closeClone}>
        {!hasPremium ? <div className={styles.premiumGate}>
          <strong>Voice cloning is included with Premium</strong>
          <p>Get 20 hours of narration each month, including 1 hour with your own cloned voice.</p>
          <Link className={styles.importButton} href="/pricing">See Premium plans</Link>
        </div> : <>
        <label className={styles.cloneName}>Voice name
          <input value={cloneName} onChange={(event) => setCloneName(event.target.value)} placeholder="e.g. My narrator" maxLength={80} />
        </label>
        <div className={styles.cloneTabs} role="group" aria-label="Voice source">
          <button type="button" aria-pressed={cloneMode === "upload"} className={cloneMode === "upload" ? styles.activeCloneTab : ""} onClick={() => setCloneMode("upload")}>Upload audio</button>
          <button type="button" aria-pressed={cloneMode === "record"} className={cloneMode === "record" ? styles.activeCloneTab : ""} onClick={() => setCloneMode("record")}>Record</button>
        </div>
        {cloneMode === "upload" ? <div
          className={`${styles.cloneDrop} ${dragActive ? styles.cloneDropActive : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files?.[0]; if (file) void loadCloneSource(file); }}
        >
          <span>Drag an audio file here, or</span>
          <label className={styles.fileImport}>Browse audio<input type="file" accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadCloneSource(file); event.target.value = ""; }} /></label>
        </div> : <div className={styles.cloneRecorder}>
          <button type="button" className={recording ? styles.cloneRecordStop : styles.cloneRecordStart} disabled={!recorderSupported} onClick={() => void toggleRecording()}>
            {recording ? `Stop recording · ${formatTime(recordingSeconds)}` : "Start recording"}
          </button>
          <span>{recorderSupported ? `Speak clearly for ${MIN_CLONE_SECONDS}–${MAX_CLONE_SECONDS} seconds.` : "Microphone recording is not supported in this browser."}</span>
        </div>}
        {cloneDraft && <div className={styles.clonePreview}>
          <audio controls src={cloneDraft.url} />
          <span>{cloneDraft.durationSeconds.toFixed(1)}s ready</span>
        </div>}
        {cloneError && <p className={styles.cloneError} role="alert">{cloneError}</p>}
        <div className={styles.cloneActions}>
          <button type="button" className={styles.secondaryButton} disabled={cloneBusy} onClick={closeClone}>Cancel</button>
          <button type="button" className={styles.importButton} disabled={!cloneDraft || !cloneName.trim() || cloneBusy} onClick={() => void createVoiceClone()}>{cloneBusy ? "Cloning…" : "Create voice clone"}</button>
        </div>
        {clonedVoices.length > 0 && <ul className={styles.cloneVoiceList} aria-label="Your cloned voices">
          {clonedVoices.map((record) => <li key={record.id}>
            <span><strong>{record.name}</strong> · {record.durationSeconds.toFixed(1)}s</span>
            <button type="button" aria-label={`Remove cloned voice ${record.name}`} onClick={() => deleteVoiceClone(record)}>×</button>
          </li>)}
        </ul>}
        </>}
      </StudioDialog>}

      {globalPronunciationsOpen && <StudioDialog title="Script pronunciations" description="Set how a word or phrase is spoken throughout your script. Passage-specific pronunciations take priority." onClose={() => setGlobalPronunciationsOpen(false)}>
        <div className={styles.globalPronunciations}>
          <form onSubmit={addGlobalPronunciation}>
            <label>Written phrase<input value={globalPhrase} onChange={(event) => setGlobalPhrase(event.target.value)} placeholder="e.g. SQL" /></label>
            <label>Say it like<input value={globalPronunciation} onChange={(event) => setGlobalPronunciation(event.target.value)} placeholder="e.g. sequel" /></label>
            <button className={styles.importButton} disabled={!globalPhrase.trim() || !globalPronunciation.trim()}>Save pronunciation</button>
          </form>
          {project.pronunciations.length > 0 ? <div className={styles.rulesSection}><strong>Saved pronunciations</strong><ul aria-label="Global pronunciation rules">
            {project.pronunciations.map((rule) => <li key={rule.id}>
              <ruby className={styles.pronunciationMark}><s>{rule.phrase}</s><rt>{rule.pronunciation}</rt></ruby>
              <button aria-label={`Remove global pronunciation for ${rule.phrase}`} onClick={() => changeGlobalPronunciations(projectRef.current.pronunciations.filter((item) => item.id !== rule.id))}>×</button>
            </li>)}
          </ul></div> : <p className={styles.emptyRules}>No pronunciations added yet.</p>}
        </div>
        <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setGlobalPronunciationsOpen(false)}>Done</button></div>
      </StudioDialog>}

      <section className={styles.workspace} aria-label="Script workspace">
        {!project.segments.length ? <div className={styles.emptyEditor}>
          <h1>Turn your script into a voiceover</h1>
          <p>Paste a video script or import a text file. Edit passages, choose a voice, and export the finished narration as a WAV file.</p>
          <label className={styles.fileImport}>Import a text file<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { void importScriptFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
          <label htmlFor="script-import">YouTube script</label>
          <textarea id="script-import" placeholder="Paste your script here…" value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} />
          <button className={styles.importButton} disabled={!scriptDraft.trim()} onClick={importScript}>Add script</button>
        </div> : <div className={styles.editorPanel}>
          <div className={styles.editorHeading}>
            <div><h1>Script</h1><p>{hasGeneratedAudio ? `${readyCount} of ${project.segments.length} passages ready to listen` : `Detected ${languageName(project.language)}. Edit your script, then generate your voiceover.`}</p></div>
            <button className={styles.secondaryButton} onClick={() => setImportOpen((open) => !open)} aria-expanded={importOpen}>Replace / import script</button>
          </div>
          {importOpen && <div className={styles.replacePanel}>
            <label htmlFor="script-replacement">Paste a replacement script</label>
            <label className={styles.fileImport}>Import a text file<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { void importScriptFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
            <textarea id="script-replacement" placeholder="Paste your new script here…" value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} />
            <div><button onClick={() => setImportOpen(false)}>Cancel</button><button className={styles.importButton} disabled={!scriptDraft.trim()} onClick={importScript}>Replace script</button></div>
            <small>Replacing the script also replaces its generated audio.</small>
          </div>}
          <div className={styles.document} aria-label="Editable script">
            {project.segments.map((segment, index) => {
              const active = selectedId === segment.id;
              return <div key={segment.id} className={`${styles.passage} ${active ? styles.activePassage : ""}`} onKeyDown={(event) => { if (event.key === "Escape") { setSelectedId(null); setPronunciationOpen(false); } }}>
                <label className={styles.passageIndex}>
                  <span className={styles.visuallyHidden}>Move passage {index + 1} to position</span>
                  <select aria-label={`Move passage ${index + 1} to position`} title="Move passage to position" value={index + 1} onChange={(event) => reorderPassage(segment.id, Number(event.target.value) - 1)}>
                    {project.segments.map((_, position) => <option key={position} value={position + 1}>{position + 1}</option>)}
                  </select>
                </label>
                <PassageEditor
                  segment={segment}
                  index={index}
                  active={active}
                  rules={effectivePronunciations(segment, project.pronunciations)}
                  editorRef={(node) => { if (node) editors.current.set(segment.id, node); else editors.current.delete(segment.id); }}
                  onFocus={() => { if (selectedId !== segment.id) { setSelectedId(segment.id); setPhrase(""); setPronunciationOpen(false); } }}
                  onSelection={(text) => { if (text) setPhrase(text); }}
                  onChange={(text) => { if (text !== segment.text) configureSegment(segment.id, { text }); }}
                />
                {(segment.status !== "idle" || segment.needsRegeneration) && <span className={`${styles.status} ${styles[segment.status]}`} role="status"><i />{statusLabel(segment)}</span>}
                {segment.error && <p className={styles.passageError} role="alert">{segment.error}</p>}
                {active && <div className={styles.passageTools} aria-label="Passage options">
                  <div className={styles.passageToolbar}>
                    <strong>Selected passage</strong>
                    <button disabled={segment.status === "generating"} onClick={() => segment.status === "ready" ? void playAudio(segment) : void generateSegment(segment.id, true)}>Preview</button>
                    <button disabled={segment.status === "generating"} onClick={() => void generateSegment(segment.id, true)}>Regenerate</button>
                    <button onClick={openPronunciation}>Pronunciation{segment.pronunciations.length > 0 ? ` (${segment.pronunciations.length})` : ""}</button>
                    <button onClick={() => splitSelectedPassage(segment.id)}>Split at cursor</button>
                    <button disabled={index === 0} onClick={() => mergeAdjacentPassages(project.segments[index - 1].id)}>Merge with previous</button>
                    <button disabled={index === project.segments.length - 1} onClick={() => mergeAdjacentPassages(segment.id)}>Merge with next</button>
                    <button className={styles.closeTools} aria-label="Close passage options" onClick={() => setSelectedId(null)}>×</button>
                  </div>
                  <div className={styles.passageSettings}>
                    <label>Passage language
                      <select value={segment.languageOverride ?? ""} onChange={(event) => changePassageLanguage(segment.id, event.target.value ? event.target.value as SpeechLanguage : null)}>
                        <option value="">Project language ({languageName(project.language)})</option>
                        {SPEECH_LANGUAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                      </select>
                    </label>
                    <label>Voice override
                      <select value={segment.voiceId ?? ""} onChange={(event) => changePassageVoice(segment.id, event.target.value ? event.target.value as NarratorVoice : null)}>
                        <option value="">Project voice</option>
                        {voiceOptions(passageLanguage(segment, project), clonedVoices, hasPremium)}
                      </select>
                    </label>
                    <label>Speed override
                      <select value={segment.speedOverride ?? ""} onChange={(event) => configureSegment(segment.id, { speedOverride: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Project speed ({project.globalSpeed}x)</option>
                        {speeds.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
                      </select>
                    </label>
                    <fieldset className={styles.pauseControls}>
                      <legend>Pause after</legend>
                      <div className={styles.pausePresets}>
                        {pauses.map(([label, ms]) => <button key={label} type="button" className={segment.pauseAfterMs === ms ? styles.activePreset : ""} aria-pressed={segment.pauseAfterMs === ms} onClick={() => configureSegment(segment.id, { pauseAfterMs: ms }, false)}>{label}</button>)}
                        <label>Custom <input type="number" aria-label="Custom pause in milliseconds" min="0" max="10000" step="50" value={segment.pauseAfterMs} onChange={(event) => configureSegment(segment.id, { pauseAfterMs: Math.min(10000, Math.max(0, Number(event.target.value))) }, false)} /> ms</label>
                      </div>
                    </fieldset>
                  </div>
                  <button className={styles.deleteButton} onClick={() => {
                    if (playingIdRef.current === segment.id) stopPlayback();
                    commit((current) => ({ ...current, segments: current.segments.filter((item) => item.id !== segment.id) }));
                    setSelectedId(null);
                  }}>Delete passage</button>
                </div>}
              </div>;
            })}
            <button className={styles.addPassage} onClick={() => {
              const passage = segmentScript("New passage")[0];
              commit((current) => ({ ...current, segments: [...current.segments, passage] }));
              setSelectedId(passage.id);
              setTimeout(() => editors.current.get(passage.id)?.focus(), 0);
            }}>+ Add passage</button>
          </div>
        </div>}
      </section>

      {pronunciationOpen && selected && <StudioDialog title="Passage pronunciation" description="Change how a word or phrase sounds in this passage only. Highlight text in the passage first to fill it in automatically." onClose={() => setPronunciationOpen(false)}>
        <form className={styles.pronunciationForm} onSubmit={addPronunciation}>
          <label>Written phrase<input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="e.g. SQL" /></label>
          <label>Say it like<input value={pronunciation} onChange={(event) => setPronunciation(event.target.value)} placeholder="e.g. sequel" /></label>
          <button className={styles.importButton} disabled={!phrase.trim() || !pronunciation.trim()}>Save pronunciation</button>
        </form>
        {selected.pronunciations.length > 0 ? <div className={styles.rulesSection}><strong>For this passage</strong><ul className={styles.pronunciationList} aria-label="Pronunciation overrides">
          {selected.pronunciations.map((override) => <li key={override.id}><span><strong>{override.phrase}</strong> → {override.pronunciation}</span><button aria-label={`Remove pronunciation for ${override.phrase}`} onClick={() => configureSegment(selected.id, { pronunciations: selected.pronunciations.filter((item) => item.id !== override.id) })}>×</button></li>)}
        </ul></div> : <p className={styles.emptyRules}>No pronunciations added to this passage yet.</p>}
        <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setPronunciationOpen(false)}>Done</button></div>
      </StudioDialog>}

      <footer className={styles.playbar} aria-label="Project voiceover player">
        <div className={styles.nowPlaying}><strong>{project.title || "Untitled narration"}</strong><span role="status">{generationMessage || (readyCount ? "Listen through your voiceover" : "Your voiceover will play here")}</span></div>
        <button className={styles.playerButton} disabled={!playable.length && !voicePreviewPlaying} aria-label={isPlaying ? "Pause voiceover" : "Play voiceover"} onClick={toggleProjectPlayback}>{isPlaying ? "Pause" : "Play"}</button>
        <label className={styles.playerTimeline}><span>{formatTime(playerTime)}</span><input type="range" aria-label="Voiceover position" min="0" max={Math.max(0.01, totalDuration)} step="0.01" value={Math.min(playerTime, totalDuration)} disabled={!playable.length} onChange={(event) => seekProject(Number(event.target.value))} /><span>{formatTime(totalDuration)}</span></label>
        {readyCount > 0 && <button className={styles.exportButton} disabled={readyCount !== project.segments.length || exporting || generatingAll} onClick={() => void downloadVoiceover()}>{exporting ? "Preparing…" : "Export WAV"}</button>}
        <audio ref={audioRef} onTimeUpdate={(event) => { if (playingIdRef.current) setPlayerTime(passageStart(playingIdRef.current) + event.currentTarget.currentTime); }} onEnded={handleAudioEnded} onError={() => { stopPlayback(); setGenerationMessage("Audio playback failed. Try this passage again."); }} />
      </footer>
    </main>
  );
}
