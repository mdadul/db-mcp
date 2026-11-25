import type { ReactNode } from "react";

/** Page actions aligned with the title bar content. */
export function PageToolbar({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-11 items-center justify-end gap-2 border-b border-border px-4 ${className}`}
    >
      {children}
    </div>
  );
}
