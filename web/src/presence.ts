import type { AiTranscriptionCreateResult } from "@gsv/protocol/syscalls/ai";
import type { GatewayClientLike } from "./gateway-client";

type PresenceOptions = {
  rootNode: HTMLElement;
  gatewayClient: GatewayClientLike;
};

type PresenceMode = "ambient" | "push";
type PresenceState =
  | "idle"
  | "listening"
  | "capturing"
  | "recording"
  | "transcribing"
  | "sending"
  | "unsupported"
  | "error";

type PresenceLogStatus =
  | "Sending"
  | "Queued"
  | "Working"
  | "Responding"
  | "Using tools"
  | "Needs approval"
  | "Done"
  | "Stopped"
  | "Failed";

type PresenceSendResult = {
  runId: string;
  queued?: boolean;
};

type PresenceRun = {
  row: HTMLElement | null;
  prompt: string;
  answer: string;
  status: PresenceLogStatus;
  updatedAt: number;
};

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const VOICE_AUDIO_BITS_PER_SECOND = 128000;
const MAX_PUSH_RECORDING_MS = 2 * 60 * 1000;
const MAX_AMBIENT_SEGMENT_MS = 45 * 1000;
const AMBIENT_SAMPLE_MS = 100;
const AMBIENT_START_MS = 100;
const AMBIENT_END_SILENCE_MS = 3000;
const AMBIENT_MIN_SEGMENT_MS = 450;
const AMBIENT_MIN_SEGMENT_BYTES = 900;
const AMBIENT_RMS_THRESHOLD = 0.018;
const PRESENCE_RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm",
];

