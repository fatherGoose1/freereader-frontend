"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { synthesize } from "../reader/narration";
import { getAudio, listNarrationProjects, saveAudio, saveNarrationProject } from "../reader/storage";
import { englishVoices, type NarratorVoice } from "../reader/voices";
import { initAuthToken } from "../reader/authToken";
import { supabaseClient } from "../reader/supabase";
import { fetchUsage, formatRemaining, linkInstallation, type UsageSummary } from "../reader/usage";
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

const voices = englishVoices();
const speeds = [0.75, 0.85, 0.9, 1, 1.1, 1.2, 1.35];
const pauses = [["Short", 250], ["Medium", 600], ["Long", 1000]] as const;

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function voiceOptions() {
  return voices.map(([value, name]) => <option key={value} value={value}>{name}</option>);
}

function inputKey(segment: NarrationSegment, project: NarrationProject): string {
  return JSON.stringify({
    text: segment.text,
    spoken: spokenText(segment, project.pronunciations),
    voice: segment.voiceId ?? project.defaultVoice,
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

  const selected = project.segments.find((segment) => segment.id === selectedId) ?? null;
  const readyCount = project.segments.filter((segment) => segment.status === "ready").length;
  const hasGeneratedAudio = project.segments.some((segment) => !!segment.audio || !!segment.needsRegeneration);
  const playable = project.segments.filter((segment) => segment.status === "ready" && segment.audio);
  const totalDuration = playable.reduce((sum, segment, index) => sum + (segment.audio?.duration ?? 0) + (index < playable.length - 1 ? segment.pauseAfterMs / 1000 : 0), 0);
  const generationPercent = generationProgress ? Math.round(generationProgress.completed / generationProgress.total * 100) : 0;

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
        const restored = { ...saved, pronunciations: saved.pronunciations ?? [] };
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

  useEffect(() => () => {
    generationEpoch.current += 1;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  function importScript() {
    if (!scriptDraft.trim()) return;
    if (project.segments.length && !window.confirm("Replace this script and its generated voiceover?")) return;
    stopPlayback();
    stopGeneration();
    const segments = segmentScript(scriptDraft);
    commit((current) => ({ ...current, segments }));
    setSelectedId(null);
    setPlayerTime(0);
    setScriptDraft("");
    setImportOpen(false);
    setGenerationMessage("Script ready. Edit it here, then generate your voiceover.");
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
    const voice = segment.voiceId ?? currentProject.defaultVoice;
    const speed = segment.speedOverride ?? currentProject.globalSpeed;
    replaceSegment(id, (item) => ({ ...item, status: "generating", error: undefined }));
    setGenerationMessage(`Generating passage ${currentProject.segments.findIndex((item) => item.id === id) + 1}…`);
    try {
      const result = await synthesize(
        spokenText(segment, currentProject.pronunciations), voice, 12,
        (message) => setGenerationMessage(message), false, speed, "en", undefined, "youtube_narration",
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

  async function previewVoice() {
    stopPlayback();
    const epoch = playbackEpoch.current;
    setGenerationMessage("Preparing voice preview...");
    try {
      const result = await synthesize(
        "This is how your FreeReader narration voice will sound.",
        project.defaultVoice, 12, (message) => setGenerationMessage(message), false, project.globalSpeed, "en", undefined, "youtube_narration",
      );
      if (epoch !== playbackEpoch.current) return;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = URL.createObjectURL(result.blob);
      if (audioRef.current) {
        audioRef.current.src = audioUrl.current;
        voicePreviewRef.current = true;
        setVoicePreviewPlaying(true);
        await audioRef.current.play();
        setIsPlaying(true);
      }
      setGenerationMessage("Voice preview ready.");
    } catch (error) {
      if (epoch === playbackEpoch.current) stopPlayback();
      setGenerationMessage(error instanceof Error ? error.message : "Voice preview failed.");
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
          <Link href="/reader" className={styles.brand}><img src="/icon.svg" alt="" />FreeReader</Link>
          <span className={styles.mode}>Narration Studio</span>
        </div>
        <input
          className={styles.projectTitle}
          aria-label="Project title"
          value={project.title}
          onChange={(event) => commit((current) => ({ ...current, title: event.target.value }))}
        />
        <div className={styles.topActions}>
          <span>{saveState}</span>
          <button onClick={newProject}>New project</button>
        </div>
      </header>

      <section className={styles.controlbar} aria-label="Voiceover settings">
        <label>Project voice
          <select value={project.defaultVoice} onChange={(event) => changeDefaults({ defaultVoice: event.target.value as NarratorVoice })}>
            {voiceOptions()}
          </select>
        </label>
        <label>Global speaking speed
          <select value={project.globalSpeed} onChange={(event) => changeDefaults({ globalSpeed: Number(event.target.value) })}>
            {speeds.map((speed) => <option key={speed} value={speed}>{speed}x</option>) }
          </select>
        </label>
        <button className={styles.secondaryButton} onClick={() => void previewVoice()}>Preview voice</button>
        {usage && <span className={styles.usageRemaining}>{formatRemaining(usage.remaining_seconds)} left this month</span>}
        <button className={styles.generateButton} disabled={!project.segments.length || (readyCount === project.segments.length && !generatingAll)} onClick={generatingAll ? stopGeneration : () => void generateAll()}>
          {generatingAll && generationProgress ? <>
            <span className={styles.generateFill} style={{ width: `${generationPercent}%` }} aria-hidden="true" />
            <span className={styles.generateLabel}>Generating {generationProgress.current} of {generationProgress.total} · {generationPercent}%</span>
            <small>Click to stop after this passage</small>
          </> : readyCount === project.segments.length && readyCount > 0 ? "Voiceover ready" : "Generate voiceover"}
        </button>
        {readyCount === project.segments.length && readyCount > 0 && !generatingAll && <button className={styles.readyExport} disabled={exporting} onClick={() => void downloadVoiceover()}>{exporting ? "Preparing WAV…" : "Download WAV voiceover"}</button>}
      </section>

      <section className={styles.globalPronunciations} aria-label="Global pronunciations">
        <div className={styles.globalPronunciationsInner}>
          <strong>Global pronunciation</strong>
          <form onSubmit={addGlobalPronunciation}>
            <label>Search text<input value={globalPhrase} onChange={(event) => setGlobalPhrase(event.target.value)} placeholder="e.g. SQL" /></label>
            <label>Say it like<input value={globalPronunciation} onChange={(event) => setGlobalPronunciation(event.target.value)} placeholder="e.g. sequel" /></label>
            <button disabled={!globalPhrase.trim() || !globalPronunciation.trim()}>Save pronunciation</button>
          </form>
          {project.pronunciations.length > 0 && <ul aria-label="Global pronunciation rules">
            {project.pronunciations.map((rule) => <li key={rule.id}>
              <ruby className={styles.pronunciationMark}><s>{rule.phrase}</s><rt>{rule.pronunciation}</rt></ruby>
              <button aria-label={`Remove global pronunciation for ${rule.phrase}`} onClick={() => changeGlobalPronunciations(projectRef.current.pronunciations.filter((item) => item.id !== rule.id))}>×</button>
            </li>)}
          </ul>}
          <small>Used throughout the script. A pronunciation set on one passage takes priority there.</small>
        </div>
      </section>

      <section className={styles.workspace} aria-label="Script workspace">
        {!project.segments.length ? <div className={styles.emptyEditor}>
          <h1>Start with your script</h1>
          <p>Paste your YouTube script here. You can edit it before generating and fine-tune individual passages afterward.</p>
          <label className={styles.fileImport}>Import a text file<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { void importScriptFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
          <label htmlFor="script-import">YouTube script</label>
          <textarea id="script-import" placeholder="Paste your script here…" value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} />
          <button className={styles.importButton} disabled={!scriptDraft.trim()} onClick={importScript}>Add script</button>
        </div> : <div className={styles.editorPanel}>
          <div className={styles.editorHeading}>
            <div><h1>Script</h1><p>{hasGeneratedAudio ? `${readyCount} of ${project.segments.length} passages ready to listen` : "Edit your script, then generate your voiceover."}</p></div>
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
                    <button onClick={openPronunciation}>Pronunciation</button>
                    <button onClick={() => splitSelectedPassage(segment.id)}>Split at cursor</button>
                    <button disabled={index === 0} onClick={() => mergeAdjacentPassages(project.segments[index - 1].id)}>Merge with previous</button>
                    <button disabled={index === project.segments.length - 1} onClick={() => mergeAdjacentPassages(segment.id)}>Merge with next</button>
                    <button className={styles.closeTools} aria-label="Close passage options" onClick={() => setSelectedId(null)}>×</button>
                  </div>
                  <div className={styles.passageSettings}>
                    <label>Voice override
                      <select value={segment.voiceId ?? ""} onChange={(event) => changePassageVoice(segment.id, event.target.value ? event.target.value as NarratorVoice : null)}>
                        <option value="">Project voice</option>
                        {voiceOptions()}
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
                  {pronunciationOpen && <form className={styles.pronunciationForm} onSubmit={addPronunciation}>
                    <p>Highlight a word or phrase above to fill the written text.</p>
                    <label>Written phrase<input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="e.g. SQL" /></label>
                    <label>Say it like<input value={pronunciation} onChange={(event) => setPronunciation(event.target.value)} placeholder="e.g. sequel" /></label>
                    <button disabled={!phrase.trim() || !pronunciation.trim()}>Save pronunciation</button>
                  </form>}
                  {segment.pronunciations.length > 0 && <ul className={styles.pronunciationList} aria-label="Pronunciation overrides">
                    {segment.pronunciations.map((override) => <li key={override.id}><span><strong>{override.phrase}</strong> → {override.pronunciation}</span><button aria-label={`Remove pronunciation for ${override.phrase}`} onClick={() => configureSegment(segment.id, { pronunciations: segment.pronunciations.filter((item) => item.id !== override.id) })}>×</button></li>)}
                  </ul>}
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
