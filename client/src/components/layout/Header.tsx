import React from "react";
import { Link } from "react-router-dom";

export interface HeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, backTo, action }: HeaderProps) {
  return (
    <div className="flex items-start justify-between mb-10 gap-4">
      <div className="flex items-center gap-4">
        {backTo && (
          <Link
            to={backTo}
            className="w-10 h-10 rounded-[10px] border border-[#EEEEEE] bg-white flex items-center justify-center text-[#4D4D4D] hover:text-[#0A0A0A] hover:border-[#CCCCCC] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            aria-label="Back"
          >
            ←
          </Link>
        )}
        <div>
          <h1 className="text-3xl font-medium text-[#0A0A0A] tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[#4D4D4D] mt-1.5 leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
