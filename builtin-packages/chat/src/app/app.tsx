import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { onAppEvent } from "@gsv/package/browser";
import { openApp } from "@gsv/package/host";
import type {
  ArchiveState,
  Attachment,
  ChatBackend,
  ContextState,
  ConversationRecord,
  ConversationSegment,
  HilRequest,
  LogRow,
  MessageRow,
  Profile,
  ThreadContext,
  ToolRow,
  WorkspaceEntry,
} from "./types";

const ACTIVE_THREAD_CONTEXT_KEY = "gsv.activeThreadContext.v1";
const TARGET_CHAT_PROCESS_EVENT = "gsv:target-chat-process";
const PENDING_TARGETS_KEY = "__gsvPendingChatProcessTargets";
const WINDOW_ID = new URL(window.location.href).searchParams.get("windowId")?.trim() || "";

const EMPTY_ARCHIVE: ArchiveState = {
  loading: false,
  error: "",
  segments: [],
  selectedSegmentId: null,
  messages: [],
  messageCount: 0,
  truncated: false,
};

type SideView = "conversations" | "archive";
type PendingAssistantState = "thinking" | "tool" | null;
type CompactDialogState = { keepLast: string; suggested: number } | null;

export function App({ backend }: { backend: ChatBackend }) {
  const [active, setActiveState] = useState<ThreadContext | null>(() => getStoredThreadContext());
  const [profiles, setProfiles] = useState<Profile[]>(() => fallbackProfiles());
  const [draftProfileId, setDraftProfileId] = useState("task");
  const [threads, setThreads] = useState<WorkspaceEntry[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState("");
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationError, setConversationError] = useState("");
  const [sideView, setSideView] = useState<SideView>("conversations");
  const [rows, setRows] = useState<LogRow[]>(() => systemRows("Connecting chat backend."));
  const [messageCount, setMessageCount] = useState(0);
  const [contextState, setContextState] = useState<ContextState | null>(null);
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistantState>(null);
  const [pendingHil, setPendingHil] = useState<HilRequest | null>(null);
  const [messageBusy, setMessageBusy] = useState(false);
  const [abortBusy, setAbortBusy] = useState(false);
  const [hilBusy, setHilBusy] = useState(false);
  const [compactBusy, setCompactBusy] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [hostError, setHostError] = useState("");
  const [composeText, setComposeText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [archive, setArchive] = useState<ArchiveState>(EMPTY_ARCHIVE);
  const [compactDialog, setCompactDialog] = useState<CompactDialogState>(null);
  const [notice, setNotice] = useState("");
  const [suppressNextAbortedComplete, setSuppressNextAbortedComplete] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const conversationProfiles = useMemo(
    () => profiles.filter((profile) => profile.interactive === true && profile.startable === true),
    [profiles],
  );
  const newConversationProfiles = useMemo(
    () => conversationProfiles.filter((profile) => profile.spawnMode === "new"),
    [conversationProfiles],
  );
  const draftProfile = useMemo(() => {
    return conversationProfiles.find((profile) => profile.id === draftProfileId || profile.alias === draftProfileId)
      ?? newConversationProfiles[0]
      ?? conversationProfiles.find((profile) => profile.id === "task")
      ?? fallbackProfiles()[1];
  }, [conversationProfiles, draftProfileId, newConversationProfiles]);

  const activeConversationId = active?.conversationId || "default";
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const activeTitle = active ? titleForActive(active, activeConversation, threads) : draftConversationTitle(draftProfile);
  const statusText = getStatusText({
    active,
    draftProfile,
    hostError,
    pendingAssistant,
    pendingHil,
    messageBusy,
    abortBusy,
    hilBusy,
  });
  const interactive = !hostError;
  const canSend = interactive && !messageBusy && (composeText.trim().length > 0 || attachments.length > 0);
  const canActOnConversation = interactive && Boolean(active?.pid) && !messageBusy && pendingAssistant === null;

  const setActive = useCallback((next: ThreadContext | null) => {
    const normalized = setStoredThreadContext(next);
    activeRef.current = normalized;
    setActiveState(normalized);
    setContextState(null);
    setPendingHil(null);
    setPendingAssistant(null);
    setMessageCount(0);
    setArchive(EMPTY_ARCHIVE);
    setNotice("");
  }, []);

  const appendSystem = useCallback((text: string) => {
    setRows((current) => dropEmptyPlaceholder(current).concat(systemRow(text)));
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const result = await backend.listProfiles({});
      const profileRows = Array.isArray(asRecord(result)?.profiles) ? asRecord(result)?.profiles as unknown[] : [];
      const normalized = profileRows.map(normalizeProfile).filter(Boolean) as Profile[];
      setProfiles(normalized.length > 0 ? normalized : fallbackProfiles());
    } catch {
      setProfiles(fallbackProfiles());
    }
  }, [backend]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError("");
    try {
      const result = await backend.listWorkspaces({ kind: "thread", limit: 64 });
      const workspaceRows = Array.isArray(asRecord(result)?.workspaces) ? asRecord(result)?.workspaces as unknown[] : [];
      setThreads(workspaceRows.map(normalizeWorkspace).filter(Boolean) as WorkspaceEntry[]);
    } catch (error) {
      setThreads([]);
      setThreadsError(formatError(error));
    } finally {
      setThreadsLoading(false);
    }
  }, [backend]);

  const loadConversations = useCallback(async (pid = activeRef.current?.pid || "") => {
    if (!pid) {
      setConversations([]);
      return;
    }
    setConversationsLoading(true);
    setConversationError("");
    try {
      const result = await backend.listConversations({ pid });
      const conversationRows = Array.isArray(asRecord(result)?.conversations)
        ? asRecord(result)?.conversations as unknown[]
        : [];
      setConversations(sortConversations(conversationRows.map(normalizeConversation).filter(Boolean) as ConversationRecord[]));
    } catch (error) {
      setConversations([]);
      setConversationError(formatError(error));
    } finally {
      setConversationsLoading(false);
    }
  }, [backend]);

  const loadHistory = useCallback(async (target = activeRef.current) => {
    if (!target?.pid) {
      setContextState(null);
      setMessageCount(0);
      setRows(systemRows("No thread selected. Send a message to start a new thread."));
      return;
    }

    try {
      const merged: unknown[] = [];
      let offset = 0;
      let total = 0;
      let truncated = false;
      let nextHil: HilRequest | null = null;
      let nextContext: ContextState | null = null;
      for (let page = 0; page < 20; page += 1) {
        const result = await backend.getHistory({
          pid: target.pid,
          conversationId: target.conversationId || "default",
          limit: 200,
          offset,
        });
        const record = asRecord(result);
        if (!record?.ok) {
          setRows(systemRows("history error: " + safeText(record?.error || "unknown error")));
          return;
        }
        const messages = Array.isArray(record.messages) ? record.messages : [];
        if (page === 0) {
          nextHil = normalizeHilRequest(record.pendingHil);
          nextContext = normalizeContextState(record.context);
        }
        merged.push(...messages);
        total = asNumber(record.messageCount) ?? messages.length;
        offset += messages.length;
        truncated = record.truncated === true;
        if (!truncated || messages.length === 0 || offset >= total) {
          break;
        }
      }
      const flattened = flattenHistory(merged);
      if (truncated && offset < total) {
        flattened.push(systemRow(`history truncated at ${offset}/${total} messages`));
      }
      setMessageCount(total);
      setContextState(nextContext);
      setPendingHil(nextHil);
      setPendingAssistant(null);
      setRows(flattened);
      requestAnimationFrame(() => scrollTranscript("bottom"));
    } catch (error) {
      setRows(systemRows("history error: " + formatError(error)));
    }
  }, [backend]);

  const loadArchiveSegments = useCallback(async (preserveSelection = true) => {
    const target = activeRef.current;
    if (!target?.pid) {
      setArchive(EMPTY_ARCHIVE);
      return;
    }
    setArchive((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await backend.listConversationSegments({
        pid: target.pid,
        conversationId: target.conversationId || "default",
      });
      const record = asRecord(result);
      if (!record?.ok) {
        setArchive((current) => ({ ...current, loading: false, error: safeText(record?.error || "archive load failed"), segments: [] }));
        return;
      }
      const segments = (Array.isArray(record.segments) ? record.segments : [])
        .map(normalizeConversationSegment)
        .filter(Boolean)
        .reverse() as ConversationSegment[];
      let selected = preserveSelection ? archive.selectedSegmentId : null;
      if (!selected || !segments.some((segment) => segment.id === selected)) {
        selected = segments[0]?.id ?? null;
      }
      setArchive((current) => ({
        ...current,
        loading: false,
        error: "",
        segments,
        selectedSegmentId: selected,
        messages: selected ? current.messages : [],
        messageCount: selected ? current.messageCount : 0,
        truncated: selected ? current.truncated : false,
      }));
      if (selected) {
        await readArchiveSegment(selected);
      }
    } catch (error) {
      setArchive((current) => ({ ...current, loading: false, error: formatError(error), segments: [] }));
    }
  }, [archive.selectedSegmentId, backend]);

  const readArchiveSegment = useCallback(async (segmentId: string) => {
    const target = activeRef.current;
    if (!target?.pid || !segmentId) {
      return;
    }
    setArchive((current) => ({
      ...current,
      loading: true,
      error: "",
      selectedSegmentId: segmentId,
      messages: [],
      messageCount: 0,
      truncated: false,
    }));
    try {
      const result = await backend.readConversationSegment({
        pid: target.pid,
        conversationId: target.conversationId || "default",
        segmentId,
        limit: 100,
      });
      const record = asRecord(result);
      if (!record?.ok) {
        setArchive((current) => ({ ...current, loading: false, error: safeText(record?.error || "segment read failed") }));
        return;
      }
      const messages = Array.isArray(record.messages) ? record.messages : [];
      setArchive((current) => ({
        ...current,
        loading: false,
        error: "",
        selectedSegmentId: segmentId,
        messages,
        messageCount: asNumber(record.messageCount) ?? messages.length,
        truncated: record.truncated === true,
      }));
    } catch (error) {
      setArchive((current) => ({ ...current, loading: false, error: formatError(error) }));
    }
  }, [backend]);

  useEffect(() => {
    void loadProfiles();
    void loadThreads();
  }, [loadProfiles, loadThreads]);

  useEffect(() => {
    if (newConversationProfiles.length > 0 && !newConversationProfiles.some((profile) => profile.id === draftProfileId)) {
      setDraftProfileId(newConversationProfiles[0].id);
    }
  }, [draftProfileId, newConversationProfiles]);

  useEffect(() => {
    if (active?.pid) {
      void backend.watchProcessSignals({ pid: active.pid }).catch((error) => setHostError(formatError(error)));
      void loadConversations(active.pid);
      void loadHistory(active);
      return () => {
        void backend.unwatchProcessSignals({ pid: active.pid }).catch(() => {});
      };
    }
    void backend.unwatchProcessSignals({ pid: "" }).catch(() => {});
    setConversations([]);
    setRows(systemRows(draftConversationMeta(draftProfile)));
    return undefined;
  }, [active?.pid, active?.conversationId, backend, draftProfile, loadConversations, loadHistory]);

  useEffect(() => {
    function handleTargetEvent(event: Event) {
      const detail = asRecord((event as CustomEvent).detail);
      if (!detail) {
        return;
      }
      const targetWindowId = asString(detail.windowId)?.trim() || "";
      if (WINDOW_ID && targetWindowId && targetWindowId !== WINDOW_ID) {
        return;
      }
      const next = normalizeThreadContext(detail);
      if (next) {
        setActive(next);
      }
    }

    try {
      const store = window.parent?.[PENDING_TARGETS_KEY as keyof Window];
      if (WINDOW_ID && store instanceof Map && store.has(WINDOW_ID)) {
        const pending = normalizeThreadContext(store.get(WINDOW_ID));
        store.delete(WINDOW_ID);
        if (pending) {
          setActive(pending);
        }
      }
      window.parent?.addEventListener(TARGET_CHAT_PROCESS_EVENT, handleTargetEvent);
    } catch {
      // Ignore parent access issues outside the desktop shell.
    }
    return () => {
      try {
        window.parent?.removeEventListener(TARGET_CHAT_PROCESS_EVENT, handleTargetEvent);
      } catch {}
    };
  }, [setActive]);

  useEffect(() => {
    return onAppEvent((signal, payload) => {
      const target = activeRef.current;
      if (!target) {
        return;
      }
      if (signal === "process.message") {
        applyProcessMessageSignal(payload, target, setRows, setPendingAssistant);
      } else if (signal === "process.context") {
        const next = normalizeContextSignal(payload, target);
        if (next) {
          setContextState(next);
        }
      } else if (signal === "process.lifecycle") {
        const record = asRecord(payload);
        const pid = asString(record?.pid);
        if (pid && pid !== target.pid) {
          return;
        }
        const event = asString(record?.event);
        if (event === "conversation.compacted" || event === "conversation.forked" || event === "conversation.auto_compacted") {
          void loadConversations(target.pid);
          void loadHistory(target);
          if (sideView === "archive") {
            void loadArchiveSegments(true);
          }
        }
      } else if (signal === "chat.tool_call") {
        setPendingHil(null);
        setPendingAssistant("tool");
        applyToolCallSignal(payload, target, setRows);
      } else if (signal === "chat.tool_result") {
        applyToolResultSignal(payload, target, setRows);
        setPendingAssistant("thinking");
      } else if (signal === "chat.text") {
        applyAssistantSignal(payload, target, setRows);
        setPendingAssistant(null);
      } else if (signal === "chat.complete") {
        const record = asRecord(payload);
        setPendingHil(null);
        setPendingAssistant((current) => {
          if (record?.aborted === true && suppressNextAbortedComplete) {
            return current;
          }
          return null;
        });
        setSuppressNextAbortedComplete(false);
        const errorText = asString(record?.error);
        if (errorText) {
          appendSystem(errorText);
        }
        void loadThreads();
        void loadHistory(target);
      } else if (signal === "chat.hil") {
        setPendingAssistant(null);
        setPendingHil(normalizeHilRequest(payload));
      } else if (signal === "chat.error" || signal === "process.exit") {
        setPendingAssistant(null);
        setPendingHil(null);
        setSuppressNextAbortedComplete(false);
        void loadThreads();
      }
    });
  }, [appendSystem, loadArchiveSegments, loadConversations, loadHistory, loadThreads, sideView, suppressNextAbortedComplete]);

  useEffect(() => {
    scrollTranscript("near-bottom");
  }, [rows.length, pendingAssistant, pendingHil]);

  async function openHome(): Promise<void> {
    setNotice("");
    try {
      const result = await backend.spawnProcess({
        profile: "init",
        label: "Home",
        workspace: { mode: "none" },
      });
      const record = asRecord(result);
      if (!record?.ok) {
        appendSystem("home open failed: " + safeText(record?.error || "unknown error"));
        return;
      }
      setActive(normalizeThreadContext({
        pid: record.pid,
        workspaceId: record.workspaceId,
        cwd: record.cwd,
        conversationId: "default",
      }));
    } catch (error) {
      appendSystem("home open failed: " + formatError(error));
    }
  }

  async function openThread(workspaceId: string): Promise<void> {
    const entry = threads.find((candidate) => candidate.workspaceId === workspaceId);
    if (!entry) {
      appendSystem("thread not found: " + workspaceId);
      return;
    }
    if (entry.activeProcess) {
      setActive(normalizeThreadContext({
        pid: entry.activeProcess.pid,
        workspaceId: entry.workspaceId,
        cwd: entry.activeProcess.cwd,
        conversationId: "default",
      }));
      return;
    }
    try {
      const result = await backend.spawnProcess({
        profile: "task",
        label: entry.label || undefined,
        workspace: { mode: "attach", workspaceId: entry.workspaceId },
      });
      const record = asRecord(result);
      if (!record?.ok) {
        appendSystem("thread reopen failed: " + safeText(record?.error || "unknown error"));
        return;
      }
      setActive(normalizeThreadContext({
        pid: record.pid,
        workspaceId: record.workspaceId,
        cwd: record.cwd,
        conversationId: "default",
      }));
      void loadThreads();
    } catch (error) {
      appendSystem("thread reopen failed: " + formatError(error));
    }
  }

  function resetToNewThread(): void {
    setActive(null);
    setComposeText("");
    setAttachments([]);
    setSideView("conversations");
  }

  async function switchConversation(conversation: ConversationRecord): Promise<void> {
    if (!active) {
      return;
    }
    setActive({
      ...active,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
    });
  }

  async function sendMessage(): Promise<void> {
    const message = composeText.trim();
    const media = attachments.slice();
    if (!message && media.length === 0) {
      return;
    }
    setMessageBusy(true);
    setNotice("");
    try {
      let target = activeRef.current;
      if (!target?.pid) {
        const spawnResult = await backend.spawnProcess({
          profile: draftProfile.id || "task",
          label: deriveThreadLabel(message) || draftProfile.displayName,
          workspace: draftProfile.spawnMode === "new"
            ? { mode: "new", kind: "thread" }
            : { mode: "none" },
        });
        const record = asRecord(spawnResult);
        if (!record?.ok) {
          appendSystem("thread start failed: " + safeText(record?.error || "unknown error"));
          return;
        }
        target = normalizeThreadContext({
          pid: record.pid,
          workspaceId: record.workspaceId,
          cwd: record.cwd,
          conversationId: "default",
        });
        setActive(target);
        await backend.watchProcessSignals({ pid: target.pid }).catch((error) => setHostError(formatError(error)));
        void loadThreads();
      }
      if (!target?.pid) {
        appendSystem("thread start failed: missing process id");
        return;
      }
      setRows((current) => dropEmptyPlaceholder(current).concat({
        kind: "message",
        role: "user",
        text: message,
        media,
        timestamp: Date.now(),
      }));
      setComposeText("");
      setAttachments([]);
      const result = await backend.sendMessage({
        message,
        pid: target.pid,
        conversationId: target.conversationId || "default",
        ...(media.length > 0 ? { media } : {}),
      });
      const record = asRecord(result);
      if (!record?.ok) {
        appendSystem("send failed: " + safeText(record?.error || "unknown error"));
        return;
      }
      setPendingAssistant("thinking");
      if (record.queued === true) {
        appendSystem("message queued while process is busy");
      }
    } catch (error) {
      appendSystem("send failed: " + formatError(error));
    } finally {
      setMessageBusy(false);
    }
  }

  async function abortActiveRun(): Promise<void> {
    const target = activeRef.current;
    if (!target?.pid || abortBusy) {
      return;
    }
    setAbortBusy(true);
    try {
      const result = await backend.abortRun({ pid: target.pid });
      const record = asRecord(result);
      if (!record?.ok) {
        appendSystem("stop failed");
        return;
      }
      if (record.aborted === true) {
        setPendingHil(null);
        if (record.continuedQueuedRunId) {
          setSuppressNextAbortedComplete(true);
          setPendingAssistant("thinking");
        } else {
          setPendingAssistant(null);
          appendSystem("run interrupted");
        }
      }
    } catch (error) {
      appendSystem("stop failed: " + formatError(error));
    } finally {
      setAbortBusy(false);
    }
  }

  async function decidePendingHil(requestId: string, decision: "approve" | "deny"): Promise<void> {
    const target = activeRef.current;
    if (!target?.pid || !pendingHil || pendingHil.requestId !== requestId || hilBusy) {
      return;
    }
    setHilBusy(true);
    try {
      const result = await backend.decideHil({ pid: target.pid, requestId, decision });
      const record = asRecord(result);
      if (!record?.ok) {
        appendSystem("tool confirmation failed");
        return;
      }
      const nextHil = normalizeHilRequest(record.pendingHil);
      setPendingHil(nextHil);
      if (!nextHil) {
        setPendingAssistant("thinking");
      }
    } catch (error) {
      appendSystem("tool confirmation failed: " + formatError(error));
    } finally {
      setHilBusy(false);
    }
  }

  function openCompanion(target: "files" | "shell"): void {
    if (!active) {
      return;
    }
    if (target === "files") {
      openApp({ target: "files", payload: { path: active.cwd, context: active } });
      return;
    }
    openApp({ target: "shell", payload: { cwd: active.cwd, context: active } });
  }

  function openCompactDialog(): void {
    const suggested = suggestKeepLast(messageCount, contextState);
    setCompactDialog({ keepLast: String(suggested), suggested });
  }

  async function compactActiveConversation(): Promise<void> {
    const target = activeRef.current;
    if (!target?.pid || !compactDialog) {
      return;
    }
    const keepLast = Number.parseInt(compactDialog.keepLast.trim(), 10);
    if (!Number.isInteger(keepLast) || keepLast < 0) {
      setNotice("Keep-last must be a non-negative integer.");
      return;
    }
    setCompactBusy(true);
    setNotice("");
    try {
      const result = await backend.compactConversation({
        pid: target.pid,
        conversationId: target.conversationId || "default",
        keepLast,
      });
      const record = asRecord(result);
      if (!record?.ok) {
        appendSystem("compact failed: " + safeText(record?.error || "unknown error"));
        return;
      }
      setCompactDialog(null);
      appendSystem("conversation compacted: " + safeText(record.archivedMessages) + " messages archived");
      await loadHistory(target);
      await loadConversations(target.pid);
      if (sideView === "archive") {
        await loadArchiveSegments(true);
      }
    } catch (error) {
      appendSystem("compact failed: " + formatError(error));
    } finally {
      setCompactBusy(false);
    }
  }

  async function branchFromMessage(messageId: number): Promise<void> {
    const target = activeRef.current;
    if (!target?.pid || !messageId) {
      return;
    }
    setBranchBusy(true);
    setNotice("");
    try {
      const title = "Branch from message " + messageId;
      const result = await backend.forkConversation({
        pid: target.pid,
        conversationId: target.conversationId || "default",
        throughMessageId: messageId,
        targetConversationId: "branch-" + Date.now().toString(36),
        title,
      });
      const record = asRecord(result);
      if (!record?.ok) {
        appendSystem("branch failed: " + safeText(record?.error || "unknown error"));
        return;
      }
      const targetConversation = asRecord(record.targetConversation);
      const nextConversationId = asString(targetConversation?.id) || "default";
      const nextTitle = asString(targetConversation?.title) || title;
      setActive({
        ...target,
        conversationId: nextConversationId,
        conversationTitle: nextTitle,
      });
      setSideView("conversations");
      setNotice("Created " + nextTitle + ".");
      await loadConversations(target.pid);
    } catch (error) {
      appendSystem("branch failed: " + formatError(error));
    } finally {
      setBranchBusy(false);
    }
  }

  async function readAttachments(files: FileList | null): Promise<void> {
    const selected = Array.from(files || []);
    if (selected.length === 0) {
      return;
    }
    try {
      const next = await Promise.all(selected.map(readAttachmentFile));
      setAttachments((current) => current.concat(next));
    } catch (error) {
      appendSystem("attachment read failed: " + formatError(error));
    }
  }

  function scrollTranscript(mode: "bottom" | "near-bottom"): void {
    const node = transcriptRef.current;
    if (!node) {
      return;
    }
    if (mode === "near-bottom" && !isNearBottom(node)) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }

  return (
    <main class="chat-app">
      <ThreadRail
        active={active}
        threads={threads}
        loading={threadsLoading}
        error={threadsError}
        profiles={newConversationProfiles}
        draftProfileId={draftProfile.id}
        onDraftProfileChange={setDraftProfileId}
        onHome={() => void openHome()}
        onNew={resetToNewThread}
        onRefresh={() => void loadThreads()}
        onOpenThread={(workspaceId) => void openThread(workspaceId)}
      />

      <ProcessPanel
        active={active}
        activeConversationId={activeConversationId}
        conversations={conversations}
        loading={conversationsLoading}
        error={conversationError}
        sideView={sideView}
        archive={archive}
        onSideViewChange={(view) => {
          setSideView(view);
          if (view === "archive") {
            void loadArchiveSegments(true);
          }
        }}
        onConversationSelect={(conversation) => void switchConversation(conversation)}
        onRefreshConversations={() => active?.pid ? void loadConversations(active.pid) : undefined}
        onArchiveRefresh={() => void loadArchiveSegments(true)}
        onArchiveSegmentSelect={(segmentId) => void readArchiveSegment(segmentId)}
      />

      <section class="chat-stage">
        <header class="chat-stage-head">
          <div class="chat-stage-title">
            <h1>{activeTitle}</h1>
            <p>{active ? activeMeta(active, activeConversation) : draftConversationMeta(draftProfile)}</p>
            <ContextMeter state={active ? contextState : null} />
          </div>
          <div class="chat-stage-actions">
            <button class="icon-button" type="button" title="Open Files" aria-label="Open Files" disabled={!active} onClick={() => openCompanion("files")}>
              <FolderIcon />
            </button>
            <button class="icon-button" type="button" title="Open Shell" aria-label="Open Shell" disabled={!active} onClick={() => openCompanion("shell")}>
              <TerminalIcon />
            </button>
            <button class="icon-button" type="button" title="Compact conversation" aria-label="Compact conversation" disabled={!canActOnConversation || compactBusy} onClick={openCompactDialog}>
              <CompactIcon />
            </button>
            <button class="icon-button" type="button" title="Stop active run" aria-label="Stop active run" disabled={!active?.pid || abortBusy || (!messageBusy && pendingAssistant === null && pendingHil === null)} onClick={() => void abortActiveRun()}>
              <StopIcon />
            </button>
            <span class="connection-dot is-connected" title="connected" aria-label="connected" />
          </div>
        </header>

        <div class="chat-notice-row">
          <span>{statusText}</span>
          {notice ? <span class="chat-notice">{notice}</span> : null}
        </div>

        <Transcript
          rows={rows}
          pendingAssistant={pendingAssistant}
          pendingHil={pendingHil}
          hilBusy={hilBusy}
          branchBusy={branchBusy}
          refNode={transcriptRef}
          onBranch={(messageId) => void branchFromMessage(messageId)}
          onHilDecision={(requestId, decision) => void decidePendingHil(requestId, decision)}
        />

        <Composer
          value={composeText}
          attachments={attachments}
          disabled={!interactive || messageBusy}
          canSend={canSend}
          onValueChange={setComposeText}
          onSubmit={() => void sendMessage()}
          onFiles={(files) => void readAttachments(files)}
          onRemoveAttachment={(index) => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
        />
      </section>

      {compactDialog ? (
        <CompactDialog
          value={compactDialog.keepLast}
          messageCount={messageCount}
          compactBusy={compactBusy}
          onChange={(keepLast) => setCompactDialog({ ...compactDialog, keepLast })}
          onCancel={() => setCompactDialog(null)}
          onConfirm={() => void compactActiveConversation()}
        />
      ) : null}
    </main>
  );
}

function ThreadRail(props: {
  active: ThreadContext | null;
  threads: WorkspaceEntry[];
  loading: boolean;
  error: string;
  profiles: Profile[];
  draftProfileId: string;
  onDraftProfileChange(profileId: string): void;
  onHome(): void;
  onNew(): void;
  onRefresh(): void;
  onOpenThread(workspaceId: string): void;
}) {
  const activeWorkspaceId = props.active?.workspaceId ?? null;
  const activePid = props.active?.pid ?? "";
  const status = props.loading
    ? "Refreshing threads..."
    : props.error || (props.threads.length === 0 ? "No task threads yet." : "");

  return (
    <aside class="chat-rail">
      <header class="rail-header">
        <div>
          <h1>Chat</h1>
          <p>{status || "Processes and task workspaces"}</p>
        </div>
        <div class="rail-actions">
          <button class="icon-button" type="button" title="Home" aria-label="Home" onClick={props.onHome}>
            <HomeIcon />
          </button>
          <button class="icon-button" type="button" title="New conversation" aria-label="New conversation" onClick={props.onNew}>
            <PlusIcon />
          </button>
          <button class="icon-button" type="button" title="Refresh threads" aria-label="Refresh threads" onClick={props.onRefresh}>
            <RefreshIcon />
          </button>
        </div>
      </header>

      <div class="new-thread-strip">
        <label>
          <span>New profile</span>
          <select value={props.draftProfileId} onChange={(event) => props.onDraftProfileChange((event.currentTarget as HTMLSelectElement).value)}>
            {props.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.displayName}</option>
            ))}
          </select>
        </label>
      </div>

      <nav class="thread-list" aria-label="Chat threads">
        <button type="button" class={"thread-row" + (activePid.startsWith("init:") ? " is-active" : "")} onClick={props.onHome}>
          <span class="thread-row-title">Home</span>
          <span class="thread-row-meta">Persistent init conversation</span>
        </button>
        {props.threads.map((thread) => (
          <button
            key={thread.workspaceId}
            type="button"
            class={"thread-row" + (activeWorkspaceId === thread.workspaceId ? " is-active" : "")}
            onClick={() => props.onOpenThread(thread.workspaceId)}
          >
            <span class="thread-row-title">{displayThreadLabel(thread)}</span>
            <span class="thread-row-meta">
              {thread.activeProcess ? "Live" : "Stored"}
              {thread.processCount && thread.processCount > 1 ? ` - ${thread.processCount} agents` : ""}
              {" - "}
              {formatRelativeTime(thread.updatedAt)}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function ProcessPanel(props: {
  active: ThreadContext | null;
  activeConversationId: string;
  conversations: ConversationRecord[];
  loading: boolean;
  error: string;
  sideView: SideView;
  archive: ArchiveState;
  onSideViewChange(view: SideView): void;
  onConversationSelect(conversation: ConversationRecord): void;
  onRefreshConversations(): void;
  onArchiveRefresh(): void;
  onArchiveSegmentSelect(segmentId: string): void;
}) {
  return (
    <aside class="process-panel">
      <header class="process-header">
        <div>
          <h2>{props.active ? shortId(props.active.pid) : "No process"}</h2>
          <p>{props.active ? props.active.cwd : "Start or open a thread"}</p>
        </div>
      </header>
      <div class="panel-tabs">
        <button type="button" class={props.sideView === "conversations" ? "is-active" : ""} onClick={() => props.onSideViewChange("conversations")}>
          Conversations
        </button>
        <button type="button" class={props.sideView === "archive" ? "is-active" : ""} onClick={() => props.onSideViewChange("archive")} disabled={!props.active}>
          Archive
        </button>
      </div>
      {props.sideView === "conversations" ? (
        <ConversationList
          active={props.active}
          activeConversationId={props.activeConversationId}
          conversations={props.conversations}
          loading={props.loading}
          error={props.error}
          onSelect={props.onConversationSelect}
          onRefresh={props.onRefreshConversations}
        />
      ) : (
        <ArchivePanel
          archive={props.archive}
          onRefresh={props.onArchiveRefresh}
          onSelect={props.onArchiveSegmentSelect}
        />
      )}
    </aside>
  );
}

function ConversationList(props: {
  active: ThreadContext | null;
  activeConversationId: string;
  conversations: ConversationRecord[];
  loading: boolean;
  error: string;
  onSelect(conversation: ConversationRecord): void;
  onRefresh(): void;
}) {
  if (!props.active) {
    return <div class="panel-empty">Open a process to see its conversations and branches.</div>;
  }
  return (
    <section class="panel-section">
      <div class="section-toolbar">
        <span>{props.loading ? "Loading..." : props.error || `${props.conversations.length} conversations`}</span>
        <button class="icon-button small" type="button" title="Refresh conversations" aria-label="Refresh conversations" onClick={props.onRefresh}>
          <RefreshIcon />
        </button>
      </div>
      <div class="conversation-list">
        {props.conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            class={"conversation-row" + (conversation.id === props.activeConversationId ? " is-active" : "")}
            onClick={() => props.onSelect(conversation)}
          >
            <span class="conversation-title">{conversation.title || (conversation.id === "default" ? "Default" : conversation.id)}</span>
            <span class="conversation-meta">
              {conversation.id === "default" ? "main" : shortId(conversation.id)}
              {" - "}
              {conversation.messageCount} messages
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ArchivePanel(props: {
  archive: ArchiveState;
  onRefresh(): void;
  onSelect(segmentId: string): void;
}) {
  const selected = props.archive.segments.find((segment) => segment.id === props.archive.selectedSegmentId) ?? null;
  return (
    <section class="panel-section archive-shell">
      <div class="section-toolbar">
        <span>{props.archive.loading ? "Loading..." : props.archive.error || `${props.archive.segments.length} segments`}</span>
        <button class="icon-button small" type="button" title="Refresh archive" aria-label="Refresh archive" onClick={props.onRefresh}>
          <RefreshIcon />
        </button>
      </div>
      {props.archive.segments.length === 0 ? (
        <div class="panel-empty">No compacted segments.</div>
      ) : (
        <div class="archive-layout">
          <div class="archive-segments">
            {props.archive.segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                class={"archive-row" + (segment.id === props.archive.selectedSegmentId ? " is-active" : "")}
                onClick={() => props.onSelect(segment.id)}
              >
                <span>{shortId(segment.id)}</span>
                <span>{segment.fromMessageId}-{segment.toMessageId}</span>
              </button>
            ))}
          </div>
          <div class="archive-preview">
            {selected ? (
              <>
                <div class="archive-preview-head">
                  <span>{shortId(selected.id)}</span>
                  <span>{props.archive.messages.length}/{props.archive.messageCount}{props.archive.truncated ? " shown" : ""}</span>
                </div>
                {props.archive.messages.map((message, index) => (
                  <ArchiveMessage key={index} entry={message} />
                ))}
              </>
            ) : (
              <div class="panel-empty">Select a segment.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Transcript(props: {
  rows: LogRow[];
  pendingAssistant: PendingAssistantState;
  pendingHil: HilRequest | null;
  hilBusy: boolean;
  branchBusy: boolean;
  refNode: { current: HTMLDivElement | null };
  onBranch(messageId: number): void;
  onHilDecision(requestId: string, decision: "approve" | "deny"): void;
}) {
  const hilRendered = props.pendingHil
    ? props.rows.some((row) => row.kind === "toolCall" && row.callId === props.pendingHil?.callId)
    : true;
  return (
    <div class="transcript" ref={(node) => { props.refNode.current = node; }}>
      {props.rows.map((row, index) => {
        if (row.kind === "toolCall" || row.kind === "toolResult") {
          if (props.pendingHil && row.kind === "toolCall" && row.callId === props.pendingHil.callId) {
            return (
              <HilCard
                key={`${row.callId}:${index}`}
                request={{ ...props.pendingHil, toolName: row.toolName || props.pendingHil.toolName, syscall: row.syscall || props.pendingHil.syscall, args: row.args ?? props.pendingHil.args }}
                busy={props.hilBusy}
                onDecision={props.onHilDecision}
              />
            );
          }
          return <ToolCard key={`${row.callId}:${index}`} row={row} />;
        }
        const messageRow = row as MessageRow;
        return <MessageBubble key={`${messageRow.messageId ?? index}:${messageRow.timestamp}`} row={messageRow} branchBusy={props.branchBusy} onBranch={props.onBranch} />;
      })}
      {props.pendingHil && !hilRendered ? (
        <HilCard request={props.pendingHil} busy={props.hilBusy} onDecision={props.onHilDecision} />
      ) : null}
      {props.pendingAssistant ? (
        <article class="message-pending">
          <span class="spinner" aria-hidden="true" />
          <span>{props.pendingAssistant === "tool" ? "Working..." : "Thinking..."}</span>
        </article>
      ) : null}
    </div>
  );
}

function MessageBubble({ row, branchBusy, onBranch }: { row: MessageRow; branchBusy: boolean; onBranch(messageId: number): void }) {
  const thinking = row.thinking?.filter(Boolean) ?? [];
  return (
    <article class={`message message-${row.role}`}>
      <div class="message-head">
        <span>{labelForRole(row.role)}</span>
        <span class="message-spacer" />
        <span>{formatTimestamp(row.timestamp)}</span>
        {row.messageId ? (
          <button
            type="button"
            class="message-action"
            title="Branch from this message"
            aria-label="Branch from this message"
            disabled={branchBusy}
            onClick={() => onBranch(row.messageId as number)}
          >
            <BranchIcon />
          </button>
        ) : null}
      </div>
      {thinking.length > 0 ? (
        <details class="message-thinking">
          <summary>Reasoning</summary>
          <div>{thinking.join("\n\n")}</div>
        </details>
      ) : null}
      {row.role === "assistant" ? (
        <div class="message-body message-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(row.text) }} />
      ) : (
        <pre class="message-body">{row.text}</pre>
      )}
      {row.media && row.media.length > 0 ? (
        <div class="message-media">
          {row.media.map((item, index) => <span key={index}>{describeAttachment(item)}</span>)}
        </div>
      ) : null}
    </article>
  );
}

function ToolCard({ row }: { row: ToolRow }) {
  const syscall = inferToolSyscall(row.toolName, row.syscall);
  const card = describeToolCard(row.toolName, row.args, syscall);
  const ok = row.kind === "toolCall" ? false : row.ok !== false;
  const statusClass = row.kind === "toolCall" ? "is-pending" : ok ? "is-ok" : "is-error";
  return (
    <article class={`tool-card ${statusClass}`}>
      <div class="tool-card-head">
        <div>
          <h3>{card.title}</h3>
          {card.subtitle ? <p>{card.subtitle}</p> : null}
        </div>
        <span class={`tool-status ${statusClass}`}>
          {row.kind === "toolCall" ? "Running" : ok ? "Done" : "Error"}
          <span>{card.target}</span>
        </span>
      </div>
      <div class="tool-preview">
        {row.kind === "toolCall"
          ? <p>Waiting for result.</p>
          : <ToolPreview row={row} syscall={syscall} />}
      </div>
      <details class="tool-details">
        <summary>{row.kind === "toolCall" ? "Input" : "Details"}</summary>
        <ToolDetails row={row} syscall={syscall} />
      </details>
    </article>
  );
}

function ToolPreview({ row, syscall }: { row: ToolRow; syscall: string | null }) {
  const normalized = normalizeToolOutput(row.output);
  const record = asRecord(normalized);
  if (row.ok === false || record?.ok === false) {
    return <p class="tool-error">{row.error || asString(record?.error) || "Tool call failed."}</p>;
  }
  if (row.toolName === "Shell" || syscall === "shell.exec") {
    const stdout = asString(record?.stdout);
    const stderr = asString(record?.stderr);
    if (stdout?.trim()) return <pre>{truncateBlock(stdout, 800)}</pre>;
    if (stderr?.trim()) return <pre>{truncateBlock(stderr, 800)}</pre>;
    return <p>Command completed.</p>;
  }
  if (row.toolName === "Read" || syscall === "fs.read") {
    if (typeof record?.content === "string") return <pre>{truncateBlock(record.content, 800)}</pre>;
    const directories = Array.isArray(record?.directories) ? record.directories : [];
    const files = Array.isArray(record?.files) ? record.files : [];
    if (directories.length || files.length) {
      return <p>Listed {directories.length} dirs and {files.length} files.</p>;
    }
    return <p>Read completed.</p>;
  }
  if (row.toolName === "Search" || syscall === "fs.search") {
    const matches = Array.isArray(record?.matches) ? record.matches : [];
    const count = asNumber(record?.count) ?? matches.length;
    return <p>{count} matches.</p>;
  }
  if (typeof normalized === "string") {
    return <pre>{truncateBlock(normalized, 800)}</pre>;
  }
  return <pre>{truncateBlock(prettyJson(normalized), 800)}</pre>;
}

function ToolDetails({ row, syscall }: { row: ToolRow; syscall: string | null }) {
  const normalized = normalizeToolOutput(row.output);
  return (
    <div class="tool-detail-stack">
      <MetaGrid rows={[["call", row.callId], ["syscall", syscall || ""]]} />
      <pre>{truncateBlock(prettyJson(row.args), 2400)}</pre>
      {row.kind === "toolResult" && normalized !== undefined ? (
        <pre>{truncateBlock(typeof normalized === "string" ? normalized : prettyJson(normalized), 4000)}</pre>
      ) : null}
    </div>
  );
}

function MetaGrid({ rows }: { rows: Array<[string, string | number | null | undefined]> }) {
  return (
    <div class="meta-grid">
      {rows.filter((row) => row[1] !== null && row[1] !== undefined && String(row[1]).length > 0).map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <span>{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function HilCard(props: { request: HilRequest; busy: boolean; onDecision(requestId: string, decision: "approve" | "deny"): void }) {
  const card = describeToolCard(props.request.toolName, props.request.args, props.request.syscall);
  return (
    <article class="tool-card is-pending">
      <div class="tool-card-head">
        <div>
          <h3>{card.title}</h3>
          {card.subtitle ? <p>{card.subtitle}</p> : null}
        </div>
        <span class="tool-status is-pending">Awaiting approval<span>{card.target}</span></span>
      </div>
      <div class="tool-preview">
        <p>{describeHilSummary(props.request, props.request.syscall)}</p>
        <p>This tool will not run until you decide.</p>
      </div>
      <div class="approval-actions">
        <button class="icon-button approve" type="button" title="Allow tool call" aria-label="Allow tool call" disabled={props.busy} onClick={() => props.onDecision(props.request.requestId, "approve")}>
          <CheckIcon />
        </button>
        <button class="icon-button deny" type="button" title="Deny tool call" aria-label="Deny tool call" disabled={props.busy} onClick={() => props.onDecision(props.request.requestId, "deny")}>
          <XIcon />
        </button>
      </div>
      <details class="tool-details">
        <summary>Details</summary>
        <ToolDetails row={{ kind: "toolCall", toolName: props.request.toolName, callId: props.request.callId, args: props.request.args, syscall: props.request.syscall, timestamp: props.request.createdAt }} syscall={props.request.syscall} />
      </details>
    </article>
  );
}

function Composer(props: {
  value: string;
  attachments: Attachment[];
  disabled: boolean;
  canSend: boolean;
  onValueChange(value: string): void;
  onSubmit(): void;
  onFiles(files: FileList | null): void;
  onRemoveAttachment(index: number): void;
}) {
  return (
    <form class="composer" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
      <div class="composer-top">
        <label class="icon-button attach" title="Attach files" aria-label="Attach files">
          <PaperclipIcon />
          <input type="file" multiple disabled={props.disabled} onChange={(event) => {
            const input = event.currentTarget as HTMLInputElement;
            props.onFiles(input.files);
            input.value = "";
          }} />
        </label>
        <div class="attachment-list">
          {props.attachments.map((attachment, index) => (
            <span class="attachment-chip" key={`${attachment.filename ?? "file"}:${index}`}>
              <span>{attachment.filename || "attachment"}</span>
              <button type="button" aria-label="Remove attachment" onClick={() => props.onRemoveAttachment(index)}>x</button>
            </span>
          ))}
        </div>
      </div>
      <textarea
        value={props.value}
        disabled={props.disabled}
        placeholder="Ask, continue the thread, or describe work for this process."
        onInput={(event) => props.onValueChange((event.currentTarget as HTMLTextAreaElement).value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            props.onSubmit();
          }
        }}
      />
      <div class="composer-foot">
        <span>Enter sends. Shift+Enter inserts a line.</span>
        <button class="primary-button" type="submit" disabled={!props.canSend}>Send</button>
      </div>
    </form>
  );
}

function ContextMeter({ state }: { state: ContextState | null }) {
  if (!state) {
    return null;
  }
  const pressure = state.pressure === null ? 0 : Math.max(0, Math.min(1, state.pressure));
  const text = formatContextPressure(state);
  return (
    <div class={`context-meter is-${state.level}`} title={`${text} - ${state.source === "provider" ? "provider usage" : "estimated"}`}>
      <span class="context-track"><span style={{ width: `${Math.round(pressure * 100)}%` }} /></span>
      <span>{text}</span>
    </div>
  );
}

function CompactDialog(props: {
  value: string;
  messageCount: number;
  compactBusy: boolean;
  onChange(value: string): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="compact-title">
        <header>
          <h2 id="compact-title">Compact Conversation</h2>
          <p>Archive older messages and keep the newest messages live in context.</p>
        </header>
        <label class="field-row">
          <span>Newest messages to keep</span>
          <input type="number" min="0" value={props.value} disabled={props.compactBusy} onInput={(event) => props.onChange((event.currentTarget as HTMLInputElement).value)} />
        </label>
        <p class="modal-note">Current live message count: {props.messageCount}</p>
        <footer>
          <button type="button" class="secondary-button" disabled={props.compactBusy} onClick={props.onCancel}>Cancel</button>
          <button type="button" class="primary-button" disabled={props.compactBusy} onClick={props.onConfirm}>
            {props.compactBusy ? "Compacting..." : "Compact"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ArchiveMessage({ entry }: { entry: unknown }) {
  const record = asRecord(entry);
  const role = record?.role === "user" || record?.role === "assistant" ? record.role : "system";
  const timestamp = normalizeTimestampMs(record?.timestamp);
  return (
    <article class="archive-message">
      <div>
        <span>{labelForRole(role)}</span>
        <span>{timestamp ? formatTimestamp(timestamp) : ""}</span>
      </div>
      <pre>{formatMessageContent(record?.content)}</pre>
    </article>
  );
}

function flattenHistory(messages: unknown[]): LogRow[] {
  const rows: LogRow[] = [];
  for (const entry of messages) {
    const record = asRecord(entry);
    const timestamp = normalizeTimestampMs(record?.timestamp) || Date.now();
    const messageId = asNumber(record?.id);
    if (record?.role === "assistant") {
      const parsed = extractAssistantHistory(record.content);
      if ((parsed.text && parsed.text.trim()) || parsed.thinking.length > 0) {
        rows.push({ kind: "message", role: "assistant", text: parsed.text, thinking: parsed.thinking, timestamp, messageId });
      }
      for (const toolCall of parsed.toolCalls) {
        rows.push({
          kind: "toolCall",
          toolName: toolCall.toolName,
          callId: toolCall.callId,
          args: toolCall.args,
          syscall: toolCall.syscall,
          timestamp,
        });
      }
      continue;
    }
    if (record?.role === "toolResult") {
      const parsed = extractToolResultHistory(record.content);
      if (parsed) {
        const callId = parsed.callId ?? "tool-result";
        const priorCallIndex = rows.findIndex((row) => row.kind === "toolCall" && row.callId === callId);
        if (priorCallIndex >= 0) {
          const prior = rows[priorCallIndex] as ToolRow;
          rows[priorCallIndex] = {
            kind: "toolResult",
            toolName: parsed.toolName,
            callId,
            args: prior.args,
            syscall: parsed.syscall ?? prior.syscall,
            output: parsed.output,
            ok: parsed.ok,
            error: parsed.error,
            timestamp,
          };
        } else {
          rows.push({
            kind: "toolResult",
            toolName: parsed.toolName,
            callId,
            args: {},
            syscall: parsed.syscall,
            output: parsed.output,
            ok: parsed.ok,
            error: parsed.error,
            timestamp,
          });
        }
      } else {
        rows.push({ kind: "message", role: "system", text: formatMessageContent(record.content), timestamp, messageId });
      }
      continue;
    }
    const role = record?.role === "user" ? "user" : record?.role === "assistant" ? "assistant" : "system";
    const contentRecord = asRecord(record?.content);
    const media = Array.isArray(contentRecord?.media) ? contentRecord.media : [];
    const text = contentRecord ? (asString(contentRecord.text) || formatMessageContent(record?.content)) : formatMessageContent(record?.content);
    rows.push({ kind: "message", role, text, media, timestamp, messageId });
  }
  return rows.length > 0 ? rows : systemRows("No messages yet. Send your first prompt.");
}

function applyProcessMessageSignal(
  payload: unknown,
  active: ThreadContext,
  setRows: (update: (current: LogRow[]) => LogRow[]) => void,
  setPendingAssistant: (value: PendingAssistantState) => void,
) {
  const record = asRecord(payload);
  const pid = asString(record?.pid);
  if (pid && pid !== active.pid) return;
  const conversationId = asString(record?.conversationId) || "default";
  if (conversationId !== active.conversationId) return;
  const content = asString(record?.content) ?? "";
  if (!content.trim()) return;
  const messageId = asNumber(record?.messageId);
  setRows((current) => {
    if (messageId && current.some((row) => row.kind === "message" && row.messageId === messageId)) {
      return current;
    }
    const role = record?.role === "user" || record?.role === "assistant" ? record.role : "system";
    return dropEmptyPlaceholder(current).concat({
      kind: "message",
      role,
      text: formatMessageContent(content),
      timestamp: asNumber(record?.timestamp) || Date.now(),
      messageId: messageId ?? null,
    });
  });
  setPendingAssistant("thinking");
}

function applyAssistantSignal(payload: unknown, active: ThreadContext, setRows: (update: (current: LogRow[]) => LogRow[]) => void) {
  const record = asRecord(payload);
  const pid = asString(record?.pid);
  if (pid && pid !== active.pid) return;
  const text = asString(record?.text) ?? "";
  const thinking = extractThinkingBlocks(record);
  if (!text.trim() && thinking.length === 0) return;
  const runId = asString(record?.runId);
  setRows((current) => {
    const next = current.slice();
    const last = next[next.length - 1];
    const row: MessageRow = { kind: "message", role: "assistant", text, thinking, timestamp: Date.now(), runId };
    if (last?.kind === "message" && last.role === "assistant" && runId && last.runId === runId) {
      next[next.length - 1] = row;
    } else {
      next.push(row);
    }
    return dropEmptyPlaceholder(next);
  });
}

function applyToolCallSignal(payload: unknown, active: ThreadContext, setRows: (update: (current: LogRow[]) => LogRow[]) => void) {
  const record = asRecord(payload);
  const pid = asString(record?.pid);
  if (pid && pid !== active.pid) return;
  const callId = asString(record?.callId);
  if (!callId) return;
  const row: ToolRow = {
    kind: "toolCall",
    toolName: asString(record?.name) || "Tool",
    callId,
    args: record?.args ?? {},
    syscall: asString(record?.syscall),
    timestamp: Date.now(),
    runId: asString(record?.runId),
  };
  setRows((current) => upsertToolRow(current, row));
}

function applyToolResultSignal(payload: unknown, active: ThreadContext, setRows: (update: (current: LogRow[]) => LogRow[]) => void) {
  const record = asRecord(payload);
  const pid = asString(record?.pid);
  if (pid && pid !== active.pid) return;
  const callId = asString(record?.callId);
  if (!callId) return;
  setRows((current) => {
    const existing = findToolRow(current, callId);
    const row: ToolRow = {
      kind: "toolResult",
      toolName: asString(record?.name) || existing?.toolName || "Tool",
      callId,
      args: existing?.args ?? {},
      syscall: asString(record?.syscall) ?? existing?.syscall,
      output: record?.output,
      ok: asBoolean(record?.ok) !== false,
      error: asString(record?.error),
      timestamp: Date.now(),
      runId: asString(record?.runId) ?? existing?.runId,
    };
    return upsertToolRow(current, row);
  });
}

function upsertToolRow(rows: LogRow[], nextRow: ToolRow): LogRow[] {
  const next = dropEmptyPlaceholder(rows).slice();
  const index = next.findIndex((row) => (row.kind === "toolCall" || row.kind === "toolResult") && row.callId === nextRow.callId);
  if (index >= 0) {
    const prior = next[index] as ToolRow;
    next[index] = { ...nextRow, args: nextRow.args ?? prior.args, syscall: nextRow.syscall ?? prior.syscall, runId: nextRow.runId ?? prior.runId };
  } else {
    next.push(nextRow);
  }
  return next;
}

function findToolRow(rows: LogRow[], callId: string): ToolRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if ((row.kind === "toolCall" || row.kind === "toolResult") && row.callId === callId) {
      return row;
    }
  }
  return null;
}

function normalizeContextSignal(payload: unknown, active: ThreadContext): ContextState | null {
  const record = asRecord(payload);
  const pid = asString(record?.pid);
  if (pid && pid !== active.pid) return null;
  const next = normalizeContextState(record?.context ?? record);
  if (!next || next.conversationId !== active.conversationId) return null;
  return next;
}

function extractAssistantHistory(content: unknown): { text: string; thinking: string[]; toolCalls: Array<{ toolName: string; callId: string; args: unknown; syscall: string | null }> } {
  const record = asRecord(content);
  if (!record) {
    return { text: typeof content === "string" ? content : formatMessageContent(content), thinking: [], toolCalls: [] };
  }
  const text = asString(record.text) || "";
  const thinking = (Array.isArray(record.thinking) ? record.thinking : [])
    .map((item) => {
      const block = asRecord(item);
      return asString(block?.thinking) || asString(block?.text) || (typeof item === "string" ? item : "");
    })
    .map((item) => item.trim())
    .filter(Boolean);
  const toolCalls = (Array.isArray(record.toolCalls) ? record.toolCalls : [])
    .map((item, index) => {
      const call = asRecord(item);
      if (!call) return null;
      const toolName = asString(call.name) || "tool";
      const callId = asString(call.id) || asString(call.callId) || `hist-call-${index}`;
      return { toolName, callId, args: call.arguments ?? call.args ?? {}, syscall: inferToolSyscall(toolName, asString(call.syscall)) };
    })
    .filter(Boolean) as Array<{ toolName: string; callId: string; args: unknown; syscall: string | null }>;
  return { text, thinking, toolCalls };
}

function extractToolResultHistory(content: unknown) {
  const record = asRecord(content);
  const toolName = asString(record?.toolName) || asString(record?.name);
  if (!toolName) return null;
  return {
    toolName,
    callId: asString(record?.toolCallId) || asString(record?.callId) || asString(record?.id),
    ok: record?.ok === true || record?.isError !== true,
    output: record?.output,
    error: asString(record?.error),
    syscall: inferToolSyscall(toolName, asString(record?.syscall)),
  };
}

function extractThinkingBlocks(value: unknown): string[] {
  const record = asRecord(value);
  const raw = Array.isArray(record?.thinking) ? record.thinking : [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const block = asRecord(item);
      return (asString(block?.thinking) || asString(block?.text) || "").trim();
    })
    .filter(Boolean);
}

async function readAttachmentFile(file: File): Promise<Attachment> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
  return {
    type: inferAttachmentKind(file.type, file.name),
    mimeType: file.type || "application/octet-stream",
    data,
    filename: file.name || undefined,
    size: typeof file.size === "number" ? file.size : undefined,
  };
}

function inferAttachmentKind(mimeType: string, filename: string): string {
  const normalized = safeText(mimeType).split(";")[0].trim().toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  const lowerName = safeText(filename).toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(lowerName)) return "image";
  if (/\.(mp3|wav|ogg|m4a)$/.test(lowerName)) return "audio";
  if (/\.(mp4|mov|webm)$/.test(lowerName)) return "video";
  return "document";
}

function renderMarkdownHtml(value: string): string {
  const runtime = globalThis as unknown as {
    marked?: { parse(source: string, options?: Record<string, unknown>): unknown };
    DOMPurify?: { sanitize(source: string): string };
  };
  if (!runtime.marked?.parse || !runtime.DOMPurify?.sanitize) {
    return escapeHtml(value);
  }
  const html = runtime.marked.parse(value, { async: false, breaks: true, gfm: true });
  return runtime.DOMPurify.sanitize(typeof html === "string" ? html : String(html));
}

function normalizeProfile(value: unknown): Profile | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  if (!id) return null;
  return {
    id,
    alias: asString(record?.alias) || undefined,
    displayName: asString(record?.displayName) || id,
    description: asString(record?.description) || "",
    kind: asString(record?.kind) || "system",
    interactive: record?.interactive === true,
    startable: record?.startable === true,
    background: record?.background === true,
    spawnMode: asString(record?.spawnMode) || "new",
  };
}

function normalizeWorkspace(value: unknown): WorkspaceEntry | null {
  const record = asRecord(value);
  const workspaceId = asString(record?.workspaceId);
  if (!workspaceId) return null;
  const activeProcessRecord = asRecord(record?.activeProcess);
  return {
    workspaceId,
    label: asString(record?.label) || undefined,
    updatedAt: normalizeTimestampMs(record?.updatedAt) || Date.now(),
    processCount: asNumber(record?.processCount) ?? undefined,
    activeProcess: activeProcessRecord && asString(activeProcessRecord.pid)
      ? { pid: asString(activeProcessRecord.pid) as string, cwd: asString(activeProcessRecord.cwd) || "" }
      : null,
  };
}

function normalizeConversation(value: unknown): ConversationRecord | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  if (!id) return null;
  return {
    id,
    generation: asNumber(record?.generation) || 0,
    status: asString(record?.status) || "open",
    title: asString(record?.title),
    messageCount: asNumber(record?.messageCount) || 0,
    createdAt: normalizeTimestampMs(record?.createdAt) || Date.now(),
    updatedAt: normalizeTimestampMs(record?.updatedAt) || Date.now(),
  };
}

function normalizeConversationSegment(value: unknown): ConversationSegment | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  if (!id) return null;
  return {
    id,
    generation: asNumber(record?.generation) || 0,
    fromMessageId: asNumber(record?.fromMessageId) || 0,
    toMessageId: asNumber(record?.toMessageId) || 0,
    archivePath: asString(record?.archivePath) || "",
    summaryMessageId: asNumber(record?.summaryMessageId),
    createdAt: normalizeTimestampMs(record?.createdAt) || Date.now(),
  };
}

function normalizeHilRequest(value: unknown): HilRequest | null {
  const record = asRecord(value);
  const requestId = asString(record?.requestId);
  const runId = asString(record?.runId);
  const callId = asString(record?.callId);
  const toolName = asString(record?.toolName);
  const syscall = asString(record?.syscall);
  if (!requestId || !runId || !callId || !toolName || !syscall) return null;
  return { requestId, runId, callId, toolName, syscall, args: record?.args ?? {}, createdAt: asNumber(record?.createdAt) || Date.now() };
}

function normalizeContextState(value: unknown): ContextState | null {
  const record = asRecord(value);
  if (!record) return null;
  const level = record.level === "ok" || record.level === "warn" || record.level === "critical" || record.level === "full" || record.level === "unknown"
    ? record.level
    : "unknown";
  return {
    conversationId: asString(record.conversationId) || "default",
    provider: asString(record.provider),
    model: asString(record.model),
    contextWindowTokens: normalizePositiveNumber(record.contextWindowTokens),
    maxOutputTokens: normalizePositiveNumber(record.maxOutputTokens) || 0,
    estimatedInputTokens: normalizePositiveNumber(record.estimatedInputTokens) || 0,
    inputTokens: normalizePositiveNumber(record.inputTokens) || 0,
    outputTokens: normalizePositiveNumber(record.outputTokens),
    totalTokens: normalizePositiveNumber(record.totalTokens),
    availableInputTokens: normalizePositiveNumber(record.availableInputTokens),
    pressure: typeof record.pressure === "number" && Number.isFinite(record.pressure) && record.pressure >= 0 ? record.pressure : null,
    level,
    source: record.source === "provider" ? "provider" : "estimate",
    updatedAt: normalizeTimestampMs(record.updatedAt) || Date.now(),
  };
}

function normalizeThreadContext(value: unknown): ThreadContext | null {
  const record = asRecord(value);
  const pid = asString(record?.pid)?.trim() || "";
  const cwd = asString(record?.cwd)?.trim() || "";
  if (!pid || !cwd) return null;
  const conversationId = asString(record?.conversationId)?.trim() || "default";
  return {
    pid,
    cwd,
    workspaceId: asString(record?.workspaceId),
    conversationId,
    conversationTitle: asString(record?.conversationTitle),
  };
}

function getStoredThreadContext(): ThreadContext | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_THREAD_CONTEXT_KEY);
    return raw ? normalizeThreadContext(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function setStoredThreadContext(context: ThreadContext | null): ThreadContext | null {
  const normalized = normalizeThreadContext(context);
  try {
    if (normalized) {
      window.localStorage.setItem(ACTIVE_THREAD_CONTEXT_KEY, JSON.stringify(normalized));
    } else {
      window.localStorage.removeItem(ACTIVE_THREAD_CONTEXT_KEY);
    }
  } catch {}
  return normalized;
}

function fallbackProfiles(): Profile[] {
  return [
    { id: "init", displayName: "Home", description: "Persistent home conversation.", kind: "system", interactive: true, startable: true, background: false, spawnMode: "singleton" },
    { id: "task", displayName: "Task", description: "Focused task conversation.", kind: "system", interactive: true, startable: true, background: false, spawnMode: "new" },
    { id: "review", displayName: "Review", description: "Review conversation.", kind: "system", interactive: true, startable: true, background: false, spawnMode: "new" },
    { id: "mcp", displayName: "Master Control", description: "Operational control-plane work.", kind: "system", interactive: true, startable: true, background: false, spawnMode: "new" },
  ];
}

function titleForActive(active: ThreadContext, conversation: ConversationRecord | null, threads: WorkspaceEntry[]): string {
  if (active.pid.startsWith("init:")) {
    return active.conversationId === "default" ? "Home" : active.conversationTitle || conversation?.title || "Home Branch";
  }
  if (active.conversationId !== "default") {
    return active.conversationTitle || conversation?.title || "Conversation Branch";
  }
  const entry = active.workspaceId ? threads.find((thread) => thread.workspaceId === active.workspaceId) : null;
  return entry ? displayThreadLabel(entry) : "Conversation";
}

function activeMeta(active: ThreadContext, conversation: ConversationRecord | null): string {
  if (active.conversationId !== "default") {
    return `${conversation?.title || active.conversationTitle || active.conversationId} - ${active.cwd}`;
  }
  return active.pid.startsWith("init:") ? "Persistent home conversation" : active.cwd;
}

function draftConversationTitle(profile: Profile): string {
  return !profile || profile.id === "task" ? "New Conversation" : `New ${profile.displayName}`;
}

function draftConversationMeta(profile: Profile): string {
  return !profile || profile.id === "task"
    ? "Send a message to start a task conversation, or open Home."
    : `Send a message to start ${profile.displayName.toLowerCase()}.`;
}

function getStatusText(args: {
  active: ThreadContext | null;
  draftProfile: Profile;
  hostError: string;
  pendingAssistant: PendingAssistantState;
  pendingHil: HilRequest | null;
  messageBusy: boolean;
  abortBusy: boolean;
  hilBusy: boolean;
}): string {
  if (args.hostError) return args.hostError;
  if (args.hilBusy) return "Applying confirmation...";
  if (args.pendingHil) return "Tool confirmation is required before the run can continue.";
  if (args.abortBusy) return "Stopping active run...";
  if (args.messageBusy) return "Run in progress. Responses will refresh as signals arrive.";
  if (args.pendingAssistant) return "Run active. Send to queue another message or stop it.";
  if (args.active) return args.active.pid.startsWith("init:") ? "Attached to Home." : "Attached to active process.";
  return draftConversationMeta(args.draftProfile);
}

function sortConversations(conversations: ConversationRecord[]): ConversationRecord[] {
  return [...conversations].sort((left, right) => {
    if (left.id === "default") return -1;
    if (right.id === "default") return 1;
    return right.updatedAt - left.updatedAt;
  });
}

function displayThreadLabel(entry: WorkspaceEntry): string {
  const label = entry.label?.trim() || entry.workspaceId;
  return label.length > 76 ? label.slice(0, 73) + "..." : label;
}

function deriveThreadLabel(message: string): string | undefined {
  const firstLine = message.split("\n").map((line) => line.trim()).find(Boolean);
  if (!firstLine) return undefined;
  return firstLine.length > 72 ? firstLine.slice(0, 69) + "..." : firstLine;
}

function labelForRole(role: string): string {
  if (role === "user") return "You";
  if (role === "assistant") return "Assistant";
  return "System";
}

function suggestKeepLast(messageCount: number, context: ContextState | null): number {
  if (context?.level === "full" || context?.level === "critical") {
    return Math.min(40, Math.max(1, messageCount - 1));
  }
  if (messageCount > 0 && messageCount <= 80) {
    return Math.max(1, Math.floor(messageCount / 2));
  }
  return 80;
}

function systemRow(text: string): MessageRow {
  return { kind: "message", role: "system", text, timestamp: Date.now() };
}

function systemRows(text: string): LogRow[] {
  return [systemRow(text)];
}

function dropEmptyPlaceholder(rows: LogRow[]): LogRow[] {
  return rows.filter((row) => !(row.kind === "message" && row.role === "system" && (
    row.text === "Connecting chat backend." ||
    row.text === "No messages yet. Send your first prompt." ||
    row.text.startsWith("Send a message to start")
  )));
}

function formatMessageContent(value: unknown): string {
  const record = asRecord(value);
  if (record) {
    const text = asString(record.text) || "";
    const media = Array.isArray(record.media) ? record.media : [];
    if (media.length > 0) {
      const lines = text.trim() ? [text] : [];
      for (const item of media) lines.push(describeAttachment(item));
      return lines.join("\n");
    }
  }
  return typeof value === "string" ? value : prettyJson(value);
}

function describeAttachment(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "Attached media";
  const type = asString(record.type) || "media";
  const filename = asString(record.filename);
  const mimeType = asString(record.mimeType);
  const size = asNumber(record.size);
  const parts = ["Attached " + type];
  if (filename) parts.push(`"${filename}"`);
  if (mimeType) parts.push(`[${mimeType}]`);
  const sizeLabel = formatAttachmentSize(size);
  if (sizeLabel) parts.push(sizeLabel);
  return parts.join(" ");
}

function formatAttachmentSize(size: number | null): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function inferToolSyscall(toolName: string, syscall?: string | null): string | null {
  if (syscall?.trim()) return syscall.trim();
  switch (toolName) {
    case "Read": return "fs.read";
    case "Search": return "fs.search";
    case "Shell": return "shell.exec";
    case "Write": return "fs.write";
    case "Edit": return "fs.edit";
    case "Delete": return "fs.delete";
    default: return null;
  }
}

function describeToolCard(toolName: string, args: unknown, syscall: string | null): { title: string; subtitle: string; target: string } {
  const record = asRecord(args);
  const path = asString(record?.path);
  const target = resolveToolTarget(args);
  if (toolName === "Shell" || syscall === "shell.exec") {
    const command = asString(record?.input);
    const cwd = asString(record?.cwd);
    return { title: record?.sessionId ? "Continue shell session" : command ? "Run " + truncateInline(command) : "Run command", subtitle: cwd ? "cwd " + truncateInline(cwd, 36) : "", target };
  }
  if (toolName === "Read" || syscall === "fs.read") return { title: path ? "Read " + basenamePath(path) : "Read file", subtitle: path ?? "", target };
  if (toolName === "Search" || syscall === "fs.search") return { title: "Search workspace", subtitle: path ?? "", target };
  if (toolName === "Write" || syscall === "fs.write") return { title: path ? "Write " + basenamePath(path) : "Write file", subtitle: path ?? "", target };
  if (toolName === "Edit" || syscall === "fs.edit") return { title: path ? "Edit " + basenamePath(path) : "Edit file", subtitle: path ?? "", target };
  if (toolName === "Delete" || syscall === "fs.delete") return { title: path ? "Delete " + basenamePath(path) : "Delete file", subtitle: path ?? "", target };
  return { title: toolName, subtitle: "", target };
}

function describeHilSummary(request: HilRequest, syscall: string): string {
  const args = asRecord(request.args) || {};
  const path = asString(args.path);
  const command = asString(args.input);
  if (request.toolName === "Shell" || syscall === "shell.exec") {
    return command ? `Run "${truncateInline(command, 96)}".` : "Run a shell command.";
  }
  if (request.toolName === "Read" || syscall === "fs.read") return path ? `Read ${path}.` : "Read a file.";
  if (request.toolName === "Write" || syscall === "fs.write") return path ? `Write ${path}.` : "Write a file.";
  if (request.toolName === "Edit" || syscall === "fs.edit") return path ? `Edit ${path}.` : "Edit a file.";
  if (request.toolName === "Delete" || syscall === "fs.delete") return path ? `Delete ${path}.` : "Delete a file.";
  return "Confirm this tool call before it runs.";
}

function resolveToolTarget(args: unknown): string {
  const record = asRecord(args);
  const raw = asString(record?.target)?.trim() || "";
  if (!raw || raw === "gsv" || raw === "gateway" || raw === "<init>" || raw === "init" || raw === "local") return "gsv";
  if (raw.startsWith("device:")) return raw.slice("device:".length) || raw;
  if (raw.startsWith("driver:")) return raw.slice("driver:".length) || raw;
  return raw;
}

function normalizeToolOutput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function formatContextPressure(state: ContextState): string {
  if (!state.availableInputTokens || state.pressure === null) return "context unknown";
  const percent = Math.round(state.pressure * 100);
  return `${percent}% context - ${formatCompactTokens(state.inputTokens)}/${formatCompactTokens(state.availableInputTokens)}`;
}

function formatCompactTokens(value: number | null): string {
  if (!value || !Number.isFinite(value)) return "0";
  if (value >= 1000000) return (value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(Math.round(value));
}

function basenamePath(path: string): string {
  const normalized = String(path ?? "").replace(/\/+$/g, "");
  if (!normalized) return path;
  return normalized.split("/").pop() || normalized;
}

function formatTimestamp(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(value: number): string {
  const deltaMs = value - Date.now();
  const abs = Math.abs(deltaMs);
  if (abs < 60000) return "just now";
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86400000], ["hour", 3600000], ["minute", 60000]];
  for (const [unit, ms] of units) {
    if (abs >= ms) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(deltaMs / ms), unit);
    }
  }
  return "just now";
}

function shortId(value: string): string {
  if (!value) return "";
  if (value === "default") return "default";
  if (value.includes(":")) return value;
  return value.length > 12 ? value.slice(0, 8) : value;
}

function isNearBottom(node: HTMLElement, thresholdPx = 96): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= thresholdPx;
}

function truncateInline(value: unknown, maxLength = 80): string {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : compact.slice(0, maxLength) + "...";
}

function truncateBlock(value: unknown, maxLength = 1800): string {
  const text = String(value ?? "");
  return text.length <= maxLength ? text : text.slice(0, maxLength) + "\n...[truncated]";
}

function normalizeTimestampMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value > 0 && value < 1000000000000) return Math.floor(value * 1000);
  return Math.floor(value);
}

function normalizePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5" /><path d="M6.5 9.5V20h11V9.5" /><path d="M10 20v-5h4v5" /></svg>;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}
function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5.5" /><path d="M20 4v7h-7" /></svg>;
}
function FolderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
}
function TerminalIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /><path d="m7 10 3 2.5L7 15" /><path d="M12.5 15H17" /></svg>;
}
function StopIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>;
}
function CompactIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v5H3" /><path d="M16 20v-5h5" /><path d="M3 9l6-6" /><path d="M21 15l-6 6" /></svg>;
}
function BranchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7a4 4 0 0 0 4 4h8" /><path d="M15 10l4 4-4 4" /><path d="M6 21v-7" /></svg>;
}
function PaperclipIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.44 11.05 12 20.5a6 6 0 0 1-8.49-8.49l9.19-9.2a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.49-8.48" /></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>;
}
function XIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10" /><path d="M17 7 7 17" /></svg>;
}
