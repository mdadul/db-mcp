import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Bot, Check, ChevronRight, CircleStop, Copy, Database, Maximize2, Pencil, Plus, Search, Send, Settings2, Sparkles, Table2, Trash2, Wrench, X } from "lucide-react";
import { analystApi, type ProviderInput } from "@/features/analyst/api";
import { parseAnalystEvents } from "@/features/analyst/sse";
import { renderMarkdown } from "@/features/analyst/markdown";
import type { AnalystArtifact, AnalystEvent, AnalystMessage, AnalystPlaybook, AnalystProvider, AnalystThread, ProviderKind } from "@/features/analyst/types";
import { databaseApi } from "@/features/databases/api/databaseApi";
import { DB_ENGINES, type DatabaseConnection } from "@/features/databases/types";
import { VirtualDataGrid } from "@/features/databases/components/VirtualDataGrid";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/Textarea";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Field } from "@/components/ui/Field";
import { RadioCards } from "@/components/ui/RadioCards";
import { ResizablePanels } from "@/components/ui/ResizablePanels";
import { Skeleton } from "@/components/ui/Skeleton";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Kbd";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import "@/features/analyst/analyst.css";

const ChartRenderer = lazy(() => import("@/features/analyst/ChartRenderer").then((module) => ({ default: module.ChartRenderer })));

