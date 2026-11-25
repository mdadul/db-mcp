import { environmentTone } from "./model";

/** Environment label with a tone that matches its risk: production red, staging amber, development green. */
export function EnvironmentTag({ environment }: { environment: string | null }) {
  const tone = environmentTone(environment);
  if (!tone) return null;
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-px text-ui-xs font-medium ${tone.className}`}
      title={`Environment: ${tone.label}`}
    >
      {tone.label}
    </span>
  );
}
