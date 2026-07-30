/// <reference types="vite/client" />

// Declares the shape of `import.meta.env` so TypeScript knows about the custom IMJS_*/VITE_*
// variables read throughout src/ (Authorization.tsx, Routes.tsx, Sensors/sensorIngestion.ts, etc.).
// Add a line here any time you introduce a new variable in .env, or TS will flag it as unknown.
interface ImportMetaEnv {
  readonly IMJS_ITWIN_ID?: string;
  readonly IMJS_IMODEL_ID?: string;
  readonly IMJS_AUTH_AUTHORITY: string;
  readonly IMJS_AUTH_CLIENT_CLIENT_ID: string;
  readonly IMJS_AUTH_CLIENT_SCOPES: string;
  readonly IMJS_AUTH_CLIENT_REDIRECT_URI: string;
  readonly IMJS_AUTH_CLIENT_LOGOUT_URI: string;
  readonly IMJS_AUTH_CLIENT_CHANGESET_ID?: string;
  readonly IMJS_BING_MAPS_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}