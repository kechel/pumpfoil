/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Impressum/Betreiberangaben (in web/.env.local, nicht im Repo).
  readonly VITE_IMPRINT_NAME?: string;
  readonly VITE_IMPRINT_STREET?: string;
  readonly VITE_IMPRINT_CITY?: string;
  readonly VITE_IMPRINT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
