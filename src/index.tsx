/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// App entry point: mounts the React tree into index.html's #root div.
// Edit here only for global providers/CSS; page content lives in Routes.tsx/App.tsx.
import "./index.css";
import "@itwin/itwinui-react/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./components/Routes";

// Fail fast with a clear message if required .env vars (OIDC auth settings) are missing,
// rather than letting the app silently break later during sign-in.
if (!import.meta.env.IMJS_AUTH_CLIENT_CLIENT_ID) {
  throw new Error(
    "Please add a valid OIDC client id to the .env file and restart. See the README for more information."
  );
}
if (!import.meta.env.IMJS_AUTH_CLIENT_SCOPES) {
  throw new Error(
    "Please add valid scopes for your OIDC client to the .env file and restart. See the README for more information."
  );
}
if (!import.meta.env.IMJS_AUTH_CLIENT_REDIRECT_URI) {
  throw new Error(
    "Please add a valid redirect URI to the .env file and restart. See the README for more information."
  );
}

// Gives TanStack Router's hooks (useSearch, useNavigate, etc.) full type-safety
// based on the concrete route tree defined in Routes.tsx.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const rootElement = document.getElementById("root")!;
// Guard against double-mounting (e.g. Vite HMR re-running this module).
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}