import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./index.css";
import { App } from "./App";

const cachedSettings = localStorage.getItem("dbmcp.settingsCache");
if (cachedSettings) {
  try {
    const settings = JSON.parse(cachedSettings) as { theme?: "system" | "light" | "dark"; accent?: string };
    const root = document.documentElement;
    root.dataset.accent = settings.accent ?? "blue";
    const dark = settings.theme === "dark" || (settings.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "default-dark" : "default-light";
    root.classList.toggle("dark", dark);
  } catch {
    localStorage.removeItem("dbmcp.settingsCache");
  }
} else {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "default-dark" : "default-light";
  document.documentElement.classList.toggle("dark", dark);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: "!rounded-md !border !border-border !bg-popover !text-popover-foreground !text-[12px]" }} />
    </QueryClientProvider>
  </StrictMode>
);
