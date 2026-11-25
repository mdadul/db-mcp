import type { ReactNode } from "react";

/** Vertical group for related form fields. */
export function FieldGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-col gap-4 ${className}`}>{children}</div>;
}
