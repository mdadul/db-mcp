import React from "react";

export interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: "md" | "2xl" | "4xl" | "6xl" | "full";
  className?: string;
}

export function PageLayout({
  children,
  maxWidth = "4xl",
  className = "",
}: PageLayoutProps) {
  const widthStyles = {
    md: "max-w-md",
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
    full: "max-w-full",
  };

  return (
    <div className={`mx-auto w-full ${widthStyles[maxWidth]} px-6 py-7 ${className}`}>{children}</div>
  );
}
