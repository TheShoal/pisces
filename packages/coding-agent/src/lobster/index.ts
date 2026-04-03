/**
 * Lobster extension entry point.
 *
 * Registers messageUser and memorySearch as first-class extension tools via
 * the pisces extension API.  Loaded in main.ts when PISCES_LOBSTER_MODE=1 or
 * pisces.lobsterMode is set in settings.
 */

import type { ExtensionFactory } from "../extensibility/extensions";
import { memorySearchTool, messageUserTool } from "./tools";

export const createLobsterExtension: ExtensionFactory = api => {
	api.registerTool(messageUserTool);
	api.registerTool(memorySearchTool);
};
