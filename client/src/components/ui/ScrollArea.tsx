import type { HTMLAttributes, ReactNode } from "react";

/** Scrollable pane using the app's OS-appropriate scrollbar treatment. */
export function ScrollArea({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`min-h-0 overflow-auto overscroll-none ${className}`} {...props}>
      {children}
    </div>
  );
}
