import React from "react";
import { Navbar } from "./Navbar";
import { Toaster } from "@/components/ui/Toast";

export interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: "md" | "2xl" | "4xl" | "6xl" | "full";
  showNavbar?: boolean;
  className?: string;
}

export function PageLayout({
  children,
  maxWidth = "4xl",
  showNavbar = true,
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
    <div className="min-h-screen bg-muted flex flex-col">
      {showNavbar && <Navbar />}
      <main className={`flex-1 ${widthStyles[maxWidth]} mx-auto w-full px-4 py-8 ${className}`}>
        {children}
      </main>
      <Toaster />
    </div>
  );
}
