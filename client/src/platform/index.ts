import { browserPlatform } from "./browser";
import { tauriPlatform } from "./tauri";
import type { Platform } from "./types";

export type * from "./types";

export const platform: Platform = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? tauriPlatform : browserPlatform;
