import { registerLoggerHandlers } from "./logger";
import { registerClipboardHandlers } from "./clipboard";
import { registerPowerHandlers } from "./power";

export function registerIpcHandlers(): void {
  registerLoggerHandlers();
  registerClipboardHandlers();
  registerPowerHandlers();
}