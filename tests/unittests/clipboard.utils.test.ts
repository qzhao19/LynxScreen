import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyToClipboard, readFromClipboard } from "../../src/shared/utils/clipboard";
import log from "electron-log";

// Mock electron-log
vi.mock("electron-log", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Clipboard Utils", () => {
  let originalNavigator: any;

  beforeEach(() => {
    // Save original navigator
    originalNavigator = (globalThis as any).navigator;

    // Ensure navigator and clipboard exist in test environment
    if (!(globalThis as any).navigator) {
      (globalThis as any).navigator = {};
    }
    if (!(globalThis as any).navigator.clipboard) {
      (globalThis as any).navigator.clipboard = {};
    }

    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original navigator
    (globalThis as any).navigator = originalNavigator;

    // Clean up global object
    delete (globalThis as any).electron;
  });

  describe("copyToClipboard", () => {
    it("should copy via Electron clipboard when available", async () => {
      const mockWriteText = vi.fn();
      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
        },
      };

      const text = "Hello, World!";
      await copyToClipboard(text);

      expect(mockWriteText).toHaveBeenCalledWith(text);
      expect(log.debug).toHaveBeenCalledWith("[Clipboard] Copied via Electron clipboard");
    });

    it("should copy via navigator.clipboard when Electron unavailable", async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign((globalThis as any).navigator.clipboard, {
        writeText: mockWriteText,
      });

      const text = "Test text";
      await copyToClipboard(text);

      expect(mockWriteText).toHaveBeenCalledWith(text);
      expect(log.debug).toHaveBeenCalledWith("[Clipboard] Copied via navigator.clipboard");
    });

    it("should prefer Electron clipboard over navigator.clipboard", async () => {
      const electronWriteText = vi.fn();
      const navWriteText = vi.fn().mockResolvedValue(undefined);

      (globalThis as any).electron = {
        clipboard: {
          writeText: electronWriteText,
        },
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        writeText: navWriteText,
      });

      const text = "Priority test";
      await copyToClipboard(text);

      expect(electronWriteText).toHaveBeenCalledWith(text);
      expect(navWriteText).not.toHaveBeenCalled();
    });

    it("should handle special characters in text", async () => {
      const mockWriteText = vi.fn();
      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
        },
      };

      const specialText = "特殊字符 🎉 @#$%^&*()";
      await copyToClipboard(specialText);

      expect(mockWriteText).toHaveBeenCalledWith(specialText);
    });

    it("should handle empty string", async () => {
      const mockWriteText = vi.fn();
      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
        },
      };

      await copyToClipboard("");

      expect(mockWriteText).toHaveBeenCalledWith("");
    });

    it("should handle very long text", async () => {
      const mockWriteText = vi.fn();
      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
        },
      };

      const longText = "a".repeat(100000);
      await copyToClipboard(longText);

      expect(mockWriteText).toHaveBeenCalledWith(longText);
    });

    // Failure cases with fallback
    it("should fallback to navigator.clipboard when Electron throws", async () => {
      const electronWriteText = vi.fn().mockImplementation(() => {
        throw new Error("Electron error");
      });
      const navWriteText = vi.fn().mockResolvedValue(undefined);

      (globalThis as any).electron = {
        clipboard: {
          writeText: electronWriteText,
        },
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        writeText: navWriteText,
      });

      const text = "Fallback test";
      await copyToClipboard(text);

      expect(electronWriteText).toHaveBeenCalled();
      expect(navWriteText).toHaveBeenCalledWith(text);
      expect(log.warn).toHaveBeenCalledWith(
        "[Clipboard] Electron clipboard unavailable: ",
        expect.any(Error)
      );
    });

    it("should throw error when all methods fail", async () => {
      const navWriteText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
      Object.assign((globalThis as any).navigator.clipboard, {
        writeText: navWriteText,
      });

      // No Electron clipboard
      (globalThis as any).electron = undefined;

      await expect(copyToClipboard("test")).rejects.toThrow(
        "All clipboard methods failed. Clipboard access may be restricted."
      );

      expect(log.error).toHaveBeenCalledWith(
        "[Clipboard] All clipboard methods failed. Clipboard access may be restricted."
      );
    });

    it("should handle navigator.clipboard timeout", async () => {
      const navWriteText = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100)
          )
      );
      Object.assign((globalThis as any).navigator.clipboard, {
        writeText: navWriteText,
      });

      (globalThis as any).electron = undefined;

      await expect(copyToClipboard("test")).rejects.toThrow();
    });

    // Edge cases
    it("should handle Electron clipboard being null", async () => {
      const navWriteText = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).electron = {
        clipboard: null,
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        writeText: navWriteText,
      });

      const text = "Null Electron test";
      await copyToClipboard(text);

      expect(navWriteText).toHaveBeenCalledWith(text);
    });

    it("should handle Electron clipboard missing writeText method", async () => {
      const navWriteText = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).electron = {
        clipboard: {},
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        writeText: navWriteText,
      });

      const text = "Missing method test";
      await copyToClipboard(text);

      expect(navWriteText).toHaveBeenCalledWith(text);
    });

    it("should handle unicode and emoji text", async () => {
      const mockWriteText = vi.fn();
      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
        },
      };

      const unicodeText = "日本語 🎭 العربية Ελληνικά";
      await copyToClipboard(unicodeText);

      expect(mockWriteText).toHaveBeenCalledWith(unicodeText);
    });
  });

  describe("readFromClipboard", () => {
    // Success cases
    it("should read via Electron clipboard when available", async () => {
      const testText = "Read from Electron";
      const mockReadText = vi.fn().mockReturnValue(testText);
      (globalThis as any).electron = {
        clipboard: {
          readText: mockReadText,
        },
      };

      const result = await readFromClipboard();

      expect(result).toBe(testText);
      expect(mockReadText).toHaveBeenCalled();
      expect(log.debug).toHaveBeenCalledWith("[Clipboard] Read via Electron clipboard");
    });

    it("should read via navigator.clipboard when Electron unavailable", async () => {
      const testText = "Read from Navigator";
      const mockReadText = vi.fn().mockResolvedValue(testText);
      Object.assign((globalThis as any).navigator.clipboard, {
        readText: mockReadText,
      });

      const result = await readFromClipboard();

      expect(result).toBe(testText);
      expect(mockReadText).toHaveBeenCalled();
      expect(log.debug).toHaveBeenCalledWith("[Clipboard] Read via navigator.clipboard");
    });

    it("should prefer Electron clipboard over navigator.clipboard", async () => {
      const electronText = "From Electron";
      const navText = "From Navigator";

      const electronReadText = vi.fn().mockReturnValue(electronText);
      const navReadText = vi.fn().mockResolvedValue(navText);

      (globalThis as any).electron = {
        clipboard: {
          readText: electronReadText,
        },
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        readText: navReadText,
      });

      const result = await readFromClipboard();

      expect(result).toBe(electronText);
      expect(electronReadText).toHaveBeenCalled();
      expect(navReadText).not.toHaveBeenCalled();
    });

    // Failure cases
    it("should fallback to navigator.clipboard when Electron throws", async () => {
      const navText = "Fallback text";
      const electronReadText = vi.fn().mockImplementation(() => {
        throw new Error("Electron error");
      });
      const navReadText = vi.fn().mockResolvedValue(navText);

      (globalThis as any).electron = {
        clipboard: {
          readText: electronReadText,
        },
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        readText: navReadText,
      });

      const result = await readFromClipboard();

      expect(result).toBe(navText);
      expect(log.warn).toHaveBeenCalledWith(
        "[Clipboard] Electron clipboard unavailable:",
        expect.any(Error)
      );
    });

    it("should return null when both methods fail", async () => {
      const navReadText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
      Object.assign((globalThis as any).navigator.clipboard, {
        readText: navReadText,
      });

      (globalThis as any).electron = undefined;

      const result = await readFromClipboard();

      expect(result).toBeNull();
      expect(log.warn).toHaveBeenCalledWith(
        "[Clipboard] navigator.clipboard failed:",
        expect.any(Error)
      );
    });

    it("should handle empty clipboard content", async () => {
      const mockReadText = vi.fn().mockReturnValue("");
      (globalThis as any).electron = {
        clipboard: {
          readText: mockReadText,
        },
      };

      const result = await readFromClipboard();

      expect(result).toBe("");
    });

    it("should handle very long clipboard content", async () => {
      const longText = "x".repeat(100000);
      const mockReadText = vi.fn().mockReturnValue(longText);
      (globalThis as any).electron = {
        clipboard: {
          readText: mockReadText,
        },
      };

      const result = await readFromClipboard();

      expect(result).toBe(longText);
    });

    // Edge cases
    it("should handle Electron clipboard being null", async () => {
      const navText = "From Nav";
      const navReadText = vi.fn().mockResolvedValue(navText);

      (globalThis as any).electron = {
        clipboard: null,
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        readText: navReadText,
      });

      const result = await readFromClipboard();

      expect(result).toBe(navText);
    });

    it("should handle Electron clipboard missing readText method", async () => {
      const navText = "From Nav";
      const navReadText = vi.fn().mockResolvedValue(navText);

      (globalThis as any).electron = {
        clipboard: {},
      };
      Object.assign((globalThis as any).navigator.clipboard, {
        readText: navReadText,
      });

      const result = await readFromClipboard();

      expect(result).toBe(navText);
    });

    it("should handle unicode and emoji in clipboard content", async () => {
      const unicodeText = "日本語 🎭 العربية";
      const mockReadText = vi.fn().mockReturnValue(unicodeText);
      (globalThis as any).electron = {
        clipboard: {
          readText: mockReadText,
        },
      };

      const result = await readFromClipboard();

      expect(result).toBe(unicodeText);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle copy and read roundtrip", async () => {
      const testText = "Roundtrip test";
      const mockWriteText = vi.fn();
      const mockReadText = vi.fn().mockReturnValue(testText);

      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
          readText: mockReadText,
        },
      };

      await copyToClipboard(testText);
      const result = await readFromClipboard();

      expect(mockWriteText).toHaveBeenCalledWith(testText);
      expect(mockReadText).toHaveBeenCalled();
      expect(result).toBe(testText);
    });

    it("should handle concurrent copy and read operations", async () => {
      const testText = "Concurrent test";
      const mockWriteText = vi.fn();
      const mockReadText = vi.fn().mockReturnValue(testText);

      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
          readText: mockReadText,
        },
      };

      const [, readResult] = await Promise.all([
        copyToClipboard(testText),
        readFromClipboard(),
      ]);

      expect(readResult).toBe(testText);
    });

    it("should handle multiple sequential copy operations", async () => {
      const mockWriteText = vi.fn();
      (globalThis as any).electron = {
        clipboard: {
          writeText: mockWriteText,
        },
      };

      const texts = ["First", "Second", "Third"];
      for (const text of texts) {
        await copyToClipboard(text);
      }

      expect(mockWriteText).toHaveBeenCalledTimes(3);
      expect(mockWriteText).toHaveBeenNthCalledWith(1, "First");
      expect(mockWriteText).toHaveBeenNthCalledWith(2, "Second");
      expect(mockWriteText).toHaveBeenNthCalledWith(3, "Third");
    });
  });
});