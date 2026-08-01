import { useState, useMemo, useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DatabaseConnection } from "../types";

export interface PaletteItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  action: () => void;
}

interface UseCommandPaletteOptions {
  databases: DatabaseConnection[];
  onOpenWorkbench: (db: DatabaseConnection) => void;
  onTestConnection: (id: string) => void;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
  showInsights: boolean;
  onToggleInsights: () => void;
}

export function useCommandPalette({
  databases,
  onOpenWorkbench,
  onTestConnection,
  onRefresh,
  onNavigate,
  showInsights,
  onToggleInsights,
}: UseCommandPaletteOptions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Cmd/Ctrl+K opens palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setQuery("");
        setActiveIndex(0);
      } else if (open && e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return databases.slice(0, 8);
    return databases
      .filter((db) =>
        [db.name, db.host, db.databaseName, db.serviceName ?? "", db.environment ?? "", db.type]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 8);
  }, [databases, query]);

  const items = useMemo((): PaletteItem[] => {
    const base: PaletteItem[] = [
      { id: "refresh", icon: null, label: "Refresh connections", hint: "Pull latest control-plane state", action: onRefresh },
      { id: "add", icon: null, label: "Add new connection", hint: "Open connection creation form", action: () => onNavigate("/new") },
      { id: "table-view", icon: null, label: "Switch to table view", hint: "Best for triage and keyboard ops", action: () => {} },
      { id: "toggle-insights", icon: null, label: showInsights ? "Hide insights" : "Show insights", hint: "Toggle analytics and setup rail", action: onToggleInsights },
    ];

    const dbItems = matches.flatMap((db): PaletteItem[] => [
      { id: `open-${db.id}`, icon: null, label: `Open Workbench · ${db.name}`, hint: `${db.type.toUpperCase()} · ${db.host}:${db.port}/${db.databaseName}`, action: () => onOpenWorkbench(db) },
      { id: `test-${db.id}`, icon: null, label: `Test Connection · ${db.name}`, hint: "Run health check and update status", action: () => onTestConnection(db.id) },
    ]);

    return [...base, ...dbItems];
  }, [matches, showInsights, onRefresh, onNavigate, onToggleInsights, onOpenWorkbench, onTestConnection]);

  // Clamp index when list shrinks
  useEffect(() => {
    setActiveIndex((prev) => (items.length === 0 ? 0 : Math.min(prev, items.length - 1)));
  }, [items.length]);

  const run = (index: number) => {
    items[index]?.action();
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return { open, setOpen, query, setQuery, activeIndex, setActiveIndex, items, run, handleKeyDown };
}
