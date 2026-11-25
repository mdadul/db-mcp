import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export interface ResizablePanelItem {
  id: string;
  content: ReactNode;
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
}

/** Split-pane layout with keyboard resizing and persisted pane sizes per layout id. */
export function ResizablePanels({
  id,
  panels,
  direction = "horizontal",
  className = "",
}: {
  id: string;
  panels: readonly ResizablePanelItem[];
  direction?: "horizontal" | "vertical";
  className?: string;
}) {
  const [sizes, setSizes] = useState<number[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`dbmcp.panelSizes.${id}`) ?? "null");
      if (
        Array.isArray(saved) &&
        saved.length === panels.length &&
        saved.every((value) => typeof value === "number" && Number.isFinite(value))
      )
        return saved;
    } catch {
      /* Use the declared defaults when cached sizes are unavailable. */
    }
    const total = panels.reduce((sum, panel) => sum + panel.defaultSize, 0);
    return panels.map((panel) => (panel.defaultSize / total) * 100);
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ separator: number; pointer: number; sizes: number[] } | null>(null);
  const horizontal = direction === "horizontal";

  useEffect(() => {
    localStorage.setItem(`dbmcp.panelSizes.${id}`, JSON.stringify(sizes));
  }, [id, sizes]);

  const resizeAt = (separator: number, deltaPercent: number) => {
    const before = panels[separator];
    const after = panels[separator + 1];
    setSizes((current) => {
      const minBefore = before.minSize ?? 10;
      const maxBefore = before.maxSize ?? 90;
      const minAfter = after.minSize ?? 10;
      const maxAfter = after.maxSize ?? 90;
      const available = current[separator] + current[separator + 1];
      const nextBefore = Math.max(
        minBefore,
        Math.min(maxBefore, current[separator] + deltaPercent),
      );
      const bounded = Math.max(
        Math.min(minBefore, available - minAfter),
        Math.min(available - minAfter, nextBefore),
      );
      const actual = Math.max(available - maxAfter, bounded);
      const next = [...current];
      next[separator] = actual;
      next[separator + 1] = available - actual;
      return next;
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>, separator: number) => {
    if (!rootRef.current?.getBoundingClientRect()) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { separator, pointer: horizontal ? event.clientX : event.clientY, sizes };
    event.currentTarget.dataset.dragging = "true";
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!current || !rect) return;
    const length = horizontal ? rect.width : rect.height;
    const coordinate = horizontal ? event.clientX : event.clientY;
    const delta = ((coordinate - current.pointer) / length) * 100;
    drag.current = { ...current, pointer: coordinate };
    resizeAt(current.separator, delta);
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
  };

  return (
    <div
      ref={rootRef}
      className={`flex min-h-0 min-w-0 overflow-hidden ${horizontal ? "flex-row" : "flex-col"} ${className}`}
      data-resizable-panels={id}
    >
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          className={`flex min-h-0 min-w-0 overflow-hidden ${horizontal ? "flex-row" : "flex-col"}`}
          data-panel-id={panel.id}
          style={
            {
              [horizontal ? "width" : "height"]:
                `calc(${sizes[index]}% - ${((panels.length - 1) * 4) / panels.length}px)`,
              flex: `0 0 calc(${sizes[index]}% - ${((panels.length - 1) * 4) / panels.length}px)`,
            } as CSSProperties
          }
        >
          <div
            className={`${horizontal ? "min-h-0 min-w-0 flex-1" : "min-h-0 flex-1"} overflow-hidden`}
          >
            {panel.content}
          </div>
          {index < panels.length - 1 && (
            <div
              role="separator"
              aria-label={`Resize ${panel.id} panel`}
              aria-orientation={horizontal ? "vertical" : "horizontal"}
              aria-valuenow={Math.round(sizes[index])}
              tabIndex={0}
              className={`${horizontal ? "h-full w-1 cursor-col-resize" : "h-1 w-full cursor-row-resize"} relative z-10 shrink-0 touch-none bg-border transition-colors hover:bg-primary focus-visible:bg-primary`}
              onPointerDown={(event) => startDrag(event, index)}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              onKeyDown={(event) => {
                const negative = horizontal ? "ArrowLeft" : "ArrowUp";
                const positive = horizontal ? "ArrowRight" : "ArrowDown";
                if (event.key === negative) {
                  event.preventDefault();
                  resizeAt(index, -2);
                }
                if (event.key === positive) {
                  event.preventDefault();
                  resizeAt(index, 2);
                }
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
