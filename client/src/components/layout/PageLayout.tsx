import React from "react";
import { Navbar } from "./Navbar";
import { Toaster } from "@/components/ui/Toast";

export interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: "md" | "2xl" | "4xl" | "6xl" | "7xl" | "full";
  showNavbar?: boolean;
  className?: string;
}

export function PageLayout({
  children,
  maxWidth = "6xl",
  showNavbar = true,
  className = "",
}: PageLayoutProps) {
  const widthStyles = {
    md: "max-w-md",
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-full",
  };

  return (
    <div className="min-h-screen bg-white text-[#4D4D4D] flex flex-col antialiased selection:bg-[#E5E5E5] selection:text-[#0A0A0A]">
      {showNavbar && <Navbar />}
      <main className={`flex-1 ${widthStyles[maxWidth]} mx-auto w-full px-6 sm:px-10 lg:px-16 py-10 sm:py-16 ${className}`}>
        {children}
      </main>
      <Toaster />
    </div>
  );
}