const PROVIDER_KEY = "dbmcp.analyst.provider";
const MODEL_KEY = "dbmcp.analyst.model";
const TABLE_KEY = "dbmcp.analyst.table";
const PRESETS = [
  { value: "ollama", label: "Ollama", url: "http://127.0.0.1:11434/v1" },
  { value: "lm-studio", label: "LM Studio", url: "http://127.0.0.1:1234/v1" },
  { value: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { value: "custom", label: "Custom", url: "" },
] as const;

export function AnalystPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [providerDialog, setProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AnalystProvider | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<AnalystProvider | null>(null);
  const [providerId, setProviderId] = useState(() => localStorage.getItem(PROVIDER_KEY) ?? "");
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? "");
  const [databaseId, setDatabaseId] = useState("");
  const [tableContext, setTableContext] = useState(() => localStorage.getItem(TABLE_KEY) ?? "");
  const [playbooksOpen, setPlaybooksOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [liveText, setLiveText] = useState("");
  const [liveTools, setLiveTools] = useState<ToolStep[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<AnalystArtifact[]>([]);
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [activeRequest, setActiveRequest] = useState<{ threadId: string; controller: AbortController } | null>(null);
  const [streamError, setStreamError] = useState<{ message: string; hint: string } | null>(null);
  const [retryText, setRetryText] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AnalystThread | null>(null);
  const [jumpVisible, setJumpVisible] = useState(false);
  const [fullScreenResult, setFullScreenResult] = useState<string | null>(null);
  const [fullScreenArtifact, setFullScreenArtifact] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingTextRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const providersQuery = useQuery({ queryKey: ["analyst", "providers"], queryFn: analystApi.providers });
  const threadsQuery = useQuery({ queryKey: ["analyst", "threads"], queryFn: analystApi.threads });
  const detailQuery = useQuery({ queryKey: ["analyst", "thread", threadId], queryFn: () => analystApi.thread(threadId ?? ""), enabled: Boolean(threadId) });
  const databasesQuery = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const playbooksQuery = useQuery({ queryKey: ["analyst", "playbooks"], queryFn: analystApi.playbooks });
  const schemaQuery = useQuery({ queryKey: ["databases", databaseId, "schema"], queryFn: () => databaseApi.getSchemaTree(databaseId), enabled: Boolean(databaseId) });
  const providers = providersQuery.data ?? [];
  const threads = threadsQuery.data ?? [];
  const currentThread = detailQuery.data?.thread ?? threads.find((thread) => thread.id === threadId);
  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? providers.find((provider) => provider.id === currentThread?.providerId) ?? providers[0];
  const currentModel = model || selectedProvider?.defaultModel || currentThread?.model || "";
  const providerForCurrent = selectedProvider;
  const providerModelsQuery = useQuery({ queryKey: ["analyst", "provider-models", providerForCurrent?.id], queryFn: () => analystApi.models(providerForCurrent?.id ?? ""), enabled: Boolean(providerForCurrent?.id) });
  const databases = databasesQuery.data ?? [];
  const database = databases.find((item) => item.id === databaseId);
  const tables = useMemo(() => schemaQuery.data?.schemas.flatMap((schema) => schema.tables.map((table) => ({ id: `${schema.name}.${table.name}`, label: `${schema.name}.${table.name}` }))) ?? [], [schemaQuery.data]);
  const filteredThreads = threads.filter((thread) => thread.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const threadGroups = groupThreads(filteredThreads);
  const messages = detailQuery.data?.messages ?? [];
  const persistedArtifacts = detailQuery.data?.artifacts ?? [];
  const artifacts = [...persistedArtifacts, ...liveArtifacts.filter((artifact) => !persistedArtifacts.some((stored) => stored.id === artifact.id))];
  const noProviders = !providersQuery.isLoading && providers.length === 0;

  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0].id);
  }, [providerId, providers]);
  useEffect(() => { if (providerId) localStorage.setItem(PROVIDER_KEY, providerId); }, [providerId]);
  useEffect(() => { if (model) localStorage.setItem(MODEL_KEY, model); }, [model]);
  useEffect(() => { if (tableContext) localStorage.setItem(TABLE_KEY, tableContext); }, [tableContext]);
  useEffect(() => {
    if (!currentThread) return;
    setProviderId(currentThread.providerId);
    setModel(currentThread.model);
    setDatabaseId(currentThread.databaseId ?? "");
    setLiveArtifacts([]);
  }, [currentThread?.id, currentThread?.providerId, currentThread?.model, currentThread?.databaseId]);
  useEffect(() => {
    if (pinnedRef.current) bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, liveText, liveTools.length, liveArtifacts.length, streaming]);
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    abortRef.current?.abort();
  }, []);
  useEffect(() => {
    const openResult = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "string") setFullScreenResult(detail);
    };
    window.addEventListener("analyst:fullscreen-result", openResult);
    return () => window.removeEventListener("analyst:fullscreen-result", openResult);
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n" && location.pathname.startsWith("/analyst")) { event.preventDefault(); event.stopPropagation(); newChat(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [navigate, location.pathname]);

  const invalidateThreadData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["analyst", "threads"] }),
      queryClient.invalidateQueries({ queryKey: ["analyst", "thread"] }),
    ]);
  }, [queryClient]);
  const createProviderMutation = useMutation({ mutationFn: (input: ProviderInput) => editingProvider ? analystApi.updateProvider(editingProvider.id, input) : analystApi.createProvider(input), onSuccess: async (provider) => { const updated = Boolean(editingProvider); await queryClient.invalidateQueries({ queryKey: ["analyst", "providers"] }); setProviderId(provider.id); setModel(provider.defaultModel); setProviderDialog(false); setEditingProvider(null); toast.success(updated ? "Provider updated" : "Provider added"); }, onError: (error) => toast.error(error.message) });
  const removeProviderMutation = useMutation({ mutationFn: (provider: AnalystProvider) => analystApi.deleteProvider(provider.id), onSuccess: async (_, provider) => { await queryClient.invalidateQueries({ queryKey: ["analyst", "providers"] }); if (providerId === provider.id) setProviderId(""); setProviderToDelete(null); toast.success("Provider deleted"); }, onError: (error) => toast.error(error.message) });
  const deleteThreadMutation = useMutation({ mutationFn: (thread: AnalystThread) => analystApi.deleteThread(thread.id), onSuccess: async (_, thread) => { await queryClient.invalidateQueries({ queryKey: ["analyst", "threads"] }); setDeleteTarget(null); if (threadId === thread.id) navigate("/analyst", { replace: true }); toast.success("Chat deleted"); }, onError: (error) => toast.error(error.message) });
  const renameThreadMutation = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => analystApi.renameThread(id, title), onSuccess: async () => { setRenaming(null); await queryClient.invalidateQueries({ queryKey: ["analyst", "threads"] }); await queryClient.invalidateQueries({ queryKey: ["analyst", "thread"] }); }, onError: (error) => toast.error(error.message) });
  const updateThreadMutation = useMutation({ mutationFn: ({ id, input }: { id: string; input: { providerId?: string; model?: string } }) => analystApi.updateThread(id, input), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["analyst", "threads"] }); await queryClient.invalidateQueries({ queryKey: ["analyst", "thread"] }); }, onError: (error) => toast.error(error.message) });

  function newChat() {
    if (activeRequest) void stopGeneration();
    setLiveText(""); setLiveTools([]); setLiveArtifacts([]); setUsage(null); setStreamError(null); setDraft("");
    navigate("/analyst");
  }

  async function sendMessage(text = draft) {
    const message = text.trim();
    if (!message || streaming || !providerForCurrent) return;
    const contextualMessage = tableContext ? `Use ${tableContext} as the selected table context.\n\n${message}` : message;
    setDraft(""); setRetryText(message); setStreamError(null); setLiveText(""); setLiveTools([]); setLiveArtifacts([]); setUsage(null);
    let activeThreadId = threadId;
    try {
      if (!activeThreadId) {
        const created = await analystApi.createThread({ providerId: providerId || providerForCurrent.id, model: model || providerForCurrent.defaultModel, databaseId: databaseId || null });
        activeThreadId = created.id;
        navigate(`/analyst/${created.id}`, { replace: true });
        await queryClient.invalidateQueries({ queryKey: ["analyst", "threads"] });
      }
      if (!activeThreadId) throw new Error("Could not create an Analyst chat");
      const controller = new AbortController(); abortRef.current = controller; setStreaming(true);
      setActiveRequest({ threadId: activeThreadId, controller });
      const response = await analystApi.stream(activeThreadId, contextualMessage, databaseId || null, controller.signal);
      if (!response.body) throw new Error("The local server did not return a stream. Try again.");
      for await (const event of parseAnalystEvents(response.body)) handleEvent(event, activeThreadId);
      await invalidateThreadData();
      setLiveText(""); setLiveTools([]); setLiveArtifacts([]); setUsage(null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setStreamError({ message: error instanceof Error ? error.message : "The message could not be sent", hint: "Check the connection and provider settings, then retry." });
      await invalidateThreadData();
    } finally {
      if (pendingTextRef.current) { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); rafRef.current = null; setLiveText((text) => text + pendingTextRef.current); pendingTextRef.current = ""; }
      setStreaming(false); abortRef.current = null; setActiveRequest(null);
    }
  }

  function handleEvent(event: AnalystEvent, activeThreadId: string) {
    switch (event.type) {
      case "message.start": break;
      case "text.delta":
        pendingTextRef.current += event.text;
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => { setLiveText((text) => text + pendingTextRef.current); pendingTextRef.current = ""; rafRef.current = null; });
        break;
      case "tool.call": setLiveTools((items) => [...items, { id: event.toolCallId, name: event.toolName, args: event.args, status: "running" }]); break;
      case "tool.result": setLiveTools((items) => items.map((item) => item.id === event.toolCallId ? { ...item, status: event.ok ? "success" : "error", summary: event.summary, rowCount: event.rowCount, resultId: event.resultId, error: event.error } : item)); break;
      case "usage": setUsage({ inputTokens: event.inputTokens, outputTokens: event.outputTokens }); break;
      case "error": setStreamError({ message: event.message, hint: event.hint }); break;
      case "artifact.created":
        setLiveArtifacts((items) => [...items, { id: event.artifactId, kind: event.kind, title: event.title, resultId: event.resultId, threadId: activeThreadId, messageId: "", spec: null, createdAt: new Date().toISOString() }]);
        break;
      case "turn.done":
        setStreaming(false);
        void queryClient.invalidateQueries({ queryKey: ["analyst", "thread", activeThreadId] });
        break;
      default: { const exhaustive: never = event; return exhaustive; }
    }
  }

  async function stopGeneration() {
    const request = activeRequest;
    if (!request) return;
    request.controller.abort();
    try { await analystApi.cancel(request.threadId); } catch { /* The fetch abort still stops the local stream. */ }
    setStreaming(false);
  }

  const sidebar = <section className="flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-surface" aria-label="Analyst conversations">
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3"><span className="flex-1 text-secondary font-semibold">Chats</span><Button variant="ghost" size="icon-xs" aria-label="New chat" title="New chat (⌘N)" onClick={newChat}><Plus /></Button></div>
    <label className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-muted-foreground"><Search className="size-3.5" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats…" className="h-7 border-0 bg-transparent px-0 text-caption shadow-none focus-visible:ring-0" /></label>
    <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {threadsQuery.isLoading ? <div role="status" aria-label="Loading chats" className="space-y-2 p-2">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-9 w-full" />)}</div> : threadsQuery.isError ? <div role="alert" className="p-3 text-caption text-danger">{threadsQuery.error.message}<Button variant="ghost" size="xs" onClick={() => void threadsQuery.refetch()}>Retry</Button></div> : threadGroups.every(([, items]) => !items.length) ? <p className="px-3 py-6 text-center text-caption text-muted-foreground">{search ? "No matching chats." : "Your conversations will appear here."}</p> : threadGroups.map(([group, items]) => items.length ? <div key={group} className="mb-2"><p className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>{items.map((thread) => <div key={thread.id} className={`group flex h-8 items-center gap-1 rounded px-2 ${threadId === thread.id ? "bg-accent-subtle text-foreground" : "text-muted-foreground hover:bg-muted"}`}>
        {renaming === thread.id ? <form className="flex min-w-0 flex-1 gap-1" onSubmit={(event) => { event.preventDefault(); renameThreadMutation.mutate({ id: thread.id, title: renameValue.trim() || thread.title }); }}><Input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="h-6 text-caption" onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} /><Button variant="ghost" size="icon-xs" aria-label="Save chat name" type="submit"><Check /></Button></form> : <button type="button" className="min-w-0 flex-1 truncate text-left text-caption outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => navigate(`/analyst/${thread.id}`)}>{thread.title}</button>}
        {renaming !== thread.id && <div className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex"><Button variant="ghost" size="icon-xs" aria-label={`Rename ${thread.title}`} onClick={() => { setRenaming(thread.id); setRenameValue(thread.title); }}><Pencil /></Button><Button variant="ghost" size="icon-xs" aria-label={`Delete ${thread.title}`} onClick={() => setDeleteTarget(thread)}><Trash2 /></Button></div>}
      </div>)}</div> : null)}
    </div>
    <div className="border-t border-border p-2"><Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setEditingProvider(null); setProviderDialog(true); }}><Settings2 data-icon="inline-start" />Providers</Button></div>
  </section>;

  const main = <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background" aria-label="Analyst chat">
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3"><div className="flex min-w-0 flex-1 items-center gap-2"><Sparkles className="size-4 shrink-0 text-primary"/><span className="truncate text-secondary font-semibold">{currentThread?.title ?? "New analysis"}</span></div><span className="hidden text-caption text-muted-foreground @xl:inline">{providerForCurrent?.name ?? "No provider configured"}{currentModel ? ` · ${currentModel}` : ""}</span><Button variant="ghost" size="sm" onClick={() => { setEditingProvider(null); setProviderDialog(true); }}><Settings2 data-icon="inline-start" />Providers</Button></div>
    {noProviders ? <ProviderSetup onConfigure={() => { setEditingProvider(null); setProviderDialog(true); }} /> : providersQuery.isLoading ? <div className="m-auto w-full max-w-xl space-y-3 p-8" role="status" aria-label="Loading Analyst"><Skeleton className="mx-auto h-12 w-12 rounded-full"/><Skeleton className="mx-auto h-5 w-56"/><Skeleton className="h-24 w-full"/></div> : detailQuery.isLoading && threadId ? <div className="m-auto w-full max-w-3xl space-y-4 p-8" role="status" aria-label="Loading conversation">{[1, 2, 3].map((item) => <Skeleton key={item} className={`h-20 ${item % 2 ? "w-3/4" : "ml-auto w-2/3"}`} />)}</div> : <>
      {detailQuery.isError && <div className="m-3 rounded-md border border-danger/30 bg-danger-subtle p-3 text-secondary text-danger" role="alert">{detailQuery.error.message}<Button variant="outline" size="xs" className="ml-2" onClick={() => void detailQuery.refetch()}>Retry</Button></div>}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={(event) => { const element = event.currentTarget; pinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72; setJumpVisible(!pinnedRef.current); }}>
        {messages.length === 0 && !liveText && !liveTools.length && !liveArtifacts.length ? <EmptyConversation hasThread={Boolean(threadId)} database={databases.find((item) => item.id === databaseId)} onPrompt={(prompt) => void sendMessage(prompt)} /> : <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-8">
          {messages.map((message, index) => <div key={message.id} className="space-y-3"><MessageView message={message} databases={databases} toolResults={toolResultsAfter(message, messages[index + 1])} />{persistedArtifacts.filter((artifact) => artifact.messageId === message.id).map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} onExpand={() => setFullScreenArtifact(artifact.id)} />)}</div>)}
          {persistedArtifacts.filter((artifact) => !messages.some((message) => message.id === artifact.messageId)).map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} onExpand={() => setFullScreenArtifact(artifact.id)} />)}
          {(liveTools.length > 0 || liveText || liveArtifacts.length > 0 || streaming) && <article className="flex gap-3" aria-label="Analyst response"><div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary"><Bot className="size-4"/></div><div className="min-w-0 flex-1 space-y-3">{liveTools.map((tool) => <ToolStepView key={tool.id} step={tool} databases={databases} />)}{liveText && <Markdown text={liveText} />}{artifacts.filter((artifact) => !persistedArtifacts.some((stored) => stored.id === artifact.id)).map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} onExpand={() => setFullScreenArtifact(artifact.id)} />)}{streaming && !liveText && !liveTools.length && !liveArtifacts.length && <span className="inline-flex items-center gap-2 text-secondary text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-primary"/>Thinking…</span>}{usage && <p className="text-caption text-muted-foreground">{usage.inputTokens.toLocaleString()} input · {usage.outputTokens.toLocaleString()} output tokens</p>}</div></article>}
          {streamError && <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-secondary" role="alert"><p className="font-medium text-danger">{streamError.message}</p><p className="mt-1 text-muted-foreground">{streamError.hint}</p><Button variant="outline" size="xs" className="mt-2" disabled={!retryText || streaming} onClick={() => void sendMessage(retryText)}>Retry</Button></div>}
          <div ref={bottomRef} />
        </div>}
      </div>
      {jumpVisible && <Button variant="outline" size="sm" className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 shadow-md" onClick={() => { pinnedRef.current = true; bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setJumpVisible(false); }}>Jump to latest ↓</Button>}
      <div className="shrink-0 border-t border-border bg-surface/80 px-3 pb-3 pt-2 md:px-6"><div className="mx-auto max-w-4xl">
        <div className="mb-2 flex flex-wrap items-center gap-2"><label className="flex items-center gap-1.5 text-caption text-muted-foreground"><Bot className="size-3.5"/><select aria-label="Provider" className="max-w-44 rounded border border-border bg-background px-2 py-1 text-caption text-foreground" value={providerForCurrent?.id ?? ""} onChange={(event) => { const selected = providers.find((provider) => provider.id === event.target.value); setProviderId(event.target.value); setModel(selected?.defaultModel ?? ""); if (currentThread && selected) updateThreadMutation.mutate({ id: currentThread.id, input: { providerId: event.target.value, model: selected.defaultModel } }); }}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
          <label className="flex items-center gap-1.5 text-caption text-muted-foreground"><span>Model</span><input aria-label="Model" list="analyst-model-list" className="w-36 rounded border border-border bg-background px-2 py-1 text-caption text-foreground" value={model || currentThread?.model || currentModel} onChange={(event) => setModel(event.target.value)} onBlur={(event) => { const nextModel = event.currentTarget.value.trim(); if (currentThread && nextModel && nextModel !== currentThread.model) updateThreadMutation.mutate({ id: currentThread.id, input: { model: nextModel } }); }} placeholder="Model ID"/><datalist id="analyst-model-list">{[...new Set([...(selectedProvider ? defaultModels(selectedProvider.kind) : []), ...(providerModelsQuery.data?.models ?? [])])].map((item) => <option key={item} value={item}/>)}</datalist></label>
          <label className="flex items-center gap-1.5 text-caption text-muted-foreground"><Database className="size-3.5"/><select aria-label="Database context" className="max-w-56 rounded border border-border bg-background px-2 py-1 text-caption text-foreground" value={databaseId} onChange={(event) => { setDatabaseId(event.target.value); setTableContext(""); }}><option value="">All databases</option>{databases.filter((item) => item.status === "enabled").map((item) => <option value={item.id} key={item.id}>{DB_ENGINES.find((engine) => engine.type === item.type)?.label ?? item.type} · {item.name}</option>)}</select></label>
          {databaseId && <select aria-label="Table context" className="max-w-48 rounded border border-border bg-background px-2 py-1 text-caption text-foreground" value={tableContext} onChange={(event) => setTableContext(event.target.value)}><option value="">All tables</option>{tables.map((table) => <option key={table.id} value={table.label}>{table.label}</option>)}</select>}
          <DropdownMenu open={playbooksOpen} onOpenChange={setPlaybooksOpen}><DropdownMenuTrigger render={<Button type="button" variant="outline" size="xs" disabled={!databaseId}><Sparkles data-icon="inline-start"/>Playbooks</Button>} /><DropdownMenuContent align="start" className="w-72">{playbooksQuery.data?.map((playbook) => <DropdownMenuItem key={playbook.id} onClick={() => { insertPlaybook(playbook, setDraft, databases.find((item) => item.id === databaseId), tableContext); setPlaybooksOpen(false); }}>{playbook.title}<span className="ml-auto pl-2 text-caption text-muted-foreground">↵</span></DropdownMenuItem>) ?? <DropdownMenuItem disabled>Loading playbooks…</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
          {currentThread && <span className="text-caption text-muted-foreground">Provider and model apply to this chat</span>}
        </div>
        <form className="relative rounded-lg border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><Textarea aria-label="Message Analyst" value={draft} onChange={(event) => { setDraft(event.target.value); if (event.target.value === "/") setPlaybooksOpen(true); }} onKeyDown={(event) => { if (event.key === "/" && !draft && !event.shiftKey) { event.preventDefault(); setPlaybooksOpen(true); } if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} placeholder="Ask a question about your data…" rows={2} className="min-h-16 resize-y border-0 bg-transparent pr-20 text-body shadow-none focus-visible:ring-0" disabled={streaming || providers.length === 0} /><div className="absolute bottom-2 right-2 flex items-center gap-2">{streaming ? <Button type="button" variant="outline" size="sm" onClick={() => void stopGeneration()}><CircleStop data-icon="inline-start"/>Stop</Button> : <Button type="submit" size="sm" disabled={!draft.trim() || !providers.length}><Send data-icon="inline-start"/>Send</Button>}</div></form>
        <p className="mt-1.5 text-center text-caption text-muted-foreground">Enter to send · Shift+Enter for a new line. Query results the analyst reads are sent to this provider.</p>
      </div></div>
    </>}
  </section>;

  return <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
    <ResizablePanels id="analyst-workspace" className="h-full" panels={[{ id: "analyst-chats", defaultSize: 24, minSize: 16, maxSize: 36, content: sidebar }, { id: "analyst-chat", defaultSize: 76, minSize: 50, content: main }]} />
    <ProviderDialog open={providerDialog} onOpenChange={setProviderDialog} provider={editingProvider} onEdit={setEditingProvider} onSave={(input) => createProviderMutation.mutate(input)} saving={createProviderMutation.isPending} providers={providers} onDelete={setProviderToDelete} onTest={(item) => analystApi.testProvider(item.id)} />
    <ConfirmDialog open={Boolean(providerToDelete)} onOpenChange={(open) => { if (!open) setProviderToDelete(null); }} title="Delete provider?" description={`“${providerToDelete?.name ?? "Provider"}” will be removed. Existing chats keep their history but can no longer generate replies.`} confirmLabel="Delete provider" pending={removeProviderMutation.isPending} onConfirm={() => { if (providerToDelete) removeProviderMutation.mutate(providerToDelete); }} />
    <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} title="Delete chat?" description={`“${deleteTarget?.title ?? "Chat"}” and its conversation history will be deleted.`} confirmLabel="Delete chat" pending={deleteThreadMutation.isPending} onConfirm={() => { if (deleteTarget) deleteThreadMutation.mutate(deleteTarget); }} />
    {fullScreenResult && <ResultDialog resultId={fullScreenResult} onClose={() => setFullScreenResult(null)} />}
    {fullScreenArtifact && <ArtifactDialog artifactId={fullScreenArtifact} onClose={() => setFullScreenArtifact(null)} />}
  </div>;
}

