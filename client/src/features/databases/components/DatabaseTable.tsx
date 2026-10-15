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
import { Play, Zap, Pencil, Trash2 } from "@/components/ui/Icons";
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
      className="rounded-[14px] border border-[#EEEEEE] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] outline-none"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-[#EEEEEE] bg-[#FAFAFA]">
            <TableHead className="w-10 pl-4" />
            <TableHead className="w-10" />
            <TableHead className="text-xs text-[#737373] font-normal">Status</TableHead>
            <TableHead className="text-xs text-[#737373] font-normal">Name & Service</TableHead>
            <TableHead className="text-xs text-[#737373] font-normal">Environment</TableHead>
            <TableHead className="text-xs text-[#737373] font-normal">Host · Port / DB</TableHead>
            <TableHead className="text-xs text-[#737373] font-normal">SSL</TableHead>
            <TableHead className="text-right pr-4 text-xs text-[#737373] font-normal">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {databases.map((db, index) => {
            const isSelected = selectedIds.includes(db.id);
            const isFocused = focusedIndex === index;
            const isTesting = testingId === db.id;
            const testResult = testResults[db.id];
            const isEnabled = db.status === "enabled";

            return (
              <TableRow
                key={db.id}
                ref={(el) => { rowRefs.current[index] = el; }}
                onMouseEnter={() => setFocusedIndex(index)}
                onClick={() => setFocusedIndex(index)}
                data-state={isSelected ? "selected" : undefined}
                className={`group relative transition-colors duration-100 border-b border-[#EEEEEE] ${
                  isFocused && !isSelected ? "bg-[#F8F8F8]" : ""
                }`}
              >
                {/* Left status accent stripe */}
                <TableCell className="w-1 p-0">
                  <div className={`w-[3px] h-full min-h-[52px] rounded-r transition-colors duration-200 ${
                    isEnabled ? "bg-[#22C55E]" : "bg-[#EEEEEE]"
                  }`} />
                </TableCell>

                <TableCell className="pl-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(db.id)}
                  />
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleStatus(db)}
                    />
                    <Badge
                      variant={isEnabled ? "accent" : "default"}
                      className="text-xs"
                    >
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${isEnabled ? "bg-[#22C55E]" : "bg-[#999999]"}`} />
                      {db.status}
                    </Badge>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="font-medium text-[#0A0A0A] flex items-center gap-1.5">
                    <DbEngineIcon type={db.type} className="w-4 h-4 object-contain shrink-0" />
                    <span>{db.name}</span>
                  </div>
                  <div className="text-[#737373] text-xs font-mono capitalize mt-0.5">
                    {db.type}{db.serviceName && ` · ${db.serviceName}`}
                  </div>
                </TableCell>

                <TableCell>
                  {db.environment ? (
                    <Badge variant="outline" className="text-xs font-normal border-[#EEEEEE]">{db.environment}</Badge>
                  ) : (
                    <span className="text-[#CCCCCC]">—</span>
                  )}
                </TableCell>

                <TableCell className="font-mono text-xs">
                  <div className="text-[#0A0A0A]">{db.host}:{db.port}</div>
                  <div className="text-[#737373] text-[11px] mt-0.5">{db.databaseName || "all databases"}</div>
                </TableCell>

                <TableCell>
                  {db.ssl ? (
                    <Badge variant="secondary" className="text-xs">SSL</Badge>
                  ) : (
                    <span className="text-[#CCCCCC]">—</span>
                  )}
                </TableCell>

                <TableCell className="pr-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onOpenDetails(db)}
                      title="Open Interactive Workbench"
                      className="gap-1.5 h-8 text-xs font-normal"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      Workbench
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTesting}
                      onClick={() => testConnection(db.id)}
                      title="Test Connection"
                      className="h-8 text-xs font-normal text-[#4D4D4D]"
                    >
                      <Zap className="w-3 h-3" />
                      {isTesting ? "Testing…" : "Test"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(`/${db.id}/edit`)}
                      title="Edit Connection"
                      className="h-8 w-8 text-[#4D4D4D] hover:text-[#0A0A0A]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteRequest(db)}
                      title="Delete Connection"
                      className="h-8 w-8 text-[#D64545] hover:text-[#D64545] hover:bg-[#D64545]/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {testResult && (
                    <p className={`mt-1 text-[11px] text-right ${
                      testResult.success ? "text-[#15803D]" : "text-[#D64545]"
                    }`}>
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
