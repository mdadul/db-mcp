import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/components/ui/Toast";
import { databaseApi } from "../api/databaseApi";
import {
  createDatabaseFormSchema,
  updateDatabaseFormSchema,
  type BaseDatabaseFormData,
} from "../schemas/databaseSchemas";
import { DB_ENGINES } from "../types";
import type { TestResult, DbEngineType } from "../types";
import type { ParsedConnectionFields } from "../components/ConnectionStringParser";

export type DatabaseFormState = BaseDatabaseFormData & { password?: string };

const INITIAL_FORM: DatabaseFormState = {
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
};

export function useDatabaseForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<DatabaseFormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (!id) return;
    databaseApi
      .getById(id)
      .then((db) => {
        setForm({
          name: db.name,
          type: db.type as DbEngineType,
          host: db.host,
          port: db.port,
          databaseName: db.databaseName,
          username: db.username,
          password: "",
          ssl: db.ssl,
          serviceName: db.serviceName ?? "",
          environment: db.environment ?? "",
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load database connection");
      })
      .finally(() => setLoading(false));
  }, [id]);

  function handleChange(field: keyof DatabaseFormState, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handleEngineChange(newType: DbEngineType) {
    const engine = DB_ENGINES.find((e) => e.type === newType)!;
    const knownPorts = DB_ENGINES.map((e) => e.defaultPort);
    setForm((prev) => ({
      ...prev,
      type: newType,
      host: engine.requiresNetwork ? (prev.host || "localhost") : "",
      port: knownPorts.includes(Number(prev.port) ?? 0) ? engine.defaultPort : prev.port,
      username: engine.requiresNetwork ? prev.username : "",
      password: engine.requiresNetwork ? prev.password : "",
      // sslRequired engines always get ssl:true regardless of previous toggle value
      ssl: engine.sslRequired ? true : (engine.requiresNetwork ? prev.ssl : false),
    }));
  }

  function handleAutoFill(parsed: ParsedConnectionFields) {
    setForm((prev) => ({
      ...prev,
      ...(parsed.type ? { type: parsed.type } : {}),
      ...(parsed.host ? { host: parsed.host } : {}),
      ...(parsed.port ? { port: parsed.port } : {}),
      ...(parsed.databaseName ? { databaseName: parsed.databaseName } : {}),
      ...(parsed.username ? { username: parsed.username } : {}),
      ...(parsed.password ? { password: parsed.password } : {}),
      ...(parsed.ssl !== undefined ? { ssl: parsed.ssl } : {}),
    }));
    toast.add({ type: "success", title: "Auto-filled connection parameters!" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const schema = isEdit ? updateDatabaseFormSchema : createDatabaseFormSchema;
    const result = schema.safeParse(form);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") errors[path] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const data = result.data;
      if (isEdit && id) {
        await databaseApi.update(id, { ...data, password: data.password || undefined });
        toast.add({ type: "success", title: `Updated "${data.name}"` });
      } else {
        await databaseApi.create({
          name: data.name,
          type: data.type,
          host: data.host,
          port: data.port,
          databaseName: data.databaseName,
          username: data.username,
          password: data.password ?? "",
          ssl: data.ssl,
          serviceName: data.serviceName || undefined,
          environment: data.environment || undefined,
        });
        toast.add({ type: "success", title: `Added "${data.name}"` });
      }
      navigate("/databases");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!id) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await databaseApi.testConnection(id);
      setTestResult(res);
      toast.add({
        type: res.success ? "success" : "error",
        title: res.success ? "Connection test passed!" : `Test failed: ${res.message}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Test failed";
      setTestResult({ success: false, message: msg });
      toast.add({ type: "error", title: msg });
    } finally {
      setTesting(false);
    }
  }

  // Derived: connection URI preview (password masked)
  const protocol = form.type === "mysql" ? "mysql" : form.type === "mongodb" ? "mongodb" : "postgresql";
  const userPart = form.username ? `${form.username}${form.password ? ":••••••" : ""}@` : "";
  const defaultPort = form.type === "mysql" ? 3306 : form.type === "mongodb" ? 27017 : 5432;
  const hostPort = `${form.host || "localhost"}:${form.port || defaultPort}`;
  const dbPath = form.databaseName ? `/${form.databaseName}` : "";
  const sslQuery = form.ssl ? "?ssl=true" : "";
  const generatedUri =
    form.type === "sqlite"
      ? `sqlite://${form.databaseName || "<path>"}`
      : `${protocol}://${userPart}${hostPort}${dbPath}${sslQuery}`;

  async function copyUriToClipboard() {
    try {
      const pass = form.password || "••••••";
      const full =
        form.type === "sqlite"
          ? `sqlite://${form.databaseName}`
          : `${protocol}://${form.username ? `${form.username}:${pass}@` : ""}${hostPort}${dbPath}${sslQuery}`;
      await navigator.clipboard.writeText(full);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
      toast.add({ type: "success", title: "URI copied!" });
    } catch {
      // clipboard not available
    }
  }

  const currentEngine = DB_ENGINES.find((e) => e.type === form.type)!;

  return {
    // identity
    id,
    isEdit,
    // form data
    form,
    fieldErrors,
    currentEngine,
    // ui state
    loading,
    saving,
    showPassword,
    setShowPassword,
    error,
    testing,
    testResult,
    copiedUri,
    generatedUri,
    // handlers
    handleChange,
    handleEngineChange,
    handleAutoFill,
    handleSubmit,
    handleTest,
    copyUriToClipboard,
  };
}