export function createPresenceControl(options: PresenceOptions): { destroy(): void } {
  const { rootNode, gatewayClient } = options;
  const toggles = Array.from(rootNode.querySelectorAll<HTMLButtonElement>("[data-presence-toggle]"));
  const panel = rootNode.querySelector<HTMLElement>("[data-presence-panel]");
  const closeButton = rootNode.querySelector<HTMLButtonElement>("[data-presence-close]");
  const listenButton = rootNode.querySelector<HTMLButtonElement>("[data-presence-listen]");
  const sendButton = rootNode.querySelector<HTMLButtonElement>("[data-presence-send]");
  const clearButton = rootNode.querySelector<HTMLButtonElement>("[data-presence-clear]");
  const statusNode = rootNode.querySelector<HTMLElement>("[data-presence-status]");
  const transcriptNode = rootNode.querySelector<HTMLTextAreaElement>("[data-presence-transcript]");
  const noteNode = rootNode.querySelector<HTMLElement>("[data-presence-interim]");
  const logNode = rootNode.querySelector<HTMLElement>("[data-presence-log]");
  const activityNode = rootNode.querySelector<HTMLButtonElement>("[data-presence-activity]");
  const activityStatusNode = rootNode.querySelector<HTMLElement>("[data-presence-activity-status]");
  const activityBodyNode = rootNode.querySelector<HTMLElement>("[data-presence-activity-body]");
  const modeButtons = Array.from(rootNode.querySelectorAll<HTMLButtonElement>("[data-presence-mode]"));

  if (!panel || toggles.length === 0 || !listenButton || !sendButton || !clearButton || !statusNode || !transcriptNode) {
    return { destroy() {} };
  }

  const panelNode = panel;
  const listenNode = listenButton;
  const sendNode = sendButton;
  const clearNode = clearButton;
  const statusTextNode = statusNode;
  const transcriptInputNode = transcriptNode;

  let mode: PresenceMode = canUseAmbientMode() ? "ambient" : "push";
  let state: PresenceState = canUseBrowserVoiceRecorder() ? "idle" : "unsupported";
  let note = "";
  let panelOpen = false;
  let destroyed = false;
  let lastSentText = "";
  let latestRunId: string | null = null;
  let activityHideTimer: number | null = null;
  const activeRuns = new Map<string, PresenceRun>();

  let pushRecorder: MediaRecorder | null = null;
  let pushStream: MediaStream | null = null;
  let pushChunks: Blob[] = [];
  let pushStartedAt = 0;
  let pushTimer: number | null = null;

  let ambientStream: MediaStream | null = null;
  let ambientMimeType = "audio/webm";
  let ambientContext: AudioContext | null = null;
  let ambientSource: MediaStreamAudioSourceNode | null = null;
  let ambientAnalyser: AnalyserNode | null = null;
  let ambientSamples: Float32Array<ArrayBuffer> | null = null;
  let ambientTimer: number | null = null;
  let ambientSegmentRecorder: MediaRecorder | null = null;
  let ambientSegmentChunks: Blob[] = [];
  let ambientSpeechActive = false;
  let ambientSpeechMs = 0;
  let ambientLastVoiceAt = 0;
  let ambientSegmentStartedAt = 0;
  let ambientPendingJobs = 0;

  function setPanelOpen(open: boolean): void {
    panelOpen = open;
    panelNode.hidden = !open;
    for (const toggle of toggles) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function setMode(nextMode: PresenceMode): void {
    if (mode === nextMode) {
      return;
    }
    if (state === "recording") {
      stopPushRecording();
    }
    if (ambientStream) {
      stopAmbient();
    }
    mode = nextMode;
    note = mode === "ambient" ? "Auto-send is on" : "";
    transcriptInputNode.placeholder = mode === "ambient" ? "Ambient transcripts auto-send. Type here for a manual message." : "Ask Personal Agent";
    setState(canUseBrowserVoiceRecorder() ? "idle" : "unsupported");
  }

  function setState(next: PresenceState, message?: string): void {
    state = next;
    const connected = gatewayClient.isConnected();
    const hasTranscript = transcriptInputNode.value.trim().length > 0;
    const recorderAvailable = canUseBrowserVoiceRecorder();
    const ambientAvailable = canUseAmbientMode();
    statusTextNode.textContent = message ?? statusText(next, connected, activeRuns.size);
    transcriptInputNode.placeholder = mode === "ambient"
      ? "Ambient transcripts auto-send. Type here for a manual message."
      : recorderAvailable ? "Ask Personal Agent" : "Type a message to Personal Agent";
    if (noteNode) {
      noteNode.textContent = note;
    }
    listenNode.textContent = listenButtonText();
    listenNode.disabled = mode === "ambient"
      ? !connected || !ambientAvailable || (!ambientStream && (next === "sending" || next === "transcribing"))
      : next === "sending" || next === "transcribing" || !connected || !recorderAvailable;
    sendNode.disabled = next === "sending" || next === "transcribing" || !connected || !hasTranscript;
    clearNode.disabled = next === "sending" || next === "transcribing" || (!hasTranscript && !note && !lastSentText);
    for (const toggle of toggles) {
      toggle.dataset.state = next;
      toggle.dataset.agent = activeRuns.size > 0 ? "active" : "idle";
      toggle.title = statusText(next, connected, activeRuns.size);
    }
    for (const button of modeButtons) {
      const buttonMode = normalizePresenceMode(button.dataset.presenceMode);
      const selected = buttonMode === mode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.disabled = (buttonMode === "ambient" && !ambientAvailable) || (next === "recording" || next === "capturing");
    }
  }

  function listenButtonText(): string {
    if (mode === "ambient") {
      return ambientStream ? "Stop ambient" : "Start ambient";
    }
    return state === "recording" ? "Stop" : "Listen";
  }

  async function startPushRecording(): Promise<void> {
    if (!canUseBrowserVoiceRecorder() || !gatewayClient.isConnected()) {
      setState(canUseBrowserVoiceRecorder() ? "idle" : "unsupported");
      return;
    }
    cleanupPushRecorder();
    setPanelOpen(true);
    note = "";
    setState("recording", "Requesting microphone");
    try {
      const stream = await requestVoiceStream();
      if (destroyed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = selectVoiceRecorderMimeType();
      const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: VOICE_AUDIO_BITS_PER_SECOND };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      pushRecorder = new MediaRecorder(stream, recorderOptions);
      pushStream = stream;
      pushChunks = [];
      pushStartedAt = Date.now();

      pushRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          pushChunks.push(event.data);
        }
      };
      pushRecorder.onerror = () => {
        cleanupPushRecorder();
        note = "";
        setState("error", "Voice recording failed");
      };
      pushRecorder.onstop = () => {
        void finishPushRecording();
      };
      pushRecorder.start(1000);
      pushTimer = window.setInterval(() => {
        const elapsedMs = Date.now() - pushStartedAt;
        note = `Recording ${formatElapsed(elapsedMs)}`;
        setState("recording");
        if (elapsedMs >= MAX_PUSH_RECORDING_MS && pushRecorder?.state === "recording") {
          stopPushRecording();
        }
      }, 250);
      note = "Recording 0:00";
      setState("recording");
    } catch (error) {
      cleanupPushRecorder();
      note = "";
      setState("error", "Microphone failed: " + formatError(error));
    }
  }

  function stopPushRecording(): void {
    const current = pushRecorder;
    if (!current || current.state === "inactive") {
      cleanupPushRecorder();
      setState("idle");
      return;
    }
    clearPushTimer();
    note = "Transcribing";
    setState("transcribing");
    current.stop();
  }

  async function finishPushRecording(): Promise<void> {
    clearPushTimer();
    const chunks = pushChunks.slice();
    const mimeType = pushRecorder?.mimeType || chunks.find((chunk) => chunk.type)?.type || "audio/webm";
    cleanupPushRecorder();
    if (destroyed) {
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      note = "";
      setState("error", "No audio was captured");
      return;
    }

    note = "Transcribing";
    setState("transcribing");
    try {
      const result = await transcribeBlob(blob, mimeType);
      transcriptInputNode.value = appendTranscript(transcriptInputNode.value, result.text);
      note = transcriptionNote(result);
      setState("idle", "Transcribed");
    } catch (error) {
      note = "";
      setState("error", "Transcription failed: " + formatError(error));
    }
  }

  async function startAmbient(): Promise<void> {
    if (!canUseAmbientMode() || !gatewayClient.isConnected()) {
      setState(canUseBrowserVoiceRecorder() ? "idle" : "unsupported");
      return;
    }
    stopAmbient();
    setPanelOpen(true);
    note = "Requesting microphone";
    setState("listening");
    try {
      const stream = await requestVoiceStream();
      if (destroyed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = selectVoiceRecorderMimeType();
      ambientStream = stream;
      ambientMimeType = mimeType || "audio/webm";
      ambientContext = createAudioContext();
      ambientSource = ambientContext.createMediaStreamSource(stream);
      ambientAnalyser = ambientContext.createAnalyser();
      ambientAnalyser.fftSize = 2048;
      ambientSource.connect(ambientAnalyser);
      ambientSamples = new Float32Array(ambientAnalyser.fftSize) as Float32Array<ArrayBuffer>;

      ambientTimer = window.setInterval(tickAmbientVad, AMBIENT_SAMPLE_MS);
      note = "Auto-send is on";
      setState("listening", "Ambient on");
    } catch (error) {
      stopAmbient();
      note = "";
      setState("error", "Microphone failed: " + formatError(error));
    }
  }

  function stopAmbient(): void {
    clearAmbientTimer();
    stopAmbientSegment("stop");
    ambientSpeechActive = false;
    ambientSpeechMs = 0;
    ambientLastVoiceAt = 0;
    ambientSegmentStartedAt = 0;

    ambientSource?.disconnect();
    ambientSource = null;
    ambientAnalyser?.disconnect();
    ambientAnalyser = null;
    ambientSamples = null;
    const context = ambientContext;
    ambientContext = null;
    void context?.close().catch(() => {});
    const stream = ambientStream;
    ambientStream = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (state === "listening" || state === "capturing" || state === "transcribing" || state === "sending") {
      note = activeRuns.size > 0 ? ambientIdleNote() : "";
      setState("idle", activeRuns.size > 0 ? "Agent working" : "Ambient off");
    }
  }

  function tickAmbientVad(): void {
    if (!ambientAnalyser || !ambientSamples || !ambientStream) {
      return;
    }
    const now = Date.now();
    const rms = currentRms(ambientAnalyser, ambientSamples);
    const speechNow = rms >= AMBIENT_RMS_THRESHOLD;

    if (speechNow) {
      ambientSpeechMs += AMBIENT_SAMPLE_MS;
      ambientLastVoiceAt = now;
      if (!ambientSpeechActive && ambientSpeechMs >= AMBIENT_START_MS) {
        startAmbientSegment(now - ambientSpeechMs);
      }
    } else {
      ambientSpeechMs = 0;
    }

    if (!ambientSpeechActive) {
      note = ambientIdleNote();
      setState(ambientPendingJobs > 0 ? "transcribing" : "listening");
      return;
    }

    const segmentMs = now - ambientSegmentStartedAt;
    const silenceMs = now - ambientLastVoiceAt;
    note = `Capturing ${formatElapsed(segmentMs)}`;
    setState("capturing");
    if (silenceMs >= AMBIENT_END_SILENCE_MS || segmentMs >= MAX_AMBIENT_SEGMENT_MS) {
      stopAmbientSegment(silenceMs >= AMBIENT_END_SILENCE_MS ? "silence" : "max");
    }
  }

  function startAmbientSegment(startedAt: number): void {
    if (!ambientStream || ambientSegmentRecorder) {
      return;
    }
    const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: VOICE_AUDIO_BITS_PER_SECOND };
    if (ambientMimeType) {
      recorderOptions.mimeType = ambientMimeType;
    }
    const recorder = new MediaRecorder(ambientStream, recorderOptions);
    ambientSegmentRecorder = recorder;
    ambientSegmentChunks = [];
    ambientSegmentStartedAt = startedAt;
    ambientSpeechActive = true;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        ambientSegmentChunks.push(event.data);
      }
    };
    recorder.onerror = () => {
      ambientSegmentRecorder = null;
      ambientSegmentChunks = [];
      ambientSpeechActive = false;
      note = "";
      setState("error", "Ambient recording failed");
    };
    recorder.onstop = () => {
      const chunks = ambientSegmentChunks.slice();
      const mimeType = recorder.mimeType || ambientMimeType;
      const segmentStartedAt = ambientSegmentStartedAt || Date.now();
      ambientSegmentRecorder = null;
      ambientSegmentChunks = [];
      ambientSegmentStartedAt = 0;
      void queueAmbientSegment(chunks, mimeType, segmentStartedAt);
    };
    recorder.start(250);
    note = "Capturing speech";
    setState("capturing");
  }

  function stopAmbientSegment(reason: "silence" | "max" | "stop"): void {
    const recorder = ambientSegmentRecorder;
    ambientSpeechActive = false;
    ambientSpeechMs = 0;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    if (reason === "max") {
      note = "Segment reached time limit";
    } else if (reason === "stop") {
      note = "Stopping ambient";
    } else {
      note = "Speech ended";
    }
    setState("transcribing");
    try {
      recorder.stop();
    } catch {
      ambientSegmentRecorder = null;
      ambientSegmentChunks = [];
    }
  }

  async function queueAmbientSegment(
    chunks: Blob[],
    mimeType: string,
    startedAt: number,
  ): Promise<void> {
    const durationMs = Date.now() - startedAt;
    if (durationMs < AMBIENT_MIN_SEGMENT_MS || totalBlobSize(chunks) < AMBIENT_MIN_SEGMENT_BYTES) {
      note = ambientIdleNote();
      setState("listening");
      return;
    }
    await processAmbientSegment(chunks, mimeType, startedAt);
  }

  async function processAmbientSegment(
    chunks: Blob[],
    mimeType: string,
    startedAt: number,
  ): Promise<void> {
    ambientPendingJobs += 1;
    const blob = new Blob(chunks, { type: mimeType });
    let logRow: HTMLElement | null = null;
    note = "Transcribing speech";
    if (!ambientSpeechActive) {
      setState("transcribing");
    }
    try {
      const result = await transcribeBlob(blob, mimeType, startedAt);
      const text = result.text.trim();
      if (!text) {
        throw new Error("No speech was transcribed");
      }
      logRow = addPresenceLog(logNode, "Sending", text, startedAt);
      note = "Sending ambient segment";
      if (!ambientSpeechActive) {
        setState("sending");
      }
      const sent = await sendTextToPersonalAgent(text);
      lastSentText = text;
      updatePresenceLog(logRow, sent.queued ? "Queued" : "Working");
      trackRun(sent.runId, logRow, text);
      note = sent.queued ? "Queued for Personal Agent" : "Personal Agent is working";
      if (transcriptInputNode.value.trim() === text) {
        transcriptInputNode.value = "";
      }
    } catch (error) {
      const message = formatError(error);
      note = "";
      setState("error", "Ambient failed: " + message);
      if (logRow) {
        updatePresenceLog(logRow, "Failed", message);
      } else {
        addPresenceLog(logNode, "Failed", message, startedAt);
      }
    } finally {
      ambientPendingJobs = Math.max(0, ambientPendingJobs - 1);
      if (!destroyed && ambientStream && !ambientSpeechActive && state !== "error") {
        note = ambientIdleNote();
        setState(ambientPendingJobs > 0 ? "transcribing" : "listening");
      }
    }
  }

  async function transcribeBlob(blob: Blob, mimeType: string, startedAt = Date.now()): Promise<AiTranscriptionCreateResult> {
    const data = await blobToDataUrl(blob);
    const result = await gatewayClient.call<AiTranscriptionCreateResult>("ai.transcription.create", {
      audio: {
        data,
        mimeType,
        filename: presenceRecordingFilename(mimeType, startedAt),
        size: blob.size,
      },
    });
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (!text) {
      throw new Error("No speech was transcribed");
    }
    return { ...result, text };
  }

  async function sendTextToPersonalAgent(message: string): Promise<PresenceSendResult> {
    const spawned = await gatewayClient.spawnProcess({
      profile: "init",
      label: "Personal Agent",
      workspace: { mode: "none" },
    });
    if (!spawned.ok) {
      throw new Error(spawned.error);
    }
    const result = await gatewayClient.sendMessage(message, spawned.pid);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return {
      runId: result.runId,
      queued: result.queued,
    };
  }

  function cleanupPushRecorder(): void {
    clearPushTimer();
    const current = pushRecorder;
    pushRecorder = null;
    pushChunks = [];
    pushStartedAt = 0;
    if (current && current.state !== "inactive") {
      current.ondataavailable = null;
      current.onerror = null;
      current.onstop = null;
      try {
        current.stop();
      } catch {
        // Recorder state can change between the state check and stop call.
      }
    }
    const stream = pushStream;
    pushStream = null;
    stream?.getTracks().forEach((track) => track.stop());
  }

  function clearPushTimer(): void {
    if (pushTimer !== null) {
      window.clearInterval(pushTimer);
      pushTimer = null;
    }
  }

  function clearAmbientTimer(): void {
    if (ambientTimer !== null) {
      window.clearInterval(ambientTimer);
      ambientTimer = null;
    }
  }

  function ambientIdleNote(): string {
    if (ambientPendingJobs > 0) {
      return `Processing ${ambientPendingJobs}`;
    }
    if (activeRuns.size > 0) {
      return activeRuns.size === 1 ? "Personal Agent is working" : `${activeRuns.size} agent jobs running`;
    }
    return "Listening for speech";
  }

  function trackRun(runId: string, row: HTMLElement | null, prompt: string): void {
    activeRuns.set(runId, {
      row,
      prompt,
      answer: "",
      status: "Working",
      updatedAt: Date.now(),
    });
    latestRunId = runId;
    showPresenceActivity("Working", prompt);
    setState(state);
  }

  function clearActivityHideTimer(): void {
    if (activityHideTimer !== null) {
      window.clearTimeout(activityHideTimer);
      activityHideTimer = null;
    }
  }

  function showPresenceActivity(status: PresenceLogStatus, body: string, tone = statusKey(status)): void {
    if (!activityNode || !activityStatusNode || !activityBodyNode) {
      return;
    }
    clearActivityHideTimer();
    activityNode.hidden = false;
    activityNode.dataset.status = tone;
    activityStatusNode.textContent = status;
    activityBodyNode.textContent = truncateActivityText(body.trim() || status);
  }

  function hidePresenceActivity(): void {
    if (!activityNode) {
      return;
    }
    activityNode.hidden = true;
    delete activityNode.dataset.status;
  }

  function newestActiveRunId(): string | null {
    let nextRunId: string | null = null;
    let latestUpdatedAt = 0;
    for (const [runId, run] of activeRuns.entries()) {
      if (run.updatedAt >= latestUpdatedAt) {
        nextRunId = runId;
        latestUpdatedAt = run.updatedAt;
      }
    }
    return nextRunId;
  }

  function renderLatestActiveActivity(): void {
    const runId = latestRunId && activeRuns.has(latestRunId) ? latestRunId : newestActiveRunId();
    latestRunId = runId;
    if (!runId) {
      hidePresenceActivity();
      return;
    }
    const run = activeRuns.get(runId);
    if (run) {
      showPresenceActivity(run.status, run.answer || run.prompt);
    }
  }

  function scheduleActivityAfterCompletion(completedRunId: string): void {
    latestRunId = latestRunId === completedRunId ? newestActiveRunId() : latestRunId;
    clearActivityHideTimer();
    activityHideTimer = window.setTimeout(() => {
      activityHideTimer = null;
      renderLatestActiveActivity();
    }, activeRuns.size > 0 ? 4500 : 12000);
  }

  function handleRunSignal(signal: string, payload: unknown): void {
    const runId = runIdFromSignalPayload(payload);
    if (!runId) {
      return;
    }
    const run = activeRuns.get(runId);
    if (!run) {
      return;
    }

    if (signal === "chat.text") {
      run.status = "Responding";
      run.updatedAt = Date.now();
      run.answer = signalPayloadText(payload) ?? run.answer;
      latestRunId = runId;
      updatePresenceLog(run.row, "Responding");
      note = "Personal Agent is responding";
      showPresenceActivity("Responding", run.answer || run.prompt);
      setState(state);
      return;
    }

    if (signal === "chat.tool_call") {
      const toolLabel = signalPayloadToolLabel(payload);
      run.status = "Using tools";
      run.updatedAt = Date.now();
      latestRunId = runId;
      updatePresenceLog(run.row, "Using tools");
      note = toolLabel ? `Personal Agent is using ${toolLabel}` : "Personal Agent is using tools";
      showPresenceActivity("Using tools", toolLabel ? `Using ${toolLabel}` : run.answer || run.prompt);
      setState(state);
      return;
    }

    if (signal === "chat.tool_result") {
      run.status = "Working";
      run.updatedAt = Date.now();
      latestRunId = runId;
      updatePresenceLog(run.row, "Working");
      note = "Personal Agent is working";
      showPresenceActivity("Working", run.answer || run.prompt);
      setState(state);
      return;
    }

    if (signal === "chat.hil") {
      run.status = "Needs approval";
      run.updatedAt = Date.now();
      latestRunId = runId;
      updatePresenceLog(run.row, "Needs approval");
      note = "Personal Agent needs approval";
      showPresenceActivity("Needs approval", run.answer || run.prompt, "needs-approval");
      setState(state);
      return;
    }

    if (signal === "chat.complete") {
      const error = signalPayloadError(payload);
      const aborted = signalPayloadAborted(payload);
      run.answer = signalPayloadText(payload) ?? run.answer;
      const finalStatus = error ? "Failed" : aborted ? "Stopped" : "Done";
      updatePresenceLog(run.row, finalStatus, error ?? undefined);
      activeRuns.delete(runId);
      note = error
        ? `Personal Agent failed: ${error}`
        : aborted ? "Personal Agent stopped" : activeRuns.size > 0 ? ambientIdleNote() : "Personal Agent finished";
      showPresenceActivity(
        finalStatus,
        error ?? (run.answer || run.prompt),
        finalStatus === "Failed" ? "failed" : finalStatus === "Stopped" ? "stopped" : "done",
      );
      scheduleActivityAfterCompletion(runId);
      setState(error ? "error" : state);
    }
  }

  async function sendManualTextToPersonalAgent(): Promise<void> {
    const message = transcriptInputNode.value.trim();
    if (!message || !gatewayClient.isConnected()) {
      return;
    }
    if (state === "recording") {
      stopPushRecording();
      return;
    }
    setState("sending", "Sending to Personal Agent");
    const logRow = addPresenceLog(logNode, "Sending", message, Date.now());
    try {
      const sent = await sendTextToPersonalAgent(message);
      lastSentText = message;
      transcriptInputNode.value = "";
      updatePresenceLog(logRow, sent.queued ? "Queued" : "Working");
      trackRun(sent.runId, logRow, message);
      note = sent.queued ? "Queued for Personal Agent" : "Personal Agent is working";
      setState(ambientStream ? "listening" : "idle", note);
    } catch (error) {
      const errorMessage = formatError(error);
      updatePresenceLog(logRow, "Failed", errorMessage);
      setState("error", errorMessage);
    }
  }

  const listeners: Array<() => void> = [];
  for (const toggle of toggles) {
    const onClick = () => {
      setPanelOpen(!panelOpen);
      if (!panelOpen) {
        return;
      }
      setState(state);
    };
    toggle.addEventListener("click", onClick);
    listeners.push(() => toggle.removeEventListener("click", onClick));
  }

  for (const button of modeButtons) {
    const onClick = () => {
      const nextMode = normalizePresenceMode(button.dataset.presenceMode);
      if (nextMode) {
        setMode(nextMode);
      }
    };
    button.addEventListener("click", onClick);
    listeners.push(() => button.removeEventListener("click", onClick));
  }

  const onClose = () => {
    if (state === "recording") {
      stopPushRecording();
    }
    setPanelOpen(false);
  };
  const onListen = () => {
    if (mode === "ambient") {
      if (ambientStream) {
        stopAmbient();
        return;
      }
      void startAmbient();
      return;
    }
    if (state === "recording") {
      stopPushRecording();
      return;
    }
    void startPushRecording();
  };
  const onSend = () => void sendManualTextToPersonalAgent();
  const onClear = () => {
    transcriptInputNode.value = "";
    note = ambientStream
      ? ambientIdleNote()
      : activeRuns.size > 0 ? "Personal Agent is working" : mode === "ambient" ? "Auto-send is on" : "";
    lastSentText = "";
    setState(ambientStream ? "listening" : canUseBrowserVoiceRecorder() ? "idle" : "unsupported");
  };
  const onActivityClick = () => {
    setPanelOpen(true);
    setState(state);
  };
  const onTranscriptInput = () => setState(state);

  closeButton?.addEventListener("click", onClose);
  listenNode.addEventListener("click", onListen);
  sendNode.addEventListener("click", onSend);
  clearNode.addEventListener("click", onClear);
  activityNode?.addEventListener("click", onActivityClick);
  transcriptInputNode.addEventListener("input", onTranscriptInput);
  listeners.push(
    () => closeButton?.removeEventListener("click", onClose),
    () => listenNode.removeEventListener("click", onListen),
    () => sendNode.removeEventListener("click", onSend),
    () => clearNode.removeEventListener("click", onClear),
    () => activityNode?.removeEventListener("click", onActivityClick),
    () => transcriptInputNode.removeEventListener("input", onTranscriptInput),
    gatewayClient.onSignal(handleRunSignal),
    gatewayClient.onStatus((status) => {
      if (status.state !== "connected") {
        cleanupPushRecorder();
        stopAmbient();
        setState(state === "unsupported" ? "unsupported" : "idle");
        return;
      }
      setState(canUseBrowserVoiceRecorder() ? state === "unsupported" ? "idle" : state : "unsupported");
    }),
  );

  note = mode === "ambient" ? "Auto-send is on" : "";
  setState(state);

  return {
    destroy() {
      destroyed = true;
      clearActivityHideTimer();
      cleanupPushRecorder();
      stopAmbient();
      for (const remove of listeners) {
        remove();
      }
    },
  };
}

