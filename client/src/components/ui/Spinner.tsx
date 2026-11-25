export interface SpinnerProps {
  label?: string;
  className?: string;
  size?: "sm" | "default";
}

/** Compact inline loading indicator that supports an accessible status label. */
export function Spinner({ label, className = "", size = "default" }: SpinnerProps) {
  return (
    <div
      role="status"
      className={`inline-flex items-center gap-2 text-ui-sm text-muted-foreground ${className}`}
    >
      <svg
        className={`animate-spin shrink-0 text-primary ${size === "sm" ? "size-3" : "size-4"}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label && <span>{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </div>
  );
}
