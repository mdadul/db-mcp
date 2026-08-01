import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Search, X, Filter } from "@/components/ui/Icons";

export interface DatabaseToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  envFilter: string;
  onEnvFilterChange: (env: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  environments: string[];
}

export function DatabaseToolbar({
  searchQuery,
  onSearchChange,
  envFilter,
  onEnvFilterChange,
  statusFilter,
  onStatusFilterChange,
  environments,
}: DatabaseToolbarProps) {
  return (
    <Card className="mb-2 space-y-3 border-border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Explorer Controls</p>
        <p className="text-xs text-muted-foreground">Search, filter, and switch views</p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
            <Search className="w-4 h-4" />
          </div>
          <Input
            type="text"
            placeholder="Search by name, host, db, service…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 text-xs border-border bg-muted focus:bg-background"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Controls: Status filter & View Switcher */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Status Select */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="text-xs px-3 py-1.5 border border-border rounded-lg bg-background text-muted-foreground font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Statuses</option>
            <option value="enabled">Enabled Only</option>
            <option value="disabled">Disabled Only</option>
          </select>
        </div>
      </div>

      {/* Environment Filter Pills */}
      {environments.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border pb-1 pt-2">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">
            <Filter className="w-3 h-3" />
            <span>Env:</span>
          </div>
          <Button
            variant={envFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => onEnvFilterChange("all")}
          >
            All
          </Button>
          {environments.map((env) => (
            <Button
              key={env}
              variant={envFilter === env ? "default" : "outline"}
              size="sm"
              onClick={() => onEnvFilterChange(env)}
            >
              {env}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
