/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/


import { SvgError } from "@itwin/itwinui-illustrations-react";
import { NonIdealState, ThemeProvider } from "@itwin/itwinui-react";
import { Outlet } from "@tanstack/react-router";
import { ErrorBoundary } from "react-error-boundary";

import { AuthorizationProvider } from "./Authorization";

// Wraps every route (see Routes.tsx's rootRoute) with, from outside in:
//   ThemeProvider        - iTwinUI light/dark theming for all child components
//   ErrorBoundary         - catches render-time exceptions (e.g. missing iTwinId/iModelId)
//                           and shows a friendly error screen instead of a blank page
//   AuthorizationProvider - makes the OIDC auth client/state available via context
// <Outlet /> is where TanStack Router renders the matched route's component (Index or SignInRedirect).
export function RootLayout() {
  return (
    <ThemeProvider theme="light">
      <ErrorBoundary
        FallbackComponent={({ error }) => (
          <NonIdealState
            svg={<SvgError />}
            heading={"An error occurred"}
            description={error instanceof Error ? error.message : undefined}
          />
        )}
      >
        <AuthorizationProvider>
          <Outlet />
        </AuthorizationProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
