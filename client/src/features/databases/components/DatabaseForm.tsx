import { Link } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
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
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] flex items-center justify-center shrink-0 text-[#4D4D4D]">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs text-[#737373] block">Live URI Preview</span>
              <p className="text-xs font-mono text-[#0A0A0A] truncate mt-0.5">{generatedUri}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyUriToClipboard}
            className="text-xs shrink-0 self-start sm:self-auto gap-1.5 border-[#EEEEEE] text-[#4D4D4D]"
          >
            {copiedUri ? (
              <><Check className="w-3.5 h-3.5 text-[#22C55E]" /><span className="text-[#15803D]">Copied</span></>
            ) : (
              <><Copy className="w-3.5 h-3.5" /><span>Copy URI</span></>
            )}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-32 sm:pb-24">
        {error && <Alert variant="destructive">{error}</Alert>}

        {/* 1. Engine & Name */}
        <Card className="rounded-[14px] border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden p-0">
          <div className="border-b border-[#EEEEEE] bg-white px-6 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#0A0A0A] flex items-center justify-center shrink-0">
                <Pin className="w-4 h-4 text-[#4D4D4D]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#0A0A0A]">1. Engine & Identification</h3>
                <p className="text-xs text-[#737373]">Specify connection name and select database engine</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-[#EEEEEE] text-[#737373]">Required</Badge>
          </div>

          <div className="p-6 space-y-5">
            {/* Engine picker */}
            <div className="space-y-1.5">
              <label className="block text-xs text-[#737373] uppercase tracking-wider">
                Database Engine <span className="text-[#D64545]">*</span>
              </label>
              <Select value={form.type} onValueChange={(val) => handleEngineChange(val as typeof form.type)}>
                <SelectTrigger className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white text-xs text-[#0A0A0A]">
                  <SelectValue>
                    <div className="flex items-center gap-2.5">
                      <DbEngineIcon type={form.type} className="w-4 h-4 object-contain" />
                      <span className="font-medium">{currentEngine.label}</span>
                      <span className="text-[#737373] text-xs">{currentEngine.hint}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-[10px] border-[#EEEEEE] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.1)]">
                  {DB_ENGINES.map((engine) => (
                    <SelectItem key={engine.type} value={engine.type} className="rounded-[6px]">
                      <div className="flex items-center gap-2.5 py-1">
                        <DbEngineIcon type={engine.type} className="w-4 h-4 object-contain shrink-0" />
                        <div>
                          <p className="font-medium text-[#0A0A0A] text-xs">{engine.label}</p>
                          <p className="text-[11px] text-[#737373]">{engine.hint}</p>
                        </div>
                        <span className="ml-auto text-[10px] text-[#999999] font-mono">{engine.badge}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs text-[#737373] uppercase tracking-wider">
                Connection Name <span className="text-[#D64545]">*</span>
              </label>
              <Input
                id="name"
                type="text"
                placeholder="e.g. Payments Staging, Main Analytics DB"
                value={form.name}
                aria-invalid={Boolean(fieldErrors.name)}
                onChange={(e) => handleChange("name", e.target.value)}
                className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white text-xs text-[#0A0A0A]"
              />
              <p className="text-xs text-[#737373]">A human-readable label for AI workspace assistants.</p>
              {fieldErrors.name && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.name}</p>}
            </div>
          </div>
        </Card>

        {/* 2. Location */}
        {!currentEngine.requiresNetwork ? (
          <Card className="rounded-[14px] border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden p-0">
            <div className="border-b border-[#EEEEEE] bg-white px-6 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#0A0A0A] flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-[#4D4D4D]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#0A0A0A]">2. Database File Path</h3>
                <p className="text-xs text-[#737373]">Absolute path to the .sqlite file, or :memory:</p>
              </div>
            </div>
            <div className="p-6 space-y-1.5">
              <label htmlFor="databaseName" className="block text-xs text-[#737373] uppercase tracking-wider">
                File Path <span className="text-[#D64545]">*</span>
              </label>
              <Input
                id="databaseName"
                type="text"
                placeholder="/absolute/path/to/db.sqlite or :memory:"
                value={form.databaseName}
                aria-invalid={Boolean(fieldErrors.databaseName)}
                onChange={(e) => handleChange("databaseName", e.target.value)}
                className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white font-mono text-xs text-[#0A0A0A]"
              />
              <p className="text-xs text-[#737373]">The gateway process requires read access to this path.</p>
              {fieldErrors.databaseName && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.databaseName}</p>}
            </div>
          </Card>
        ) : (
          <Card className="rounded-[14px] border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden p-0">
            <div className="border-b border-[#EEEEEE] bg-white px-6 py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#0A0A0A] flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-[#4D4D4D]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#0A0A0A]">2. Server Host & Database</h3>
                  <p className="text-xs text-[#737373]">Network address and target database name</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-[#EEEEEE] text-[#737373]">Required</Badge>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="host" className="block text-xs text-[#737373] uppercase tracking-wider">
                      Host <span className="text-[#D64545]">*</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#999999] mr-0.5">Shortcuts:</span>
                      {["localhost", "host.docker.internal", "127.0.0.1"].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => handleChange("host", h)}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] bg-[#F8F8F8] hover:bg-[#EEEEEE] text-[#4D4D4D] border border-[#EEEEEE] cursor-pointer"
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    id="host"
                    type="text"
                    placeholder="localhost or ep-cool.neon.tech"
                    value={form.host}
                    aria-invalid={Boolean(fieldErrors.host)}
                    onChange={(e) => handleChange("host", e.target.value)}
                    className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white font-mono text-xs text-[#0A0A0A]"
                  />
                  {fieldErrors.host && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.host}</p>}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="port" className="block text-xs text-[#737373] uppercase tracking-wider">
                      Port <span className="text-[#D64545]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleChange("port", currentEngine.defaultPort)}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] bg-[#F8F8F8] hover:bg-[#EEEEEE] text-[#4D4D4D] border border-[#EEEEEE] cursor-pointer"
                    >
                      Default ({currentEngine.defaultPort})
                    </button>
                  </div>
                  <Input
                    id="port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.port}
                    aria-invalid={Boolean(fieldErrors.port)}
                    onChange={(e) => handleChange("port", e.target.value)}
                    className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white font-mono text-xs text-[#0A0A0A]"
                  />
                  {fieldErrors.port && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.port}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="databaseName" className="block text-xs text-[#737373] uppercase tracking-wider">
                  Database Name <span className="text-[#999999] normal-case tracking-normal">(optional)</span>
                </label>
                <Input
                  id="databaseName"
                  type="text"
                  placeholder="Leave blank to use every database this login can access"
                  value={form.databaseName}
                  aria-invalid={Boolean(fieldErrors.databaseName)}
                  onChange={(e) => handleChange("databaseName", e.target.value)}
                  className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white font-mono text-xs text-[#0A0A0A]"
                />
                <p className="text-xs text-[#737373]">
                  Leave this empty when the username can see more than one database. Set it to pin queries to a single database.
                </p>
                {fieldErrors.databaseName && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.databaseName}</p>}
              </div>
            </div>
          </Card>
        )}

        {/* 3. Credentials */}
        {currentEngine.requiresNetwork && (
          <Card className="rounded-[14px] border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden p-0">
            <div className="border-b border-[#EEEEEE] bg-white px-6 py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#0A0A0A] flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-[#4D4D4D]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#0A0A0A]">3. Credentials & SSL</h3>
                  <p className="text-xs text-[#737373]">Encrypted securely with AES-256 before storage</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-[#EEEEEE] text-[#737373]">Required</Badge>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="block text-xs text-[#737373] uppercase tracking-wider">
                    Username <span className="text-[#D64545]">*</span>
                  </label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="e.g. postgres, root, or read_only_user"
                    autoComplete="username"
                    value={form.username}
                    aria-invalid={Boolean(fieldErrors.username)}
                    onChange={(e) => handleChange("username", e.target.value)}
                    className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white font-mono text-xs text-[#0A0A0A]"
                  />
                  {fieldErrors.username && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.username}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs text-[#737373] uppercase tracking-wider">
                    Password{!isEdit && <span className="text-[#D64545] ml-0.5">*</span>}
                    {isEdit && <span className="ml-2 text-xs font-normal text-[#999999]">(leave empty to keep unchanged)</span>}
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={isEdit ? "••••••••" : "Enter password"}
                      value={form.password || ""}
                      aria-invalid={Boolean(fieldErrors.password)}
                      onChange={(e) => handleChange("password", e.target.value)}
                      className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white pr-10 font-mono text-xs text-[#0A0A0A]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#737373] hover:text-[#0A0A0A] transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.password}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA]">
                <div className="space-y-0.5">
                  <label htmlFor="ssl" className="text-xs font-medium text-[#0A0A0A] cursor-pointer flex items-center gap-2">
                    <span>Require SSL Connection</span>
                    {form.ssl && (
                      <Badge variant="accent" className="text-xs">
                        {currentEngine.sslRequired ? "Required" : "Encrypted"}
                      </Badge>
                    )}
                  </label>
                  <p className="text-xs text-[#737373]">
                    {currentEngine.sslRequired
                      ? `SSL is mandatory for ${currentEngine.label}.`
                      : "Disable for local / Docker. Enable for cloud-hosted databases."}
                  </p>
                </div>
                <Switch
                  id="ssl"
                  checked={Boolean(form.ssl)}
                  disabled={currentEngine.sslRequired}
                  onCheckedChange={(checked) => handleChange("ssl", checked)}
                />
              </div>
            </div>
          </Card>
        )}

        {/* 4. Labels */}
        <Card className="rounded-[14px] border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden p-0">
          <div className="border-b border-[#EEEEEE] bg-white px-6 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#0A0A0A] flex items-center justify-center shrink-0">
                <Tag className="w-4 h-4 text-[#4D4D4D]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#0A0A0A]">4. Service & Environment Tags</h3>
                <p className="text-xs text-[#737373]">Categorize connections for filtering and security rules</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-[#EEEEEE] text-[#737373]">Optional</Badge>
          </div>
          <div className="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="serviceName" className="block text-xs text-[#737373] uppercase tracking-wider">Service Tag</label>
              <Input
                id="serviceName"
                type="text"
                placeholder="e.g. billing-service, auth-api"
                value={form.serviceName || ""}
                onChange={(e) => handleChange("serviceName", e.target.value)}
                className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white text-xs text-[#0A0A0A]"
              />
              {fieldErrors.serviceName && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.serviceName}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="environment" className="block text-xs text-[#737373] uppercase tracking-wider">Environment Tag</label>
                <div className="flex items-center gap-1">
                  {["production", "staging", "development", "local"].map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => handleChange("environment", env)}
                      className="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[#F8F8F8] hover:bg-[#EEEEEE] text-[#4D4D4D] border border-[#EEEEEE] capitalize cursor-pointer"
                    >
                      {env}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                id="environment"
                type="text"
                placeholder="e.g. production, staging, local"
                value={form.environment || ""}
                onChange={(e) => handleChange("environment", e.target.value)}
                className="h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white text-xs text-[#0A0A0A]"
              />
              {fieldErrors.environment && <p className="text-xs text-[#D64545] mt-1">{fieldErrors.environment}</p>}
            </div>
          </div>
        </Card>

        {/* Live test panel (edit mode only) */}
        {isEdit && (
          <Card className="p-6 border border-[#EEEEEE] bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex-1 min-w-50">
                <h4 className="text-sm font-medium text-[#0A0A0A] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#4D4D4D]" />
                  <span>Verify Live Connectivity</span>
                </h4>
                <p className="text-xs text-[#737373] mt-0.5">Test connection health with current credentials</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={handleTest}
                className="shrink-0 border-[#EEEEEE] text-[#4D4D4D]"
              >
                {testing ? "Testing..." : "Test Connection"}
              </Button>
            </div>
            {testResult && (
              <div className={`mt-4 px-4 py-3 rounded-[10px] text-xs font-normal border ${
                testResult.success
                  ? "bg-[#22C55E]/10 text-[#15803D] border-[#22C55E]/20"
                  : "bg-[#D64545]/10 text-[#D64545] border-[#D64545]/20"
              }`}>
                <div className="flex items-start gap-2.5">
                  {testResult.success
                    ? <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 text-[#D64545] shrink-0 mt-0.5" />}
                  <div className="space-y-1">
                    <p className="font-medium">{testResult.message}</p>
                    {!testResult.success && testResult.message.includes("ECONNREFUSED") && (
                      <p className="text-[11px] font-normal leading-relaxed opacity-90">
                        Inside Docker, use <code className="font-mono bg-white px-1 py-0.5 rounded border border-[#EEEEEE]">host.docker.internal</code>.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Sticky footer */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#EEEEEE] py-4 px-4 sm:px-6 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#737373]">
              <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
              <span>Encrypted with AES-256. Read-only guardrails active for AI clients.</span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Link
                to="/databases"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "flex-1 sm:flex-none w-full sm:w-auto px-5 border-[#EEEEEE] text-[#4D4D4D]"
                )}
              >
                Cancel
              </Link>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={saving}
                className="px-6 flex-1 sm:flex-none gap-2"
              >
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