function canUseBrowserVoiceRecorder(): boolean {
  return typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";
}

function canUseAmbientMode(): boolean {
  return canUseBrowserVoiceRecorder() && Boolean(resolveAudioContext());
}

async function requestVoiceStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
}

function resolveAudioContext(): typeof AudioContext | null {
  const audioWindow = window as AudioWindow;
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function createAudioContext(): AudioContext {
  const AudioContextConstructor = resolveAudioContext();
  if (!AudioContextConstructor) {
    throw new Error("Audio analysis is unavailable in this browser");
  }
  return new AudioContextConstructor();
}

function selectVoiceRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  return PRESENCE_RECORDER_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

function extensionForVoiceMimeType(mimeType: string): string {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/mp4" || normalized === "audio/aac") return "m4a";
  if (normalized === "audio/wav" || normalized === "audio/wave" || normalized === "audio/x-wav") return "wav";
  if (normalized === "audio/mpeg") return "mp3";
  return "webm";
}

function presenceRecordingFilename(mimeType: string, timestamp = Date.now()): string {
  const stamp = new Date(timestamp).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `presence-${stamp}.${extensionForVoiceMimeType(mimeType)}`;
}

function appendTranscript(current: string, addition: string): string {
  return `${current.trim()} ${addition.trim()}`.trim();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read audio"));
    };
    reader.readAsDataURL(blob);
  });
}

