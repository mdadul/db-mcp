const classes = { healthy: "bg-success", warning: "bg-warning", error: "bg-danger", neutral: "bg-text-subtle" };

/** Shared status indicator for server and connection state. */
export function StatusDot({ state }: { state: "healthy" | "warning" | "error" | "neutral" }) {
  return <span aria-hidden="true" className={`inline-flex size-2 shrink-0 rounded-full ${classes[state]}`} />;
}
