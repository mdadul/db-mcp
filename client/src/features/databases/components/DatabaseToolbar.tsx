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
    <Card className="mb-4 space-y-4 border-[#EEEEEE] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] rounded-[14px]">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#737373]">
            <Search className="w-4 h-4" />
          </div>
          <Input
            type="text"
            placeholder="Search connections by name, host, db…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 text-xs h-[42px] rounded-[10px] border-[#EEEEEE] bg-[#FAFAFA] focus:bg-white text-[#4D4D4D] focus:text-[#0A0A0A]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#737373] hover:text-[#0A0A0A]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Select */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="text-xs h-[42px] px-3.5 border border-[#EEEEEE] rounded-[10px] bg-white text-[#4D4D4D] focus:outline-none focus:border-[#CCCCCC] cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="enabled">Enabled Only</option>
            <option value="disabled">Disabled Only</option>
          </select>
        </div>
      </div>

      {/* Environment Filter Pills */}
      {environments.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-[#EEEEEE] pt-3">
          <div className="flex items-center gap-1.5 text-xs text-[#737373] mr-2 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Environment:</span>
          </div>
          <Button
            variant={envFilter === "all" ? "default" : "outline"}
            size="xs"
            onClick={() => onEnvFilterChange("all")}
            className="rounded-[8px] h-7 px-3"
          >
            All
          </Button>
          {environments.map((env) => (
            <Button
              key={env}
              variant={envFilter === env ? "default" : "outline"}
              size="xs"
              onClick={() => onEnvFilterChange(env)}
              className="rounded-[8px] h-7 px-3"
            >
              {env}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
