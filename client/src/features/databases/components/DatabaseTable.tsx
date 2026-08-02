import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import {
  testingIdAtom,
  testResultsAtom,
  toggleStatusAtom,
  testConnectionAtom,
} from "../atoms/databaseAtoms";
import type { DatabaseConnection } from "../types";

export interface DatabaseTableProps {
  databases: DatabaseConnection[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDeleteRequest: (db: DatabaseConnection) => void;
  onOpenDetails: (db: DatabaseConnection) => void;
}

export function DatabaseTable({
  databases,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteRequest,
  onOpenDetails,
}: DatabaseTableProps) {
  const navigate = useNavigate();

  const testingId = useAtomValue(testingIdAtom);
  const testResults = useAtomValue(testResultsAtom);

  const toggleStatus = useSetAtom(toggleStatusAtom);
  const testConnection = useSetAtom(testConnectionAtom);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const allSelected = databases.length > 0 && selectedIds.length === databases.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  useEffect(() => {
    if (databases.length === 0) {
      setFocusedIndex(0);
      return;
    }
    setFocusedIndex((prev) => Math.min(prev, databases.length - 1));
  }, [databases.length]);

  const moveFocus = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(nextIndex, databases.length - 1));
    setFocusedIndex(bounded);
    rowRefs.current[bounded]?.scrollIntoView({ block: "nearest" });
  };

  const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "BUTTON" ||
      target.isContentEditable
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (databases.length === 0 || isTypingTarget(event.target)) return;

    const focused = databases[focusedIndex];
    if (!focused) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(focusedIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(focusedIndex - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onOpenDetails(focused);
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      onToggleSelect(focused.id);
      return;
    }

    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      testConnection(focused.id);
      return;
    }

    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      toggleStatus(focused);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDeleteRequest(focused);
    }
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        if (databases.length > 0 && focusedIndex >= databases.length) setFocusedIndex(databases.length - 1);
      }}
      aria-label="Database explorer table"
      className="rounded-lg border overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pl-4">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Name & Service</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Host · Port / Database</TableHead>
            <TableHead>SSL</TableHead>
            <TableHead className="text-right pr-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {databases.map((db, index) => {
            const isSelected = selectedIds.includes(db.id);
            const isFocused = focusedIndex === index;
            const isTesting = testingId === db.id;
            const testResult = testResults[db.id];

            return (
              <TableRow
                key={db.id}
                ref={(el) => { rowRefs.current[index] = el; }}
                onMouseEnter={() => setFocusedIndex(index)}
                onClick={() => setFocusedIndex(index)}
                data-state={isSelected ? "selected" : undefined}
                className={isFocused && !isSelected ? "bg-muted/50 ring-1 ring-inset ring-ring/30" : ""}
              >
                <TableCell className="pl-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(db.id)}
                  />
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={db.status === "enabled"}
                      onCheckedChange={() => toggleStatus(db)}
                    />
                    <Badge variant={db.status === "enabled" ? "default" : "secondary"}>
                      {db.status}
                    </Badge>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span>{db.name}</span>
                    <DbEngineIcon type={db.type} className="w-4 h-4 object-contain" />
                  </div>
                  <div className="text-muted-foreground text-[11px] font-mono capitalize mt-0.5">
                    {db.type}{db.serviceName && ` · ${db.serviceName}`}
                  </div>
                </TableCell>

                <TableCell>
                  {db.environment ? (
                    <Badge variant="outline">{db.environment}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="font-mono">
                  <div className="text-foreground">{db.host}:{db.port}</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5">{db.databaseName}</div>
                </TableCell>

                <TableCell>
                  {db.ssl ? (
                    <Badge variant="secondary">SSL</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="pr-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="default" size="sm" onClick={() => onOpenDetails(db)} title="Open Interactive Workbench">
                      Workbench
                    </Button>
                    <Button variant="outline" size="sm" disabled={isTesting} onClick={() => testConnection(db.id)}>
                      {isTesting ? "Testing…" : "Test"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/${db.id}/edit`)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => onDeleteRequest(db)}>
                      Delete
                    </Button>
                  </div>
                  {testResult && (
                    <p className={`mt-1.5 text-[11px] text-right ${testResult.success ? "text-primary" : "text-destructive"}`}>
                      {testResult.success ? "✓" : "✕"} {testResult.message}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
