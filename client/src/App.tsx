import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FolderOpen, RotateCw, Server } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { platform } from "@/platform";
import { useRestartServer, useServerInfo, useSettings } from "@/platform/hooks";
import { useUpdateSettings } from "@/platform/hooks";
import { databaseApi } from "@/features/databases/api/databaseApi";
import type { ServerState } from "@/platform/types";

const DatabaseListPage = lazy(() => import("@/pages/DatabaseListPage").then((module) => ({ default: module.DatabaseListPage })));
const DatabaseFormPage = lazy(() => import("@/pages/DatabaseFormPage").then((module) => ({ default: module.DatabaseFormPage })));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage").then((module) => ({ default: module.OnboardingPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const AiClientsPage = lazy(() => import("@/pages/AiClientsPage").then((module) => ({ default: module.AiClientsPage })));
const ActivityPage = lazy(() => import("@/pages/ActivityPage").then((module) => ({ default: module.ActivityPage })));
const ConnectionDetailPage = lazy(() => import("@/pages/ConnectionDetailPage").then((module) => ({ default: module.ConnectionDetailPage })));

function ServerStateGate() {
  const { data: serverInfo, isLoading } = useServerInfo();
  const restart = useRestartServer();
  const { data: settings } = useSettings();
  const [logs, setLogs] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (serverInfo?.state === "failed") void platform.readServerLogs(200).then(setLogs);
  }, [serverInfo?.state]);

  if (isLoading || !serverInfo) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="w-full max-w-sm space-y-3 p-8" role="status" aria-label="Starting local server"><Skeleton className="h-5 w-48" /><Skeleton className="h-3 w-64" /><Skeleton className="h-1 w-full" /><p className="text-sm text-muted-foreground">Starting local server…</p></div></div>;
  if (serverInfo.state === "starting") return <div className="flex min-h-screen items-center justify-center bg-background"><div className="w-full max-w-sm space-y-3 p-8" role="status" aria-label="Starting local server"><Skeleton className="h-5 w-48" /><Skeleton className="h-3 w-64" /><div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" /></div><p className="text-sm text-muted-foreground">Starting local server…</p></div></div>;
  if (serverInfo.state === "healthy" || serverInfo.state === "unhealthy" || serverInfo.state === "restarting") return <Outlet />;
  if (location.pathname === "/settings") return <Outlet />;
  const stateCopy: Record<Extract<ServerState, "port_in_use" | "failed" | "stopped">, { title: string; description: string }> = {
    port_in_use: { title: "Port already in use", description: `Another process is using port ${serverInfo.port}. Change the port in Settings, then restart the local server.` },
    failed: { title: "Local server failed to start", description: serverInfo.lastError ?? "The local server could not start. Review the recent logs and try again." },
    stopped: { title: "Local server is stopped", description: "Start the local server to manage connections and provide database access to your AI clients." },
  };
  const state = serverInfo.state;
  const { title, description } = stateCopy[state];

  return <main className="flex h-full items-center justify-center overflow-auto bg-background px-6 py-8"><section className="w-full max-w-xl rounded-lg border border-border bg-card p-6">
    <div className="mb-4 flex size-9 items-center justify-center rounded-md bg-danger-subtle text-danger"><AlertTriangle className="size-4" /></div>
    <h1 className="text-[15px] font-semibold">{title}</h1><p className="mt-1 mb-4 text-[12px] text-muted-foreground">{description}</p>
    {state === "failed" && <div className="mb-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-[12px] font-semibold">Recent server logs</h2><Button variant="ghost" size="sm" onClick={() => void platform.readServerLogs(200).then(setLogs)}>Refresh logs</Button></div><pre data-selectable="true" className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-[11px] leading-5 text-muted-foreground">{logs.length ? logs.slice(-200).join("\n") : "Select Refresh logs to load recent output."}</pre></div>}
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => restart.mutate()} disabled={restart.isPending}><RotateCw data-icon="inline-start" />Restart server</Button>
      {state === "failed" && <Button variant="outline" onClick={() => void platform.openLogsDir()}><FolderOpen data-icon="inline-start" />Open logs folder</Button>}
      {state === "port_in_use" && <Button variant="outline" onClick={() => navigate("/settings")}><Server data-icon="inline-start" />Open Settings</Button>}
    </div>
    {settings?.port !== undefined && state === "port_in_use" && <p className="mt-4 text-xs text-muted-foreground">Current port: <code className="font-mono">{settings.port}</code></p>}
  </section></main>;
}

export function App() {
  return <BrowserRouter><Routes>
    <Route element={<ServerStateGate />}>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route element={<OnboardingGate />}>
          <Route path="/onboarding" element={<LazyPage><OnboardingPage /></LazyPage>} />
          <Route path="/connections" element={<LazyPage><DatabaseListPage /></LazyPage>} />
          <Route path="/connections/new" element={<LazyPage><DatabaseFormPage /></LazyPage>} />
          <Route path="/connections/:id/edit" element={<LazyPage><DatabaseFormPage /></LazyPage>} />
          <Route path="/connections/:id" element={<LazyPage><ConnectionDetailPage /></LazyPage>} />
          <Route path="/ai-clients" element={<LazyPage><AiClientsPage /></LazyPage>} />
          <Route path="/activity" element={<LazyPage><ActivityPage /></LazyPage>} />
          <Route path="/settings" element={<LazyPage><SettingsPage /></LazyPage>} />
        </Route>
        <Route path="*" element={<Navigate to="/connections" replace />} />
      </Route>
    </Route>
  </Routes></BrowserRouter>;
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-7" role="status" aria-label="Loading page"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-80" /><Skeleton className="mt-4 h-64 w-full" /></div>}>{children}</Suspense>;
}

function HomeRedirect() {
  const { data: settings } = useSettings();
  if (!settings) return <div className="p-8"><Skeleton className="h-8 w-40" /></div>;
  return <Navigate to="/connections" replace />;
}

function OnboardingGate() {
  const { data: settings } = useSettings();
  const location = useLocation();
  const connections = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list, enabled: settings !== undefined && !settings.onboardingCompleted });
  const updateSettings = useUpdateSettings();
  useEffect(() => {
    if (settings && !settings.onboardingCompleted && connections.data?.length) updateSettings.mutate({ onboardingCompleted: true });
  }, [connections.data, settings?.onboardingCompleted, updateSettings.mutate]);
  if (!settings) return <div className="p-8"><Skeleton className="h-8 w-40" /></div>;
  if (settings.onboardingCompleted) return location.pathname === "/onboarding" ? <Navigate to="/connections" replace /> : <Outlet />;
  if (connections.data?.length) return location.pathname === "/onboarding" ? <Navigate to="/connections" replace /> : <Outlet />;
  if (connections.isLoading) return <div className="flex h-full items-center justify-center" role="status" aria-label="Checking local setup"><Skeleton className="h-4 w-40" /></div>;
  if (connections.isError) return <Outlet />;
  return location.pathname === "/onboarding" ? <Outlet /> : <Navigate to="/onboarding" replace />;
}
