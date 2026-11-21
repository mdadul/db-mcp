import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Field copy guide: describe what a value is for and include an example in one short, sentence-case sentence (max one sentence).
 * Keep labels concise with no trailing period; make errors say what is wrong and how to fix it.
 */
export function Field({ label, children, description, error, required, optional, className }: { label: string; children: ReactNode; description?: string; error?: string; required?: boolean; optional?: boolean; className?: string }) {
  const id = useId();
  const controlId = `${id}-control`;
  const messageId = `${id}-message`;
  const describedBy = description || error ? messageId : undefined;
  const control = isValidElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>(children)
    ? cloneElement(children, {
      id: controlId,
      "aria-describedby": [children.props["aria-describedby"], describedBy].filter((value): value is string => Boolean(value)).join(" ") || undefined,
      "aria-invalid": Boolean(error),
    })
    : children;
  return <div className={cn("flex min-w-0 flex-col gap-1", className)} data-invalid={Boolean(error)}><label htmlFor={controlId} className="flex items-center gap-1 text-secondary font-medium text-foreground">{label}{required && <span className="text-danger" aria-label="required">*</span>}{optional && <span className="text-caption font-normal text-muted-foreground">Optional</span>}</label>{description && !error && <p id={messageId} className="text-secondary text-muted-foreground">{description}</p>}{control}{error && <p id={messageId} role="alert" className="flex items-start gap-1 text-secondary text-danger"><AlertCircle className="mt-0.5 size-3.5 shrink-0" />{error}</p>}</div>;
}
