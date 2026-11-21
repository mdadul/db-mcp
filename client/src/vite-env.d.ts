/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_DEV_SESSION_TOKEN?: string;
  readonly VITE_DEV_BACKEND_PORT?: string;
}