function currentRms(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index];
  }
  return Math.sqrt(sum / samples.length);
}

function totalBlobSize(blobs: Blob[]): number {
  return blobs.reduce((sum, blob) => sum + blob.size, 0);
}

function normalizePresenceMode(value: unknown): PresenceMode | null {
  return value === "ambient" || value === "push" ? value : null;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function transcriptionNote(result: AiTranscriptionCreateResult): string {
  const parts: string[] = [];
  if (typeof result.language === "string" && result.language.trim()) {
    parts.push(result.language.trim());
  }
  if (typeof result.duration === "number" && Number.isFinite(result.duration) && result.duration > 0) {
    parts.push(`${Math.round(result.duration)}s`);
  }
  return parts.length > 0 ? `Transcribed ${parts.join(" / ")}` : "";
}

function addPresenceLog(
  log: HTMLElement | null,
  status: PresenceLogStatus,
  text: string,
  timestamp: number,
): HTMLElement | null {
  if (!log) {
    return null;
  }
  log.hidden = false;
  const row = document.createElement("div");
  row.className = "presence-log-row";
  row.dataset.timestamp = String(timestamp);
  const meta = document.createElement("span");
  meta.className = "presence-log-meta";
  const body = document.createElement("p");
  body.textContent = text;
  row.append(meta, body);
  updatePresenceLog(row, status);
  log.prepend(row);
  while (log.children.length > 6) {
    log.lastElementChild?.remove();
  }
  return row;
}

function updatePresenceLog(row: HTMLElement | null, status: PresenceLogStatus, text?: string): void {
  if (!row) {
    return;
  }
  const timestamp = Number(row.dataset.timestamp) || Date.now();
  row.dataset.status = statusKey(status);
  const meta = row.querySelector<HTMLElement>(".presence-log-meta");
  if (meta) {
    meta.textContent = `${formatClock(timestamp)} ${status}`;
  }
  if (typeof text === "string") {
    const body = row.querySelector<HTMLParagraphElement>("p");
    if (body) {
      body.textContent = text;
    }
  }
}

function runIdFromSignalPayload(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  return typeof payload.runId === "string" && payload.runId.length > 0 ? payload.runId : null;
}

function signalPayloadError(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.error !== "string") {
    return null;
  }
  const error = payload.error.trim();
  return error.length > 0 ? error : null;
}

function signalPayloadAborted(payload: unknown): boolean {
  return isRecord(payload) && payload.aborted === true;
}

function signalPayloadText(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.text !== "string") {
    return null;
  }
  const text = payload.text.trim();
  return text.length > 0 ? text : null;
}

function signalPayloadToolLabel(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const syscall = typeof payload.syscall === "string" ? payload.syscall.trim() : "";
  const label = name || syscall;
  return label.length > 0 ? label : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function statusKey(status: PresenceLogStatus): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateActivityText(text: string): string {
  return text.length > 420 ? `${text.slice(0, 419).trimEnd()}...` : text;
}

function statusText(state: PresenceState, connected: boolean, activeRuns = 0): string {
  if (!connected) {
    return "Disconnected";
  }
  if (activeRuns > 0 && (state === "idle" || state === "listening")) {
    return activeRuns === 1 ? "Agent working" : `${activeRuns} agent jobs`;
  }
  switch (state) {
    case "listening": return "Ambient on";
    case "capturing": return "Capturing speech";
    case "recording": return "Recording";
    case "transcribing": return "Transcribing";
    case "sending": return "Sending";
    case "unsupported": return "Voice unavailable; type instead";
    case "error": return "Needs attention";
    default: return "Paused";
  }
}
