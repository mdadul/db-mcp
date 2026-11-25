import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import "./index.css";
import { App } from "./App";
import { applyCachedThemeSnapshot, installFontSizeShortcuts } from "./theme/runtime";

applyCachedThemeSnapshot();
installFontSizeShortcuts();

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
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          className:
            "!rounded-md !border !border-border !bg-popover !text-popover-foreground !text-ui-sm",
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
