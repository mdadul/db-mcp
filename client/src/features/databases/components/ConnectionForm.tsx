import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Copy, Database, FolderOpen, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { FormFooter } from "@/components/ui/FormFooter";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RadioCards } from "@/components/ui/RadioCards";
import { NumberInput } from "@/components/ui/NumberInput";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { InlineHelp } from "@/components/ui/InlineHelp";
import { Skeleton } from "@/components/ui/Skeleton";
import { DB_ENGINES, type DatabaseConnection, type DbEngineType, type TestResult } from "../types";
import { createDatabaseFormSchema, updateDatabaseFormSchema } from "../schemas/databaseSchemas";
import { databaseApi } from "../api/databaseApi";
import { ConnectionStringParser, type ParsedConnectionFields } from "./ConnectionStringParser";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";

type FormValues = {
  name: string;
  type: DbEngineType;
  host: string;
  port: number | string;
  databaseName: string;
  username: string;
  password: string;
  ssl: boolean;
  serviceName: string;
  environment: string;
  folder: string;
  description: string;
};

const INITIAL: FormValues = {
  name: "",
  type: "postgresql",
  host: "localhost",
  port: 5432,
  databaseName: "",
  username: "",
  password: "",
  ssl: false,
  serviceName: "",
  environment: "",
  folder: "",
  description: "",
};
const READ_ONLY_GUIDANCE: Record<DbEngineType, string> = {
  postgresql:
    "CREATE ROLE db_mcp_reader LOGIN PASSWORD 'use-a-strong-password'; GRANT CONNECT ON DATABASE your_db TO db_mcp_reader; GRANT USAGE ON SCHEMA public TO db_mcp_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO db_mcp_reader; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO db_mcp_reader;",
  mysql:
    "CREATE USER 'db_mcp_reader'@'%' IDENTIFIED BY 'use-a-strong-password'; GRANT SELECT, SHOW VIEW ON your_db.* TO 'db_mcp_reader'@'%';",
  sqlite:
    "Open the file with an operating-system account that has read-only access. SQLite permissions are controlled by the file system.",
  redshift:
    "CREATE USER db_mcp_reader PASSWORD 'use-a-strong-password'; GRANT USAGE ON SCHEMA public TO db_mcp_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO db_mcp_reader;",
  mongodb:
    "db.createUser({ user: 'db_mcp_reader', pwd: 'use-a-strong-password', roles: [{ role: 'read', db: 'your_db' }] })",
};

/** Props for the reusable add/edit database connection form. */
export interface ConnectionFormProps {
  /** Called after a connection is created or updated. The callback receives the safe connection record. */
  onSaved?: (connection: DatabaseConnection) => void;
  /** Keeps the form in place after save, for embedding in onboarding flows. */
  stayOnSave?: boolean;
}

