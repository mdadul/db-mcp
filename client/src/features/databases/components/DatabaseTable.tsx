import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import type { DatabaseConnection, TestResult } from "../types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useServerInfo } from "@/platform/hooks";

export interface DatabaseTableProps {
  databases: DatabaseConnection[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDeleteRequest: (db: DatabaseConnection) => void;
  onOpenDetails: (db: DatabaseConnection) => void;
  onToggleStatus: (db: DatabaseConnection) => void;
  onTestConnection: (id: string) => void;
  testingId: string | null;
  testResults: Record<string, TestResult>;
  testedAt: Record<string, string>;
  queryCounts: Map<string | null, number>;
}

export function DatabaseTable({
  databases,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteRequest,
  onOpenDetails,
  onToggleStatus,
  onTestConnection,
  testingId,
  testResults,
  testedAt,
  queryCounts,
}: DatabaseTableProps) {
  const navigate = useNavigate();
  const { data: serverInfo } = useServerInfo();
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

  const copyMcpConfig = async () => {
    const url = serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp";
    await navigator.clipboard.writeText(JSON.stringify({ mcpServers: { "db-mcp": { url } } }, null, 2));
    toast.success("MCP configuration copied");
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
      onTestConnection(focused.id);
      return;
    }

    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      onToggleStatus(focused);
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
            <TableHead>Last tested</TableHead>
            <TableHead>MCP calls · 30d</TableHead>
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
                      onCheckedChange={() => onToggleStatus(db)}
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

                <TableCell className="text-muted-foreground" title={testedAt[db.id] ? new Date(testedAt[db.id]).toLocaleString() : undefined}>{testedAt[db.id] ? new Date(testedAt[db.id]).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Not tested"}</TableCell>

                <TableCell className="font-mono text-muted-foreground">{queryCounts.get(db.id)?.toLocaleString() ?? "—"}</TableCell>

                <TableCell className="pr-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="default" size="sm" onClick={() => onOpenDetails(db)} title="Open connection details">Details</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${db.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem disabled={isTesting} onClick={() => onTestConnection(db.id)}>{isTesting ? "Testing connection…" : "Test connection"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/connections/${db.id}/edit`)}><Pencil />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void copyMcpConfig()}><Copy />Copy MCP config</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDeleteRequest(db)}><Trash2 />Delete</DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
