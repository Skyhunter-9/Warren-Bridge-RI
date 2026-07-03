/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createStorage } from "@itwin/unified-selection";
import { IModelConnection } from "@itwin/core-frontend";

// A single, app-wide selection store shared by every UI widget that needs to know
// "what's currently selected" (tree widget, property grid, etc. - passed into them in
// UiProviders.tsx/App.tsx as the `selectionStorage` prop) so clicking an element in one
// panel highlights it consistently everywhere else.
export const selectionStorage = createStorage();

// Prevents stale selection state from leaking into the next iModel if the user switches models.
IModelConnection.onClose.addListener((imodel) => {
  selectionStorage.clearStorage({ imodelKey: imodel.key });
});
