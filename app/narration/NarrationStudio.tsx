"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { synthesize } from "../reader/narration";
import { getAudio, listNarrationProjects, saveAudio, saveNarrationProject } from "../reader/storage";
import { voicesForLanguage } from "../reader/speech";
import type { NarratorVoice } from "../reader/voices";
import {
  createNarrationProject,
  invalidateSegment,
  segmentScript,
  spokenText,
  type NarrationProject,
  type NarrationSegment,
  type PronunciationOverride,
} from "./model";
import styles from "./narration.module.css";

const voices = voicesForLanguage("en");
const speeds = [0.75, 0.85, 0.9, 1, 1.1, 1.2, 1.35];
const pauses = [["Short", 250], ["Medium", 600], ["Long", 1000]] as const;

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function inputKey(segment: NarrationSegment, project: NarrationProject): string {
  return JSON.stringify({
    text: segment.text,
    pronunciations: segment.pronunciations,
    voice: segment.voiceId ?? project.defaultVoice,
    speed: segment.speedOverride ?? project.globalSpeed,
  });
}

function statusLabel(segment: NarrationSegment): string {
  if (segment.status === "generating") return "Generating";
  if (segment.status === "ready") return "Audio ready";
  if (segment.status === "error") return "Needs attention";
  return "Not generated";
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
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [importOpen, setImportOpen] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrl = useRef<string | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationEpoch = useRef(0);
  const editors = useRef(new Map<string, HTMLTextAreaElement>());

  const selected = project.segments.find((segment) => segment.id === selectedId) ?? null;
  const readyCount = project.segments.filter((segment) => segment.status === "ready").length;

  function commit(update: (current: NarrationProject) => NarrationProject) {
    setProject((current) => {
      const next = { ...update(current), updatedAt: new Date().toISOString() };
      projectRef.current = next;
      return next;
    });
  }

  function replaceSegment(id: string, update: (segment: NarrationSegment) => NarrationSegment) {
    commit((current) => ({
      ...current,
      segments: current.segments.map((segment) => segment.id === id ? update(segment) : segment),
    }));
  }

  function configureSegment(id: string, changes: Partial<NarrationSegment>, invalidatesAudio = true) {
    replaceSegment(id, (segment) => {
      const next = { ...segment, ...changes };
      return invalidatesAudio ? invalidateSegment(next) : next;
    });
  }

  useEffect(() => {
    listNarrationProjects()
      .then((projects) => {
        const restored = projects[0] ?? createNarrationProject();
        projectRef.current = restored;
        setProject(restored);
        setSelectedId(restored.segments[0]?.id ?? null);
        setImportOpen(restored.segments.length === 0);
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

  useEffect(() => () => {
    generationEpoch.current += 1;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  function importScript() {
    if (!scriptDraft.trim()) return;
    if (project.segments.length && !window.confirm("Replace the current segments and their generated audio?")) return;
    const segments = segmentScript(scriptDraft);
    commit((current) => ({ ...current, segments }));
    setSelectedId(segments[0]?.id ?? null);
    setImportOpen(false);
    setGenerationMessage(`${segments.length} editable segment${segments.length === 1 ? "" : "s"} created.`);
  }

  function newProject() {
    if (project.segments.length && !window.confirm("Start a new narration project? Your current project will remain saved locally.")) return;
    const next = createNarrationProject();
    projectRef.current = next;
    setProject(next);
    setSelectedId(null);
    setScriptDraft("");
    setImportOpen(true);
    setGenerationMessage("");
  }

  function changeDefaults(changes: Partial<Pick<NarrationProject, "defaultVoice" | "globalSpeed">>) {
    commit((current) => ({
      ...current,
      ...changes,
      segments: current.segments.map(invalidateSegment),
    }));
  }

  async function playAudio(segment: NarrationSegment) {
    if (!segment.audio) return;
    const blob = await getAudio(segment.audio.path);
    if (!blob) {
      configureSegment(segment.id, { status: "idle", audio: null, error: "Cached audio is missing. Generate this segment again." }, false);
      return;
    }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = URL.createObjectURL(blob);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = audioUrl.current;
    setPlayingId(segment.id);
    setGenerationMessage(`Playing segment ${projectRef.current.segments.findIndex((item) => item.id === segment.id) + 1}.`);
    await audio.play();
  }

  async function generateSegment(id: string, playWhenReady = false): Promise<boolean> {
    const currentProject = projectRef.current;
    const segment = currentProject.segments.find((item) => item.id === id);
    if (!segment?.text.trim()) return false;
    const requestKey = inputKey(segment, currentProject);
    const voice = segment.voiceId ?? currentProject.defaultVoice;
    const speed = segment.speedOverride ?? currentProject.globalSpeed;
    replaceSegment(id, (item) => ({ ...item, status: "generating", error: undefined }));
    setGenerationMessage(`Generating segment ${currentProject.segments.findIndex((item) => item.id === id) + 1}...`);
    try {
      const result = await synthesize(
        spokenText(segment), voice, 12,
        (message) => setGenerationMessage(message), false, speed, "en",
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
      setGenerationMessage(`Segment ${savedProject.segments.findIndex((item) => item.id === id) + 1} is ready.`);
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
    for (const id of ids) {
      if (generationEpoch.current !== epoch) break;
      const segment = projectRef.current.segments.find((item) => item.id === id);
      if (segment?.status === "ready") continue;
      await generateSegment(id);
    }
    if (generationEpoch.current === epoch) setGenerationMessage("Narration segments are ready.");
    setGeneratingAll(false);
  }

  async function previewVoice() {
    setGenerationMessage("Preparing voice preview...");
    try {
      const result = await synthesize(
        "This is how your FreeReader narration voice will sound.",
        project.defaultVoice, 12, (message) => setGenerationMessage(message), false, project.globalSpeed, "en",
      );
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = URL.createObjectURL(result.blob);
      if (audioRef.current) {
        audioRef.current.src = audioUrl.current;
        setPlayingId(null);
        await audioRef.current.play();
      }
      setGenerationMessage("Voice preview ready.");
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : "Voice preview failed.");
    }
  }

  function useSelection() {
    if (!selected) return;
    const editor = editors.current.get(selected.id);
    const selection = editor?.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    if (selection) setPhrase(selection);
    else setGenerationMessage("Select a word or phrase in the segment text first.");
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
  }

  function handleAudioEnded() {
    const segment = projectRef.current.segments.find((item) => item.id === playingId);
    setPlayingId(null);
    if (!segment?.pauseAfterMs) return;
    setGenerationMessage(`Pause after segment: ${segment.pauseAfterMs} ms`);
    pauseTimer.current = setTimeout(() => setGenerationMessage("Preview complete."), segment.pauseAfterMs);
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

      <section className={styles.controlbar}>
        <div>
          <label>Project voice
            <select value={project.defaultVoice} onChange={(event) => changeDefaults({ defaultVoice: event.target.value as NarratorVoice })}>
              {voices.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <button className={styles.secondaryButton} onClick={previewVoice}>Preview voice</button>
        </div>
        <label>Global speed
          <select value={project.globalSpeed} onChange={(event) => changeDefaults({ globalSpeed: Number(event.target.value) })}>
            {speeds.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
          </select>
        </label>
        <div className={styles.projectProgress}>
          <span>{readyCount} of {project.segments.length} segments ready</span>
          <progress value={readyCount} max={Math.max(1, project.segments.length)} />
        </div>
        <button
          className={styles.generateButton}
          disabled={!project.segments.length || generatingAll}
          onClick={generatingAll ? () => { generationEpoch.current += 1; setGeneratingAll(false); } : generateAll}
        >
          {generatingAll ? "Stop after segment" : "Generate narration"}
        </button>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.scriptPanel}>
          <button className={styles.panelHeading} onClick={() => setImportOpen((open) => !open)} aria-expanded={importOpen}>
            <span><small>Source</small>Script import</span><i>{importOpen ? "−" : "+"}</i>
          </button>
          {importOpen && <div className={styles.importBody}>
            <p>Paste a long-form script. Paragraphs and long passages become editable segments.</p>
            <textarea
              aria-label="YouTube script"
              placeholder="Paste your YouTube script here..."
              value={scriptDraft}
              onChange={(event) => setScriptDraft(event.target.value)}
            />
            <button className={styles.importButton} disabled={!scriptDraft.trim()} onClick={importScript}>
              {project.segments.length ? "Replace and segment" : "Create segments"}
            </button>
          </div>}
          <div className={styles.structureNote}>
            <strong>Segment structure</strong>
            <span>Audio and controls are saved separately for every passage, ready for future timeline and export tools.</span>
          </div>
        </aside>

        <section className={styles.editorPanel} aria-label="Narration segments">
          <div className={styles.editorHeading}>
            <div><span>Script editor</span><strong>{project.segments.length} segments</strong></div>
            <button onClick={() => {
              const segment = segmentScript("New segment")[0];
              commit((current) => ({ ...current, segments: [...current.segments, segment] }));
              setSelectedId(segment.id);
            }}>+ Add segment</button>
          </div>
          {!project.segments.length && <div className={styles.emptyEditor}>
            <span>01</span>
            <h1>Start with your script</h1>
            <p>Paste it in the source panel. FreeReader will create manageable passages you can edit and generate one at a time.</p>
            <button onClick={() => setImportOpen(true)}>Paste a script</button>
          </div>}
          <div className={styles.segmentList}>
            {project.segments.map((segment, index) => {
              const active = segment.id === selectedId;
              const effectiveVoice = segment.voiceId ?? project.defaultVoice;
              const voiceName = voices.find(([value]) => value === effectiveVoice)?.[1] ?? effectiveVoice;
              return <article
                key={segment.id}
                className={`${styles.segmentCard} ${active ? styles.selectedCard : ""}`}
                onClick={() => setSelectedId(segment.id)}
              >
                <div className={styles.segmentNumber}>{String(index + 1).padStart(2, "0")}</div>
                <div className={styles.segmentContent}>
                  <textarea
                    ref={(node) => { if (node) editors.current.set(segment.id, node); else editors.current.delete(segment.id); }}
                    aria-label={`Segment ${index + 1} text`}
                    value={segment.text}
                    onFocus={() => setSelectedId(segment.id)}
                    onChange={(event) => configureSegment(segment.id, { text: event.target.value })}
                  />
                  <div className={styles.segmentMeta}>
                    <span>{segment.text.trim().split(/\s+/).filter(Boolean).length} words</span>
                    <span>{voiceName}</span>
                    <span>{segment.speedOverride ?? project.globalSpeed}x</span>
                    <span>{segment.pauseAfterMs} ms pause</span>
                  </div>
                  {segment.error && <p className={styles.segmentError} role="alert">{segment.error}</p>}
                </div>
                <div className={styles.segmentActions}>
                  <span className={`${styles.status} ${styles[segment.status]}`}><i />{statusLabel(segment)}</span>
                  <div>
                    {segment.status === "ready" && <button onClick={(event) => { event.stopPropagation(); void playAudio(segment); }}>Play</button>}
                    <button
                      disabled={segment.status === "generating"}
                      onClick={(event) => { event.stopPropagation(); setSelectedId(segment.id); void generateSegment(segment.id, true); }}
                    >{segment.status === "ready" ? "Regenerate" : "Preview"}</button>
                  </div>
                </div>
              </article>;
            })}
          </div>
        </section>

        <aside className={styles.inspector}>
          <div className={styles.inspectorHeading}><span>Segment controls</span><strong>{selected ? `Segment ${project.segments.findIndex((item) => item.id === selected.id) + 1}` : "No selection"}</strong></div>
          {!selected && <p className={styles.noSelection}>Select a segment to tune its delivery.</p>}
          {selected && <>
            <section className={styles.controlSection}>
              <label>Voice
                <select value={selected.voiceId ?? ""} onChange={(event) => configureSegment(selected.id, { voiceId: event.target.value ? event.target.value as NarratorVoice : null })}>
                  <option value="">Project voice</option>
                  {voices.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <label>Speaking speed
                <select value={selected.speedOverride ?? ""} onChange={(event) => configureSegment(selected.id, { speedOverride: event.target.value ? Number(event.target.value) : null })}>
                  <option value="">Project speed ({project.globalSpeed}x)</option>
                  {speeds.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
                </select>
              </label>
              <div className={styles.modelRow}><span>Model</span><strong>{selected.modelId ?? "Automatic"}</strong></div>
            </section>

            <section className={styles.controlSection}>
              <div className={styles.sectionTitle}><span>Pause after</span><strong>{selected.pauseAfterMs} ms</strong></div>
              <div className={styles.pausePresets}>
                {pauses.map(([label, milliseconds]) => <button
                  key={label}
                  className={selected.pauseAfterMs === milliseconds ? styles.activePreset : ""}
                  onClick={() => configureSegment(selected.id, { pauseAfterMs: milliseconds }, false)}
                >{label}</button>)}
              </div>
              <label className={styles.customPause}>Custom milliseconds
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="50"
                  value={selected.pauseAfterMs}
                  onChange={(event) => configureSegment(selected.id, { pauseAfterMs: Math.max(0, Number(event.target.value)) }, false)}
                />
              </label>
            </section>

            <section className={styles.controlSection}>
              <div className={styles.sectionTitle}><span>Pronunciation</span><button onClick={useSelection}>Use selected text</button></div>
              <form className={styles.pronunciationForm} onSubmit={addPronunciation}>
                <label>Written phrase<input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="e.g. SQL" /></label>
                <label>Say it like<input value={pronunciation} onChange={(event) => setPronunciation(event.target.value)} placeholder="e.g. sequel" /></label>
                <button disabled={!phrase.trim() || !pronunciation.trim()}>Add override</button>
              </form>
              {selected.pronunciations.length > 0 && <ul className={styles.pronunciationList}>
                {selected.pronunciations.map((override) => <li key={override.id}>
                  <span><strong>{override.phrase}</strong><i>→</i>{override.pronunciation}</span>
                  <button aria-label={`Remove pronunciation for ${override.phrase}`} onClick={() => configureSegment(selected.id, { pronunciations: selected.pronunciations.filter((item) => item.id !== override.id) })}>×</button>
                </li>)}
              </ul>}
              <small>Every matching occurrence is replaced only when speech is generated. Your visible script stays unchanged.</small>
            </section>

            <button className={styles.previewButton} disabled={selected.status === "generating"} onClick={() => void generateSegment(selected.id, true)}>
              {selected.status === "ready" ? "Regenerate and preview" : "Generate selected preview"}
            </button>
            <button className={styles.deleteButton} onClick={() => {
              const index = project.segments.findIndex((segment) => segment.id === selected.id);
              commit((current) => ({ ...current, segments: current.segments.filter((segment) => segment.id !== selected.id) }));
              setSelectedId(project.segments[index + 1]?.id ?? project.segments[index - 1]?.id ?? null);
            }}>Delete segment</button>
          </>}
        </aside>
      </div>

      <footer className={styles.playbar}>
        <div className={styles.nowPlaying}><i className={playingId ? styles.playingDot : ""} /><span>{generationMessage || "Select a segment to preview its narration."}</span></div>
        <audio ref={audioRef} controls onEnded={handleAudioEnded} />
        <span>{selected ? `${selected.pauseAfterMs} ms after selected segment` : "Segment audio is stored locally"}</span>
      </footer>
    </main>
  );
}
