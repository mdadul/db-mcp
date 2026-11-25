import type { ReactNode } from "react";

/** Accessible fieldset for controls that share a single question. */
export function Fieldset({
  legend,
  description,
  children,
  className = "",
}: {
  legend: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="mb-1 text-ui-sm font-medium">{legend}</legend>
      {description && <p className="mb-3 text-ui-sm text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}
