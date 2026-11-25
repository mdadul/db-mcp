const classes = {
  healthy: "bg-success",
  warning: "bg-warning",
  error: "bg-danger",
  neutral: "bg-text-subtle",
};

const labels = { healthy: "Healthy", warning: "Warning", error: "Error", neutral: "Unknown" };

type StatusDotState = keyof typeof classes;

/** Shared status indicator for server and connection state. */
export function StatusDot({
  state,
  label,
  showLabel = false,
}: {
  state: StatusDotState;
  label?: string;
  showLabel?: boolean;
}) {
  if (label === undefined && !showLabel)
    return (
      <span
        aria-hidden="true"
        className={`inline-flex size-2 shrink-0 rounded-full ${classes[state]}`}
      />
    );
  const text = label ?? labels[state];
  return (
    <span
      role="img"
      aria-label={text}
      className={`inline-flex shrink-0 items-center ${showLabel ? "gap-1.5" : ""}`}
    >
      <span className={`size-2 shrink-0 rounded-full ${classes[state]}`} />
      {showLabel && (
        <span aria-hidden="true" className="text-ui-xs text-muted-foreground">
          {text}
        </span>
      )}
    </span>
  );
}