/** Reusable, validated add/edit form; routes to the saved connection unless embedded with stayOnSave. */
export function ConnectionForm({ onSaved, stayOnSave = false }: ConnectionFormProps) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testPending, setTestPending] = useState(false);
  const testController = useRef<AbortController | null>(null);
  const initialLoaded = useRef(false);
  const blocker = useBlocker(() => dirty);
  const connectionQuery = useQuery({
    queryKey: ["databases", id],
    queryFn: () => databaseApi.getById(id ?? ""),
    enabled: isEdit,
  });
  const engine = DB_ENGINES.find((item) => item.type === values.type) ?? DB_ENGINES[0]!;
  const save = useMutation({
    mutationFn: async () => {
      if (engine.requiresNetwork && /^\w+:\/\//.test(values.host)) {
        setErrors((current) => ({
          ...current,
          host: "Enter only the host name, without https:// or a path.",
        }));
        throw new FormValidationError();
      }
      const schema = isEdit ? updateDatabaseFormSchema : createDatabaseFormSchema;
      const result = schema.safeParse(values);
      if (!result.success) {
        const next: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string" && !next[field]) next[field] = issue.message;
        }
        setErrors(next);
        throw new FormValidationError();
      }
      const input = {
        ...result.data,
        port: Number(result.data.port),
        serviceName: result.data.serviceName || undefined,
        environment: result.data.environment || undefined,
        folder: result.data.folder ?? "",
        description: result.data.description ?? "",
      };
      if (id) return databaseApi.update(id, { ...input, password: input.password || undefined });
      return databaseApi.create({ ...input, password: values.password });
    },
    onSuccess: async (connection) => {
      await queryClient.invalidateQueries({ queryKey: ["databases"] });
      toast.success(isEdit ? `Saved ${connection.name}` : `Added ${connection.name}`);
      setDirty(false);
      onSaved?.(connection);
      if (!stayOnSave) navigate(`/connections/${connection.id}`, { replace: true });
    },
    onError: (error) => {
      if (!(error instanceof FormValidationError))
        toast.error(error instanceof Error ? error.message : "Could not save connection");
    },
  });

  useEffect(() => {
    if (connectionQuery.data && !initialLoaded.current) {
      const connection = connectionQuery.data;
      setValues({
        name: connection.name,
        type: connection.type as DbEngineType,
        host: connection.host,
        port: connection.port,
        databaseName: connection.databaseName,
        username: connection.username,
        password: "",
        ssl: connection.ssl,
        serviceName: connection.serviceName ?? "",
        environment: connection.environment ?? "",
        folder: connection.folder ?? "",
        description: connection.description ?? "",
      });
      initialLoaded.current = true;
    }
  }, [connectionQuery.data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save.mutate();
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        void testConnection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const update = (key: keyof FormValues, value: string | number | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
    if (errors[key])
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
  };
  const applyParsed = (parsed: ParsedConnectionFields) => {
    setValues((current) => ({
      ...current,
      ...(parsed.type && !isEdit ? { type: parsed.type } : {}),
      ...(parsed.host ? { host: parsed.host } : {}),
      ...(parsed.port ? { port: parsed.port } : {}),
      ...(parsed.databaseName ? { databaseName: parsed.databaseName } : {}),
      ...(parsed.username ? { username: parsed.username } : {}),
      ...(parsed.password ? { password: parsed.password } : {}),
      ...(parsed.ssl !== undefined ? { ssl: parsed.ssl } : {}),
    }));
    setDirty(true);
    toast.success("Connection details detected");
  };
  const validateField = (field: keyof FormValues) => {
    const schema = isEdit ? updateDatabaseFormSchema : createDatabaseFormSchema;
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      return;
    }
    const issue = result.error.issues.find((item) => item.path[0] === field);
    if (issue) setErrors((current) => ({ ...current, [field]: issue.message }));
  };
  async function testConnection() {
    if (engine.requiresNetwork && /^\w+:\/\//.test(values.host)) {
      setErrors((current) => ({
        ...current,
        host: "Enter only the host name, without https:// or a path.",
      }));
      return;
    }
    const result = (isEdit ? updateDatabaseFormSchema : createDatabaseFormSchema).safeParse(values);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    const controller = new AbortController();
    testController.current = controller;
    setTestPending(true);
    setTestResult(null);
    setTestError(null);
    try {
      const draft = {
        ...result.data,
        port: Number(result.data.port),
        password: values.password,
        ...(id ? { id } : {}),
      };
      setTestResult(await databaseApi.testDraft(draft, controller.signal));
    } catch (error) {
      if (!controller.signal.aborted)
        setTestError(error instanceof Error ? error.message : "Connection test failed");
    } finally {
      if (testController.current === controller) testController.current = null;
      setTestPending(false);
    }
  }
  const cancel = () => {
    testController.current?.abort();
    testController.current = null;
    setTestResult(null);
    setTestError(null);
  };
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const hostLooksLikeUrl = /^\w+:\/\//.test(values.host);
  const parsedEngineOptions = useMemo(
    () =>
      DB_ENGINES.map((item) => ({
        value: item.type,
        title: item.label,
        description: `${item.hint} · ${item.badge === "File" ? "File" : `port ${item.badge}`}`,
        icon: () => <DbEngineIcon type={item.type} className="size-5" />,
      })),
    [],
  );

  if (isEdit && connectionQuery.isLoading)
    return (
      <div
        className="mx-auto w-full max-w-3xl space-y-3 p-6"
        role="status"
        aria-label="Loading connection form"
      >
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (isEdit && connectionQuery.isError)
    return (
      <div
        role="alert"
        className="m-6 rounded-md border border-danger/30 bg-danger-subtle p-4 text-ui"
      >
        Could not load this connection: {connectionQuery.error.message}
        <Button
          variant="outline"
          size="sm"
          className="ml-3"
          onClick={() => void connectionQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-h-0 flex-col"
      aria-label={isEdit ? "Edit connection" : "New connection"}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5 pb-8">
          <header className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-primary">
              <Database className="size-4" />
            </div>
            <div>
              <h1 className="text-ui-title font-semibold">
                {isEdit ? "Edit connection" : "New connection"}
              </h1>
              <p className="mt-0.5 text-ui-sm text-muted-foreground">
                Connect a database for read-only browsing and queries.
              </p>
            </div>
          </header>
          <section className="flex flex-col gap-2">
            <h2 className="text-ui-sm font-semibold">Database engine</h2>
            {isEdit ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <DbEngineIcon type={values.type} className="size-5" />
                <span className="text-ui-sm font-medium">{engine.label}</span>
                <span className="text-ui-xs text-muted-foreground">
                  Engine cannot be changed after a connection is created.
                </span>
              </div>
            ) : (
              <RadioCards
                value={values.type}
                options={parsedEngineOptions}
                ariaLabel="Database engine"
                className="grid-cols-2 sm:grid-cols-3"
                onChange={(type) => {
                  const nextEngine =
                    DB_ENGINES.find((item) => item.type === type) ?? DB_ENGINES[0]!;
                  setValues((current) => ({
                    ...current,
                    type,
                    port:
                      current.port === "" ||
                      DB_ENGINES.some((item) => item.defaultPort === Number(current.port))
                        ? nextEngine.defaultPort
                        : current.port,
                    ssl: nextEngine.sslRequired || current.ssl,
                  }));
                  setDirty(true);
                }}
              />
            )}
          </section>
          <ConnectionStringParser
            onParse={applyParsed}
            className="rounded-md border-border bg-surface p-3 shadow-none"
          />
          <p className="-mt-3 text-ui-xs text-muted-foreground">
            The password is encrypted and stored on this computer.
          </p>

          <FormSection
            title="Connection"
            description="Name the connection and provide its location."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Name"
                required
                description="Shown to you and to AI clients, e.g. Orders (staging)."
                error={errors.name}
              >
                <Input
                  value={values.name}
                  onChange={(event) => update("name", event.target.value)}
                  onBlur={() => validateField("name")}
                  autoFocus={searchParams.has("duplicate")}
                />
              </Field>
              {engine.requiresNetwork ? (
                <>
                  <Field
                    label="Host"
                    required
                    description="Database server hostname, e.g. db.example.com."
                    error={
                      hostLooksLikeUrl
                        ? "Enter only the host name, without https:// or a path."
                        : errors.host
                    }
                  >
                    <Input
                      value={values.host}
                      placeholder="db.example.com"
                      autoComplete="url"
                      onChange={(event) => update("host", event.target.value)}
                      onBlur={() => validateField("host")}
                    />
                    {hostLooksLikeUrl && (
                      <span className="sr-only" role="alert">
                        Enter only the host name, without a scheme or path.
                      </span>
                    )}
                  </Field>
                  <Field
                    label="Port"
                    required
                    description={`Default for ${engine.label} is ${engine.defaultPort}.`}
                    error={errors.port}
                  >
                    <NumberInput
                      value={values.port}
                      min={1}
                      max={65535}
                      onChange={(value) => update("port", value)}
                      onBlur={() => validateField("port")}
                    />
                  </Field>
                  <Field
                    label="Database name"
                    required
                    description="The database to browse."
                    error={errors.databaseName}
                  >
                    <Input
                      value={values.databaseName}
                      onChange={(event) => update("databaseName", event.target.value)}
                      onBlur={() => validateField("databaseName")}
                    />
                  </Field>
                </>
              ) : (
                <Field
                  label="SQLite file path"
                  required
                  description="Use an absolute path or :memory:. The app needs read access to this file."
                  error={errors.databaseName}
                >
                  <div className="flex gap-2">
                    <Input
                      value={values.databaseName}
                      placeholder="/path/to/database.sqlite"
                      className="font-mono"
                      onChange={(event) => update("databaseName", event.target.value)}
                      onBlur={() => validateField("databaseName")}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Browse for SQLite file"
                      title="Native file picker is not installed"
                    >
                      <FolderOpen />
                    </Button>
                  </div>
                </Field>
              )}
            </div>
          </FormSection>

          {engine.requiresNetwork && (
            <FormSection
              title="Authentication"
              description="Use a dedicated database account with read-only permissions."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Username" required error={errors.username}>
                  <Input
                    autoComplete="username"
                    value={values.username}
                    onChange={(event) => update("username", event.target.value)}
                    onBlur={() => validateField("username")}
                  />
                </Field>
                <Field
                  label="Password"
                  required={!isEdit}
                  description={isEdit ? "Leave empty to keep the saved password." : undefined}
                  error={errors.password}
                >
                  <PasswordInput
                    autoComplete={isEdit ? "new-password" : "current-password"}
                    placeholder={
                      isEdit
                        ? "Unchanged — leave empty to keep the saved password"
                        : "Database password"
                    }
                    value={values.password}
                    onChange={(event) => update("password", event.target.value)}
                    onBlur={() => validateField("password")}
                  />
                </Field>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="text-ui-sm font-medium">
                    A read-only database user is recommended.
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-ui-sm text-primary">
                      Show {engine.label} setup SQL
                    </summary>
                    <div className="mt-2 flex items-start gap-2">
                      <pre
                        data-selectable="true"
                        className="min-w-0 flex-1 whitespace-pre-wrap rounded bg-background p-2 font-mono text-ui-xs text-muted-foreground"
                      >
                        {READ_ONLY_GUIDANCE[values.type]}
                      </pre>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Copy read-only user SQL"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(READ_ONLY_GUIDANCE[values.type])
                            .then(() => toast.success("Setup SQL copied"))
                        }
                      >
                        <Copy />
                      </Button>
                    </div>
                  </details>
                  <InlineHelp
                    label="Why use a read-only user?"
                    content="The desktop client blocks writes, and a database account with only read permissions adds a second layer of protection."
                  />
                </div>
              </div>
            </FormSection>
          )}

          <section className="rounded-md border border-border">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
              className="flex h-9 w-full items-center justify-between px-3 text-left text-ui-sm font-semibold hover:bg-muted"
            >
              Advanced options
              <span className="text-muted-foreground">{advancedOpen ? "−" : "+"}</span>
            </button>
            {advancedOpen && (
              <div className="flex flex-col gap-3 border-t border-border p-3">
                <Field label="SSL" description="Cloud database providers usually require SSL.">
                  <SegmentedControl
                    ariaLabel="SSL mode"
                    value={values.ssl ? "require" : "off"}
                    onChange={(value) => update("ssl", value === "require" || engine.sslRequired)}
                    options={[
                      { value: "off", label: "Off" },
                      { value: "require", label: engine.sslRequired ? "Required" : "Require" },
                    ]}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Environment"
                    optional
                    description="A label such as production, staging, or development."
                  >
                    <Input
                      value={values.environment}
                      placeholder="staging"
                      onChange={(event) => update("environment", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Service"
                    optional
                    description="An optional service or project label."
                  >
                    <Input
                      value={values.serviceName}
                      placeholder="orders-api"
                      onChange={(event) => update("serviceName", event.target.value)}
                    />
                  </Field>
                  <Field label="Folder" optional description="Groups this connection in the list.">
                    <Input
                      value={values.folder}
                      placeholder="Analytics"
                      onChange={(event) => update("folder", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Description"
                    optional
                    description="A short note about what this database is for."
                  >
                    <Input
                      value={values.description}
                      placeholder="Orders and payments, read replica"
                      onChange={(event) => update("description", event.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      {(testResult || testError) && (
        <div
          className={`mx-auto mb-2 flex w-full max-w-3xl items-start gap-2 rounded-md border px-3 py-2 text-ui-sm ${testResult?.success ? "border-success/30 bg-success-subtle text-success" : "border-danger/30 bg-danger-subtle text-danger"}`}
          role="status"
        >
          {testResult?.success ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{testResult?.message ?? testError}</p>
            {testResult?.success && (
              <p>
                {testResult.latencyMs ?? "—"} ms
                {testResult.serverVersion ? ` · ${testResult.serverVersion}` : ""}
              </p>
            )}
            {testResult && !testResult.success && (
              <>
                <p>{testResult.hint}</p>
                {testResult.code && <p className="font-mono">{testResult.code}</p>}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-1"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(JSON.stringify(testResult, null, 2))
                      .then(() => toast.success("Test details copied"))
                  }
                >
                  <Copy data-icon="inline-start" />
                  Copy details
                </Button>
              </>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss test result"
            onClick={cancel}
          >
            ×
          </Button>
        </div>
      )}
      <FormFooter status={dirty ? "Unsaved changes" : "All changes saved"} className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate("/connections")}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={testPending || save.isPending}
          onClick={() => void testConnection()}
        >
          {testPending ? "Testing…" : "Test"}
        </Button>
        {testPending && (
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Cancel test
          </Button>
        )}
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? "Saving…" : isEdit ? "Save" : "Add connection"}
        </Button>
      </FormFooter>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        title="Discard unsaved changes?"
        description="Your connection changes have not been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </form>
  );
}

class FormValidationError extends Error {}