interface ToolStep { id: string; name: string; args: unknown; status: "running" | "success" | "error"; summary?: string; rowCount?: number; resultId?: string; error?: string; }

function ProviderSetup({ onConfigure }: { onConfigure: () => void }) {
  return <div className="m-auto flex max-w-xl flex-col items-center px-6 py-10 text-center"><div className="mb-4 flex size-14 items-center justify-center rounded-full border border-border bg-surface text-primary"><Sparkles className="size-6"/></div><h2 className="text-title font-semibold">Set up an AI provider</h2><p className="mt-2 text-secondary leading-relaxed text-muted-foreground">Analyst connects to an API key you provide or a local OpenAI-compatible model. Keys are encrypted on this computer.</p><Button className="mt-5" onClick={onConfigure}><Plus data-icon="inline-start"/>Add provider</Button><p className="mt-4 max-w-md text-caption text-muted-foreground">Query results the analyst reads are sent to this provider. Local providers keep data on this computer.</p></div>;
}

function ProviderDialog({ open, onOpenChange, provider, onEdit, onSave, saving, providers, onDelete, onTest }: { open: boolean; onOpenChange: (open: boolean) => void; provider: AnalystProvider | null; onEdit: (provider: AnalystProvider | null) => void; onSave: (input: ProviderInput) => void; saving: boolean; providers: AnalystProvider[]; onDelete: (provider: AnalystProvider) => void; onTest: (provider: AnalystProvider) => Promise<{ success: boolean; message: string; latencyMs: number }> }) {
  const [kind, setKind] = useState<ProviderKind>("anthropic");
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["value"]>("ollama");
  const [baseUrl, setBaseUrl] = useState<string>(PRESETS[0].url);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-5");
  const [testState, setTestState] = useState<{ message: string; success: boolean; latencyMs: number } | null>(null);
  const modelQuery = useQuery({ queryKey: ["analyst", "provider-models", provider?.id], queryFn: () => analystApi.models(provider!.id), enabled: open && Boolean(provider?.id) });
  const testMutation = useMutation({ mutationFn: async () => { if (!provider) throw new Error("Save the provider before testing its connection."); return onTest(provider); }, onSuccess: setTestState, onError: (error) => setTestState({ success: false, message: error.message, latencyMs: 0 }) });
  useEffect(() => {
    if (!open) return;
    setKind(provider?.kind ?? "anthropic"); setName(provider?.name ?? ""); setBaseUrl(provider?.baseUrl ?? PRESETS[0].url); setPreset(provider?.baseUrl === "http://127.0.0.1:1234/v1" ? "lm-studio" : provider?.baseUrl === "https://openrouter.ai/api/v1" ? "openrouter" : provider?.baseUrl && provider.baseUrl !== PRESETS[0].url ? "custom" : "ollama"); setApiKey(""); setModel(provider?.defaultModel ?? "claude-sonnet-4-5"); setTestState(null);
  }, [open, provider]);
  const compatible = kind === "openai-compatible";
  const canKeepCredential = provider?.kind === kind && provider.hasApiKey;
  const canSave = name.trim() && model.trim() && (kind === "openai-compatible" || canKeepCredential || apiKey.trim());
  const canTest = Boolean(provider && (provider.kind === kind) && (!compatible || provider.baseUrl === baseUrl));
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onEdit(null); onOpenChange(next); }}><DialogContent className="max-h-[90vh] max-w-[640px]"><DialogHeader><DialogTitle>{provider ? "Provider settings" : "Add AI provider"}</DialogTitle><DialogDescription>Choose where Analyst sends requests. API keys are encrypted on this computer.</DialogDescription></DialogHeader>
    {providers.length > 0 && <div className="flex flex-wrap gap-2 border-b border-border pb-3">{providers.map((item) => <div key={item.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-caption ${provider?.id === item.id ? "border-primary bg-accent-subtle" : "border-border"}`}><button type="button" onClick={() => onEdit(item)}>{item.name}</button><button type="button" aria-label={`Delete ${item.name}`} className="rounded p-0.5 text-muted-foreground hover:text-danger" onClick={() => onDelete(item)}><X className="size-3"/></button></div>)}<Button variant="outline" size="xs" onClick={() => onEdit(null)}><Plus data-icon="inline-start"/>Add another</Button></div>}
      <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1"><Field label="Provider type"><RadioCards value={kind} onChange={(value) => { setKind(value); setModel(defaultModels(value)[0] ?? ""); setApiKey(""); setTestState(null); }} ariaLabel="Provider type" options={[{ value: "anthropic", title: "Anthropic", description: "Claude API" }, { value: "openai", title: "OpenAI", description: "OpenAI API" }, { value: "openai-compatible", title: "OpenAI-compatible", description: "Local or hosted endpoint" }]} /></Field>
      <Field label="Name" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={compatible ? "Local Ollama" : kind === "openai" ? "OpenAI" : "Anthropic"}/></Field>
      {compatible && <><Field label="Endpoint preset"><select aria-label="Endpoint preset" value={preset} onChange={(event) => { const value = event.target.value as typeof preset; setPreset(value); setBaseUrl(PRESETS.find((item) => item.value === value)?.url ?? ""); setApiKey(""); setTestState(null); }}>{PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field label="Base URL" required description="Enter the OpenAI-compatible API endpoint, including /v1 when required."><Input value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); if (PRESETS.every((item) => item.url !== event.target.value)) setPreset("custom"); setTestState(null); }} placeholder="http://127.0.0.1:11434/v1" /></Field></>}
      <Field label="API key" description={canKeepCredential ? "Leave empty to keep the current key. Keys are encrypted on this computer." : kind === "anthropic" ? "Create an API key in the Anthropic Console. Keys are encrypted on this computer." : kind === "openai" ? "Create an API key in the OpenAI dashboard. Keys are encrypted on this computer." : "Optional for local models; required by some hosted endpoints. Keys are encrypted on this computer."}><PasswordInput value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={canKeepCredential ? "Leave empty to keep current key" : compatible ? "Optional for local endpoints" : "API key"} autoComplete="new-password" /></Field>
       <Field label="Default model" required description="Choose a model or enter a model ID. You can use any model your provider supports."><div className="flex gap-2"><Input list="provider-model-suggestions" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model ID"/><datalist id="provider-model-suggestions">{[...new Set([...defaultModels(kind), ...(modelQuery.data?.models ?? [])])].map((item) => <option key={item} value={item}/>)}</datalist>{provider && <Button type="button" variant="outline" size="sm" onClick={() => void modelQuery.refetch()} disabled={modelQuery.isFetching}>{modelQuery.isFetching ? "Loading…" : "Refresh models"}</Button>}</div></Field>
      <div className="rounded-md border border-border bg-surface p-3 text-caption text-muted-foreground">Query results the analyst reads are sent to this provider. Local providers keep data on this computer.</div>
      {testState && <p role="status" className={`text-secondary ${testState.success ? "text-success" : "text-danger"}`}>{testState.message}{testState.success ? ` · ${testState.latencyMs} ms` : ""}</p>}
    </div><DialogFooter className="flex-row justify-between"><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => testMutation.mutate()} disabled={!canTest || testMutation.isPending}>{testMutation.isPending ? "Testing…" : "Test"}</Button>{provider && <Button type="button" variant="ghost" className="text-danger" onClick={() => onDelete(provider)}><Trash2 data-icon="inline-start"/>Delete</Button>}</div><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={!canSave || saving} onClick={() => onSave({ kind, name: name.trim(), ...(compatible ? { baseUrl: baseUrl.trim() } : { baseUrl: null }), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), defaultModel: model.trim() })}>{saving ? "Saving…" : provider ? "Save changes" : "Add provider"}</Button></div></DialogFooter>
  </DialogContent></Dialog>;
}

function EmptyConversation({ hasThread, database, onPrompt }: { hasThread: boolean; database?: DatabaseConnection; onPrompt: (prompt: string) => void }) {
  const prompts = database ? ["Profile the largest tables", "What does this schema store?", `Find data quality issues in ${database.name}`, `Show daily trends for ${database.name}`] : ["List my connected databases", "What tables are available?", "Profile the largest tables", "Help me explore my data"];
  return <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-6 py-12 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-surface text-primary"><Sparkles className="size-5"/></div><h2 className="text-title font-semibold">{hasThread ? "What would you like to understand?" : "Your data, in conversation"}</h2><p className="mt-2 max-w-md text-secondary leading-relaxed text-muted-foreground">Ask a question, explore a schema, or investigate data quality. Analyst uses read-only database tools.</p><div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">{prompts.map((prompt) => <button key={prompt} type="button" className="rounded-md border border-border bg-surface p-3 text-left text-caption transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onPrompt(prompt)}>{prompt}</button>)}</div></div>;
}

function MessageView({ message, databases, toolResults = new Map() }: { message: AnalystMessage; databases: DatabaseConnection[]; toolResults?: Map<string, Record<string, unknown>> }) {
  const role = message.role;
  const parts = arrayOfRecords(message.content);
  const text = parts.flatMap((part) => part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("\n");
  const tools = role === "assistant" ? parts.filter((part) => part.type === "tool-call").map((part) => { const result = toolResults.get(stringOr(part.toolCallId)); const error = stringOr(result?.error); return { id: stringOr(part.toolCallId), name: stringOr(part.toolName), args: part.args, status: error ? "error" as const : "success" as const, error: error || undefined, resultId: stringOr(result?.resultId) || undefined, rowCount: typeof result?.rowCount === "number" ? result.rowCount : undefined, summary: summaryForStoredTool(result ?? {}) }; }) : [];
  if (role === "tool") return null;
  const user = role === "user";
  return <article className={`flex gap-3 ${user ? "justify-end" : ""}`} aria-label={user ? "You" : "Analyst response"}>{!user && <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary"><Bot className="size-4"/></div>}<div className={`min-w-0 max-w-[min(100%,760px)] space-y-3 ${user ? "rounded-xl bg-accent-subtle px-4 py-3" : "flex-1"}`}>{user ? <p className="whitespace-pre-wrap text-body leading-relaxed">{text}</p> : <>{tools.map((tool) => <ToolStepView key={tool.id} step={tool} databases={databases}/>)}{text && <Markdown text={text}/>}<Usage value={message.usage}/></>}</div></article>;
}

function ToolStepView({ step, databases = [] }: { step: ToolStep; databases?: DatabaseConnection[] }) {
  const [open, setOpen] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const resultQuery = useQuery({ queryKey: ["analyst", "result", step.resultId], queryFn: () => analystApi.result(step.resultId ?? ""), enabled: Boolean(showResult && step.resultId) });
  const args = recordOrEmpty(step.args);
  const database = databases.find((item) => item.id === (args.database_id ?? args.databaseId));
  const sql = typeof args.query === "string" ? args.query : typeof args.sql === "string" ? args.sql : "";
  const label = toolLabel(step, database);
  const csv = resultQuery.data ? [resultQuery.data.columns.map((column) => csvCell(column.name)).join(","), ...resultQuery.data.rows.map((row) => resultQuery.data!.columns.map((column) => csvCell(row[column.name])).join(","))].join("\r\n") : "";
  return <div className={`overflow-hidden rounded-md border ${step.status === "error" ? "border-danger/30 bg-danger-subtle" : "border-border bg-surface"}`}><button type="button" aria-expanded={open} className="flex min-h-8 w-full items-center gap-2 px-2.5 py-1.5 text-left text-caption focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setOpen((value) => !value)}><ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}/><Wrench className={`size-3.5 ${step.status === "error" ? "text-danger" : "text-muted-foreground"}`}/><span className="min-w-0 flex-1 truncate">{label}</span>{step.status === "running" ? <span className="text-muted-foreground">Running…</span> : step.status === "error" ? <span className="text-danger">Failed</span> : <Check className="size-3.5 text-success"/>}</button>
    {open && <div className="space-y-2 border-t border-border p-2.5">{step.summary && <p className={`text-caption ${step.status === "error" ? "text-danger" : "text-muted-foreground"}`}>{step.summary}{step.rowCount !== undefined ? ` · ${step.rowCount.toLocaleString()} rows` : ""}</p>}{step.error && <p className="text-caption text-danger">{step.error}</p>}{sql && <><CodeBlock value={sql}/>{database && <Button variant="outline" size="xs" onClick={() => openSqlEditor(database.id, sql)}><Database data-icon="inline-start"/>Open in SQL editor</Button>}</>}{step.resultId && <div><Button variant="ghost" size="xs" onClick={() => setShowResult((value) => !value)}>{showResult ? "Hide results" : "View results"}</Button>{showResult && <div className="mt-2 h-72 overflow-hidden rounded border border-border">{resultQuery.isLoading ? <div className="p-3"><Skeleton className="h-full w-full"/></div> : resultQuery.isError ? <p role="alert" className="p-3 text-caption text-danger">{resultQuery.error.message}<Button variant="ghost" size="xs" onClick={() => void resultQuery.refetch()}>Retry</Button></p> : resultQuery.data && <div className="flex h-full min-h-0 flex-col"><div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-2 text-caption text-muted-foreground">{resultQuery.data.rowCount.toLocaleString()} rows{resultQuery.data.truncated ? " · truncated" : ""}<span className="flex-1"/><Button variant="ghost" size="icon-xs" aria-label="Copy result as CSV" onClick={() => void navigator.clipboard.writeText(csv).then(() => toast.success("CSV copied")).catch(() => toast.error("Could not copy CSV"))}><Copy/></Button><Button variant="ghost" size="icon-xs" aria-label="Full-screen results" onClick={() => window.dispatchEvent(new CustomEvent("analyst:fullscreen-result", { detail: step.resultId }))}><Maximize2/></Button></div><VirtualDataGrid rows={resultQuery.data.rows} columns={resultQuery.data.columns.map((column) => ({ ...column, dataType: "" }))} onSort={() => undefined} direction="asc"/></div>}</div>}</div>}</div>}
  </div>;
}

function ArtifactCard({ artifact, onExpand }: { artifact: AnalystArtifact; onExpand: () => void }) {
  const [view, setView] = useState<"chart" | "table">(artifact.kind === "table" ? "table" : "chart");
  const data = useQuery({ queryKey: ["analyst", "artifact", artifact.id], queryFn: () => analystApi.artifact(artifact.id) });
  const csv = data.data ? toCsv(data.data.columns.map((column) => column.name), data.data.rows) : "";
  const switchable = artifact.kind === "chart";
  const columns = data.data?.columns.map((column) => ({ ...column, dataType: "" })) ?? [];
  return <section className="overflow-hidden rounded-lg border border-border bg-surface" aria-label={`${artifact.kind} artifact: ${artifact.title}`}>
    <header className="flex min-h-9 items-center gap-2 border-b border-border px-3"><span className="min-w-0 flex-1 truncate text-secondary font-medium">{artifact.title}</span><span className="text-caption capitalize text-muted-foreground">{view}</span>{switchable && <Button variant="ghost" size="xs" onClick={() => setView((current) => current === "chart" ? "table" : "chart")}><Table2 data-icon="inline-start"/>{view === "chart" ? "Table" : "Chart"}</Button>}<Button variant="ghost" size="icon-xs" aria-label="Copy artifact data as CSV" disabled={!data.data} onClick={() => void navigator.clipboard.writeText(csv).then(() => toast.success("CSV copied")).catch(() => toast.error("Could not copy CSV"))}><Copy/></Button><Button variant="ghost" size="icon-xs" aria-label="Expand artifact" onClick={onExpand}><Maximize2/></Button></header>
    {data.isLoading ? <div className="space-y-2 p-4" role="status" aria-label="Loading artifact"><Skeleton className="h-5 w-40"/><Skeleton className="h-56 w-full"/></div> : data.isError ? <div className="p-3 text-caption text-danger" role="alert">{data.error.message}<Button variant="ghost" size="xs" onClick={() => void data.refetch()}>Retry</Button></div> : data.data && <><div className="min-h-[150px] p-2">{view === "chart" && artifact.kind === "chart" ? <Suspense fallback={<Skeleton className="h-64 w-full"/>}><ChartRenderer rows={data.data.rows} spec={data.data.artifact.spec}/></Suspense> : <div className="h-[280px] overflow-hidden rounded border border-border"><VirtualDataGrid rows={data.data.rows} columns={columns} onSort={() => undefined} direction="asc"/></div>}</div>{data.data.truncated && <p role="status" className="border-t border-warning/30 bg-warning-subtle px-3 py-1.5 text-caption text-warning">Data truncated. The artifact snapshot may not include every source row.</p>}</>}
  </section>;
}

function ArtifactDialog({ artifactId, onClose }: { artifactId: string; onClose: () => void }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const data = useQuery({ queryKey: ["analyst", "artifact", artifactId], queryFn: () => analystApi.artifact(artifactId) });
  const csv = data.data ? toCsv(data.data.columns.map((column) => column.name), data.data.rows) : "";
  const artifact = data.data?.artifact;
  const visibleView = artifact?.kind === "table" ? "table" : view;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="h-[88vh] max-h-[88vh] max-w-[min(94vw,1440px)]"><DialogHeader><DialogTitle>{artifact?.title ?? "Artifact"}</DialogTitle><DialogDescription>{data.data ? `${data.data.rows.length.toLocaleString()} rows${data.data.truncated ? " · truncated" : ""}` : "Full-size analyst artifact"}</DialogDescription></DialogHeader><div className="flex min-h-0 flex-1 flex-col">{artifact?.kind === "chart" && <div className="flex gap-2 pb-2"><Button variant={visibleView === "chart" ? "secondary" : "outline"} size="xs" onClick={() => setView("chart")}>Chart</Button><Button variant={visibleView === "table" ? "secondary" : "outline"} size="xs" onClick={() => setView("table")}>Table</Button><span className="flex-1"/><Button variant="outline" size="xs" onClick={() => { const svg = document.querySelector<SVGSVGElement>("[data-artifact-chart] svg"); if (!svg) return; const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }); downloadBlob(blob, "analyst-chart.svg"); }}>Export SVG</Button></div>}{data.isLoading ? <Skeleton className="min-h-64 w-full"/> : data.isError ? <p role="alert" className="text-danger">{data.error.message}<Button variant="ghost" size="xs" onClick={() => void data.refetch()}>Retry</Button></p> : data.data && (visibleView === "chart" && artifact?.kind === "chart" ? <div data-artifact-chart className="min-h-0 flex-1"><Suspense fallback={<Skeleton className="h-full w-full"/>}><ChartRenderer large rows={data.data.rows} spec={artifact.spec}/></Suspense></div> : <div className="min-h-0 flex-1 overflow-hidden"><VirtualDataGrid rows={data.data.rows} columns={data.data.columns.map((column) => ({ ...column, dataType: "" }))} onSort={() => undefined} direction="asc"/></div>)}{data.data?.truncated && <p role="status" className="mt-2 text-caption text-warning">Data truncated. The artifact snapshot may not include every source row.</p>}</div><DialogFooter>{data.data && <Button variant="outline" onClick={() => void navigator.clipboard.writeText(csv).then(() => toast.success("CSV copied")).catch(() => toast.error("Could not copy CSV"))}><Copy data-icon="inline-start"/>Copy CSV</Button>}<Button variant="outline" onClick={onClose}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function Markdown({ text }: { text: string }) { return <div className="analyst-markdown min-w-0 text-body leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}/>; }
function Usage({ value }: { value: unknown }) { const record = recordOrEmpty(value); if (typeof record.inputTokens !== "number" || typeof record.outputTokens !== "number") return null; return <p className="text-caption text-muted-foreground">{record.inputTokens.toLocaleString()} input · {record.outputTokens.toLocaleString()} output tokens</p>; }

function ResultDialog({ resultId, onClose }: { resultId: string; onClose: () => void }) {
  const result = useQuery({ queryKey: ["analyst", "result", resultId], queryFn: () => analystApi.result(resultId) });
  const csv = result.data ? toCsv(result.data.columns.map((column) => column.name), result.data.rows) : "";
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="h-[88vh] max-h-[88vh] max-w-[min(94vw,1440px)]"><DialogHeader><DialogTitle>Query results</DialogTitle><DialogDescription>{result.data ? `${result.data.rowCount.toLocaleString()} rows${result.data.truncated ? " · truncated" : ""}` : "Full query result"}</DialogDescription></DialogHeader>{result.isLoading ? <Skeleton className="min-h-64 w-full"/> : result.isError ? <p role="alert" className="text-danger">{result.error.message}</p> : result.data && <VirtualDataGrid rows={result.data.rows} columns={result.data.columns.map((column) => ({ ...column, dataType: "" }))} onSort={() => undefined} direction="asc"/>}<DialogFooter>{result.data && <Button variant="outline" onClick={() => void navigator.clipboard.writeText(csv).then(() => toast.success("CSV copied")).catch(() => toast.error("Could not copy CSV"))}><Copy data-icon="inline-start"/>Copy CSV</Button>}<Button variant="outline" onClick={onClose}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function groupThreads(threads: AnalystThread[]): [string, AnalystThread[]][] {
  const today: AnalystThread[] = []; const previous: AnalystThread[] = []; const older: AnalystThread[] = [];
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0); const weekAgo = new Date(startToday); weekAgo.setDate(startToday.getDate() - 7);
  for (const thread of threads) { const date = new Date(thread.updatedAt); if (date >= startToday) today.push(thread); else if (date >= weekAgo) previous.push(thread); else older.push(thread); }
  return [["Today", today], ["Previous 7 days", previous], ["Older", older]];
}
function arrayOfRecords(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : []; }
function toolResultsAfter(message: AnalystMessage, next?: AnalystMessage): Map<string, Record<string, unknown>> {
  const results = new Map<string, Record<string, unknown>>();
  if (message.role !== "assistant" || next?.role !== "tool") return results;
  for (const part of arrayOfRecords(next.content)) if (part.type === "tool-result" && typeof part.toolCallId === "string") results.set(part.toolCallId, recordOrEmpty(part.result));
  return results;
}
function recordOrEmpty(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringOr(value: unknown): string { return typeof value === "string" ? value : ""; }
function summaryForStoredTool(result: Record<string, unknown>): string { if (typeof result.hint === "string") return result.hint; if (typeof result.rowCount === "number") return `Query returned ${result.rowCount.toLocaleString()} rows`; return "Tool completed"; }
function toolLabel(step: ToolStep, database?: DatabaseConnection): string {
  switch (step.name) {
    case "list_databases": return "Listed databases";
    case "get_database_schema": return `Read schema${database ? ` of ${database.name}` : ""}`;
    case "get_table_schema": return `Read schema of ${stringOr(recordOrEmpty(step.args).table) || "table"}`;
    case "run_query": return `Ran query${database ? ` on ${database.name}` : ""}${step.rowCount !== undefined ? ` · ${step.rowCount} rows` : ""}`;
    case "sample_rows": return `Sampled ${stringOr(recordOrEmpty(step.args).table) || "table"}`;
    default: return step.name.replaceAll("_", " ");
  }
}
function defaultModels(kind: ProviderKind): string[] { if (kind === "anthropic") return ["claude-sonnet-4-5", "claude-haiku-4-5"]; if (kind === "openai") return ["gpt-4.1", "gpt-4.1-mini", "o4-mini"]; return ["llama3.2", "qwen2.5", "gpt-4o-mini"]; }
function csvCell(value: unknown): string { const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value); return `"${(text ?? "").replaceAll('"', '""')}"`; }
function toCsv(columns: string[], rows: Record<string, unknown>[]): string { return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n"); }
function downloadBlob(blob: Blob, filename: string): void { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function insertPlaybook(playbook: AnalystPlaybook, setDraft: (value: string) => void, database: DatabaseConnection | undefined, table: string): void {
  const prompt = playbook.promptTemplate.replaceAll("{database}", database?.name ?? "the selected database").replaceAll("{table}", table || "a relevant table");
  setDraft(prompt);
}
function openSqlEditor(databaseId: string, sql: string) { sessionStorage.setItem("dbmcp.analyst.openQuery", JSON.stringify({ databaseId, sql })); window.location.assign(`/connections/${encodeURIComponent(databaseId)}?analystQuery=1`); }
