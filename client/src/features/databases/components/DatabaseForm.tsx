import React from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import {
  Pin, Globe, Lock, Tag,
  Eye, EyeOff, CheckCircle2, AlertTriangle,
  ShieldCheck, Zap, Check, Copy, Terminal,
} from "@/components/ui/Icons";
import { ConnectionStringParser } from "./ConnectionStringParser";
import { PresetSelector } from "./PresetSelector";
import { DB_ENGINES } from "../types";
import { useDatabaseForm } from "../hooks/useDatabaseForm";

export function DatabaseForm() {
  const {
    isEdit, form, fieldErrors, currentEngine,
    loading, saving, showPassword, setShowPassword,
    error, testing, testResult, copiedUri, generatedUri,
    handleChange, handleEngineChange, handleAutoFill,
    handleSubmit, handleTest, copyUriToClipboard,
  } = useDatabaseForm();

  if (loading) {
    return (
      <PageLayout maxWidth="4xl">
        <Spinner label="Loading connection details…" />
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="4xl">
      <Header
        title={isEdit ? "Edit Connection" : "Add Database Connection"}
        subtitle="Credentials are encrypted with AES-256 before saving and never shared in plain text."
        backTo="/databases"
      />

      <div className="space-y-4 mb-6">
        <ConnectionStringParser onParse={handleAutoFill} />
        <PresetSelector onSelectPreset={handleAutoFill} />

        {/* Live URI preview */}
        <div className="rounded-xl border border-border bg-card/80 p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Live URI Preview</span>
              <p className="text-xs font-mono text-foreground truncate mt-0.5">{generatedUri}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={copyUriToClipboard}
            className="text-xs shrink-0 self-start sm:self-auto gap-1 text-muted-foreground hover:text-foreground">
            {copiedUri ? (
              <><Check className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500">Copied</span></>
            ) : (
              <><Copy className="w-3.5 h-3.5" /><span>Copy URI</span></>
            )}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 pb-32 sm:pb-24">
        {error && <Alert variant="destructive">{error}</Alert>}

        {/* 1. Engine & Name */}
        <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden hover:border-border transition-colors">
          <div className="border-b border-border/60 bg-muted/20 px-5 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Pin className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">1. Engine & Identification</h3>
                <p className="text-xs text-muted-foreground">Specify connection alias and pick your database engine</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] bg-background">Required</Badge>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {/* Engine picker — add new engines to DB_ENGINES in types/index.ts */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Database Engine <span className="text-destructive">*</span>
              </label>
              <Select value={form.type} onValueChange={(val) => handleEngineChange(val as typeof form.type)}>
                <SelectTrigger className="h-10">
                  <SelectValue>
                    <div className="flex items-center gap-2.5">
                      <DbEngineIcon type={form.type} className="w-5 h-5 object-contain" />
                      <span className="font-medium">{currentEngine.label}</span>
                      <span className="text-muted-foreground text-xs">{currentEngine.hint}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DB_ENGINES.map((engine) => (
                    <SelectItem key={engine.type} value={engine.type}>
                      <div className="flex items-center gap-2.5 py-0.5">
                        <DbEngineIcon type={engine.type} className="w-5 h-5 object-contain shrink-0" />
                        <div>
                          <p className="font-medium text-foreground text-sm">{engine.label}</p>
                          <p className="text-xs text-muted-foreground">{engine.hint}</p>
                        </div>
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono">{engine.badge}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Connection Display Name <span className="text-destructive">*</span>
              </label>
              <Input id="name" type="text" placeholder="e.g. Payments Staging, Main Analytics DB"
                value={form.name} aria-invalid={Boolean(fieldErrors.name)}
                onChange={(e) => handleChange("name", e.target.value)} className="text-sm font-medium" />
              <p className="text-xs text-muted-foreground">A human-readable identifier for your AI workspace agent.</p>
              {fieldErrors.name && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.name}</p>}
            </div>
          </div>
        </Card>

        {/* 2. Location — file path for file-based engines, host/port/db for network engines */}
        {!currentEngine.requiresNetwork ? (
          <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden hover:border-border transition-colors">
            <div className="border-b border-border/60 bg-muted/20 px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">2. Database File Path</h3>
                <p className="text-xs text-muted-foreground">Absolute path to the .sqlite file, or :memory:</p>
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-1.5">
              <label htmlFor="databaseName" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                File Path <span className="text-destructive">*</span>
              </label>
              <Input id="databaseName" type="text" placeholder="/absolute/path/to/db.sqlite or :memory:"
                value={form.databaseName} aria-invalid={Boolean(fieldErrors.databaseName)}
                onChange={(e) => handleChange("databaseName", e.target.value)} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Use an absolute path. The gateway process must have read access to this file.</p>
              {fieldErrors.databaseName && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.databaseName}</p>}
            </div>
          </Card>
        ) : (
          <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden hover:border-border transition-colors">
            <div className="border-b border-border/60 bg-muted/20 px-5 py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">2. Server Host & Database</h3>
                  <p className="text-xs text-muted-foreground">Network address and database instance name</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] bg-background">Required</Badge>
            </div>
            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="host" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Host <span className="text-destructive">*</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground mr-0.5">Shortcuts:</span>
                      {["localhost", "host.docker.internal", "127.0.0.1"].map((h) => (
                        <button key={h} type="button" onClick={() => handleChange("host", h)}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors border border-border/60">
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input id="host" type="text" placeholder="localhost or ep-cool.neon.tech"
                    value={form.host} aria-invalid={Boolean(fieldErrors.host)}
                    onChange={(e) => handleChange("host", e.target.value)} className="font-mono text-xs" />
                  {fieldErrors.host && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.host}</p>}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="port" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Port <span className="text-destructive">*</span>
                    </label>
                    <button type="button" onClick={() => handleChange("port", currentEngine.defaultPort)}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors border border-border/60">
                      Default ({currentEngine.defaultPort})
                    </button>
                  </div>
                  <Input id="port" type="number" min={1} max={65535}
                    value={form.port} aria-invalid={Boolean(fieldErrors.port)}
                    onChange={(e) => handleChange("port", e.target.value)} className="font-mono text-xs" />
                  {fieldErrors.port && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.port}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="databaseName" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Database Name <span className="text-destructive">*</span>
                </label>
                <Input id="databaseName" type="text" placeholder="e.g. postgres, myapp_production"
                  value={form.databaseName} aria-invalid={Boolean(fieldErrors.databaseName)}
                  onChange={(e) => handleChange("databaseName", e.target.value)} className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground">The specific database instance on the target server.</p>
                {fieldErrors.databaseName && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.databaseName}</p>}
              </div>
            </div>
          </Card>
        )}

        {/* 3. Credentials — hidden for file-based engines */}
        {currentEngine.requiresNetwork && (
          <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden hover:border-border transition-colors">
            <div className="border-b border-border/60 bg-muted/20 px-5 py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">3. Credentials & SSL</h3>
                  <p className="text-xs text-muted-foreground">Encrypted securely with AES-256 before storage</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] bg-background">Required</Badge>
            </div>
            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Username <span className="text-destructive">*</span>
                  </label>
                  <Input id="username" type="text" placeholder="e.g. postgres, root, or read_only_user"
                    autoComplete="username" value={form.username} aria-invalid={Boolean(fieldErrors.username)}
                    onChange={(e) => handleChange("username", e.target.value)} className="font-mono text-xs" />
                  {fieldErrors.username && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.username}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Password{!isEdit && <span className="text-destructive ml-0.5">*</span>}
                    {isEdit && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(leave empty to keep unchanged)</span>}
                  </label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                      placeholder={isEdit ? "••••••••" : "Enter password"} value={form.password || ""}
                      aria-invalid={Boolean(fieldErrors.password)}
                      onChange={(e) => handleChange("password", e.target.value)} className="pr-10 font-mono text-xs" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.password}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/60">
                <div className="space-y-0.5">
                  <label htmlFor="ssl" className="text-sm font-semibold text-foreground cursor-pointer flex items-center gap-2">
                    <span>Require SSL Connection</span>
                    {form.ssl && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Encrypted</Badge>
                    )}
                  </label>
                  <p className="text-xs text-muted-foreground">Off for local / Docker. Required for Supabase, Neon, AWS RDS, PlanetScale.</p>
                </div>
                <Switch id="ssl" checked={Boolean(form.ssl)} onCheckedChange={(checked) => handleChange("ssl", checked)} />
              </div>
            </div>
          </Card>
        )}

        {/* 4. Labels */}
        <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden hover:border-border transition-colors">
          <div className="border-b border-border/60 bg-muted/20 px-5 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">4. Service & Environment Tags</h3>
                <p className="text-xs text-muted-foreground">Organize and filter connections across services</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">Optional</Badge>
          </div>
          <div className="p-5 sm:p-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="serviceName" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Service Tag</label>
              <Input id="serviceName" type="text" placeholder="e.g. billing-service, auth-api"
                value={form.serviceName || ""} onChange={(e) => handleChange("serviceName", e.target.value)} />
              {fieldErrors.serviceName && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.serviceName}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="environment" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Environment Tag</label>
                <div className="flex items-center gap-1">
                  {["production", "staging", "development", "local"].map((env) => (
                    <button key={env} type="button" onClick={() => handleChange("environment", env)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors border border-border/60 capitalize">
                      {env}
                    </button>
                  ))}
                </div>
              </div>
              <Input id="environment" type="text" placeholder="e.g. production, staging, local"
                value={form.environment || ""} onChange={(e) => handleChange("environment", e.target.value)} />
              {fieldErrors.environment && <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.environment}</p>}
            </div>
          </div>
        </Card>

        {/* Live test panel (edit mode only) */}
        {isEdit && (
          <Card className="p-5 border-primary/30 bg-linear-to-br from-primary/5 via-background to-accent/20 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex-1 min-w-50">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span>Verify Live Connectivity</span>
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">Test database connection health and credentials right now</p>
              </div>
              <Button type="button" variant="default" size="sm" disabled={testing} onClick={handleTest} className="shrink-0">
                {testing ? "Testing Connection..." : "Test Connection"}
              </Button>
            </div>
            {testResult && (
              <div className={`mt-4 px-4 py-3 rounded-xl text-xs font-medium border ${
                testResult.success
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : "bg-destructive/10 text-destructive border-destructive/30"
              }`}>
                <div className="flex items-start gap-2.5">
                  {testResult.success
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
                  <div className="space-y-1">
                    <p className="font-semibold">{testResult.message}</p>
                    {!testResult.success && testResult.message.includes("ECONNREFUSED") && (
                      <p className="text-[11px] font-normal leading-relaxed opacity-90">
                        💡 Inside Docker, use <code className="font-mono bg-destructive/10 px-1 rounded">host.docker.internal</code>. Uncheck SSL for local databases.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Sticky footer */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-t border-border/80 py-3.5 px-4 sm:px-6 shadow-2xl">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Encrypted & secure. AI agents receive read-only query access.</span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Link to="/databases" className="flex-1 sm:flex-none">
                <Button type="button" variant="secondary" size="sm" className="w-full sm:w-auto px-5">Cancel</Button>
              </Link>
              <Button type="submit" variant="default" size="sm" disabled={saving}
                className="px-6 font-semibold shadow-md hover:shadow-lg flex-1 sm:flex-none gap-2">
                {saving ? (
                  <><Spinner label="" className="w-3.5 h-3.5 border-2" /><span>Saving...</span></>
                ) : (
                  <span>{isEdit ? "Save Changes" : "Create Connection"}</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </PageLayout>
  );
}
