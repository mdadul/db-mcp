import { tauriPlatform } from "./tauri";
import type { Platform } from "./types";

export type * from "./types";

export const platform: Platform = tauriPlatform;
