import { registerLoggerHandlers } from "./logger";
import { registerClipboardHandlers } from "./clipboard";
import { registerPowerHandlers } from "./power";
import { registerMediaPermissionHandlers } from "./media-permission";

export function registerIpcHandlers(): void {
  registerLoggerHandlers();
  registerClipboardHandlers();
  registerPowerHandlers();
  registerMediaPermissionHandlers();
}