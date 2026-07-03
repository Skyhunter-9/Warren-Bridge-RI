/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./Routes.css";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  AuthorizationState,
  SignInRedirect,
  useAuthorizationContext,
} from "./Authorization";
import { RootLayout } from "./RootLayout";
import { ProgressLinear } from "@itwin/itwinui-react";
import { App } from "./App";

// Defines the two pages of this app:
//   "/"               -> the actual iTwin viewer (indexRoute below)
//   "/signin-callback" -> OIDC redirect target after Bentley login (signinRedirectRoute below)
// RootLayout wraps every route with the theme provider, error boundary, and auth context.
const rootRoute = createRootRoute({
  component: RootLayout,
});

interface IndexSearchParams {
  iTwinId: string;
  iModelId: string;
  changesetId?: string;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Reads iTwinId/iModelId from the URL's query string (?iTwinId=...&iModelId=...),
  // falling back to the .env defaults (IMJS_ITWIN_ID / IMJS_IMODEL_ID) if not present in the URL.
  // This is what lets you open a *different* model just by editing the URL bar, as seen in your screenshots.
  validateSearch: (search: Record<string, unknown>): IndexSearchParams => {
    const iTwinId =
      (search.iTwinId as string | undefined) ?? import.meta.env.IMJS_ITWIN_ID;
    const iModelId =
      (search.iModelId as string | undefined) ?? import.meta.env.IMJS_IMODEL_ID;
    const changesetId = search.changesetId as string | undefined;
    if (!iTwinId || !iModelId) {
      throw new Error(
        "Please add a valid iTwin ID and iModel ID in the .env file and restart the application or add it to the `iTwinId`/`iModelId` query parameter in the url and refresh the page. See the README for more information."
      );
    }
    return {
      iTwinId,
      iModelId,
      changesetId,
    };
  },
  path: "/",
  component: function Index() {
    const { iTwinId, iModelId, changesetId } = indexRoute.useSearch();
    const { state } = useAuthorizationContext();

    return (
      <div className="viewer-container">
        {/* Show a loading bar until BrowserAuthorizationClient (see Authorization.tsx) finishes
            silent sign-in / redirect; only then do we mount the actual 3D viewer. */}
        {state === AuthorizationState.Pending ? (
          <div className="centered">
            <div className="signin-content">
              <ProgressLinear labels={["Loading..."]} />
            </div>
          </div>
        ) : (
          <App
            iTwinId={iTwinId}
            iModelId={iModelId}
            changesetId={changesetId}
          />
        )}
      </div>
    );
  },
});

// Bentley's OAuth server redirects the browser back to this path after login;
// SignInRedirect (Authorization.tsx) just finishes the token exchange and the user
// is bounced back to "/" once AuthorizationState flips to Authorized.
const signinRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin-callback",
  component: SignInRedirect,
});

const routeTree = rootRoute.addChildren([indexRoute, signinRedirectRoute]);

// Exported and consumed by index.tsx's <RouterProvider>.
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});