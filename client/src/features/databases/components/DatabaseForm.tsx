import { ConnectionForm, type ConnectionFormProps } from "./ConnectionForm";

/** Compatibility wrapper retained for onboarding, which uses the original onCreated callback. */
export function DatabaseForm({ onCreated }: { onCreated?: ConnectionFormProps["onSaved"] } = {}) {
  return <ConnectionForm stayOnSave={Boolean(onCreated)} onSaved={onCreated} />;
}
