import { registerLoggerHandlers } from "./logger";
import { registerClipboardHandlers } from "./clipboard";

export function registerIpcHandlers(): void {
  registerLoggerHandlers();
  registerClipboardHandlers();
}