import { describe, it, expect, vi } from "vitest";
import {
  encodeConnectionUrl,
  decodeConnectionUrl,
  isValidConnectionUrl,
  getRoleFromUrl,
} from "../../src/shared/utils/index";
import { PeerRole } from "../../src/shared/types/index";
import { URL_PROTOCOL } from "../../src/shared/constants/index";

// Mock electron-log
vi.mock("electron-log", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("signaling-url", () => {
  const mockSdp: RTCSessionDescriptionInit = {
    type: "offer",
    sdp: "v=0\r\no=- 123 456 IN IP4 192.168.1.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n",
  };

  const mockUsername = "TestUser";

  describe("encodeConnectionUrl", () => {
    it("should encode a valid sharer URL", async () => {
      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        mockUsername,
        mockSdp
      );

      expect(url).toContain(`${URL_PROTOCOL}share`);
      expect(url).toContain("username=");
      expect(url).toContain("token=");
    });

    it("should encode a valid watcher URL", async () => {
      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_WATCHER,
        mockUsername,
        { ...mockSdp, type: "answer" }
      );

      expect(url).toContain(`${URL_PROTOCOL}watch`);
      expect(url).toContain("username=");
      expect(url).toContain("token=");
    });

    it("should throw error for empty username", async () => {
      await expect(
        encodeConnectionUrl(PeerRole.SCREEN_SHARER, "", mockSdp)
      ).rejects.toThrow("Invalid username or SDP");
    });

    it("should throw error for empty SDP", async () => {
      await expect(
        encodeConnectionUrl(PeerRole.SCREEN_SHARER, mockUsername, { type: "offer", sdp: "" })
      ).rejects.toThrow("Invalid username or SDP");
    });

    it("should throw error for null SDP", async () => {
      await expect(
        encodeConnectionUrl(PeerRole.SCREEN_SHARER, mockUsername, null as any)
      ).rejects.toThrow("Invalid username or SDP");
    });

    it("should handle special characters in username", async () => {
      const specialUsername = "User@#$%^&*()";
      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        specialUsername,
        mockSdp
      );

      expect(url).toBeDefined();
      expect(isValidConnectionUrl(url)).toBe(true);
    });

    it("should handle large SDP data", async () => {
      const largeSdp: RTCSessionDescriptionInit = {
        type: "offer",
        sdp: mockSdp.sdp + "a=candidate:".repeat(1000),
      };

      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        mockUsername,
        largeSdp
      );

      expect(url).toBeDefined();
    });
  });

  describe("decodeConnectionUrl", () => {
    it("should decode a valid sharer URL", async () => {
      const originalUrl = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        mockUsername,
        mockSdp
      );

      const decoded = await decodeConnectionUrl(originalUrl);

      expect(decoded).not.toBeNull();
      expect(decoded?.role).toBe(PeerRole.SCREEN_SHARER);
      expect(decoded?.username).toBe(mockUsername);
      expect(decoded?.sdp.sdp).toBe(mockSdp.sdp);
      expect(decoded?.sdp.type).toBe("offer");
    });

    it("should decode a valid watcher URL", async () => {
      const watcherSdp: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: mockSdp.sdp,
      };

      const originalUrl = await encodeConnectionUrl(
        PeerRole.SCREEN_WATCHER,
        mockUsername,
        watcherSdp
      );

      const decoded = await decodeConnectionUrl(originalUrl);

      expect(decoded).not.toBeNull();
      expect(decoded?.role).toBe(PeerRole.SCREEN_WATCHER);
      expect(decoded?.sdp.type).toBe("answer");
    });

    it("should return null for invalid protocol", async () => {
      const invalidUrl = "https://share?username=test&token=abc";
      const decoded = await decodeConnectionUrl(invalidUrl);
      expect(decoded).toBeNull();
    });

    it("should return null for invalid action", async () => {
      const invalidUrl = `${URL_PROTOCOL}invalid?username=test&token=abc`;
      const decoded = await decodeConnectionUrl(invalidUrl);
      expect(decoded).toBeNull();
    });

    it("should return null for missing username", async () => {
      const invalidUrl = `${URL_PROTOCOL}share?token=abc`;
      const decoded = await decodeConnectionUrl(invalidUrl);
      expect(decoded).toBeNull();
    });

    it("should return null for missing token", async () => {
      const invalidUrl = `${URL_PROTOCOL}share?username=test`;
      const decoded = await decodeConnectionUrl(invalidUrl);
      expect(decoded).toBeNull();
    });

    it("should return null for malformed URL", async () => {
      const decoded = await decodeConnectionUrl("not-a-valid-url");
      expect(decoded).toBeNull();
    });

    it("should handle special characters in username", async () => {
      const specialUsername = "User@#$%^&*()";
      const originalUrl = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        specialUsername,
        mockSdp
      );

      const decoded = await decodeConnectionUrl(originalUrl);
      expect(decoded?.username).toBe(specialUsername);
    });
  });

  describe("isValidConnectionUrl", () => {
    it("should return true for valid sharer URL", async () => {
      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        mockUsername,
        mockSdp
      );
      expect(isValidConnectionUrl(url)).toBe(true);
    });

    it("should return true for valid watcher URL", async () => {
      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_WATCHER,
        mockUsername,
        { ...mockSdp, type: "answer" }
      );
      expect(isValidConnectionUrl(url)).toBe(true);
    });

    it("should return false for invalid protocol", () => {
      expect(isValidConnectionUrl("https://share?username=test&token=abc")).toBe(false);
    });

    it("should return false for invalid action", () => {
      expect(isValidConnectionUrl(`${URL_PROTOCOL}invalid?username=test&token=abc`)).toBe(false);
    });

    it("should return false for missing username", () => {
      expect(isValidConnectionUrl(`${URL_PROTOCOL}share?token=abc`)).toBe(false);
    });

    it("should return false for missing token", () => {
      expect(isValidConnectionUrl(`${URL_PROTOCOL}share?username=test`)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidConnectionUrl("")).toBe(false);
    });

    it("should return false for malformed URL", () => {
      expect(isValidConnectionUrl("not-a-url")).toBe(false);
    });
  });

  describe("getRoleFromUrl", () => {
    it("should return SCREEN_SHARER for share URL", async () => {
      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        mockUsername,
        mockSdp
      );
      expect(getRoleFromUrl(url)).toBe(PeerRole.SCREEN_SHARER);
    });

    it("should return SCREEN_WATCHER for watch URL", async () => {
      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_WATCHER,
        mockUsername,
        { ...mockSdp, type: "answer" }
      );
      expect(getRoleFromUrl(url)).toBe(PeerRole.SCREEN_WATCHER);
    });

    it("should return null for invalid action", () => {
      expect(getRoleFromUrl(`${URL_PROTOCOL}invalid?username=test&token=abc`)).toBeNull();
    });

    it("should return null for malformed URL", () => {
      expect(getRoleFromUrl("not-a-url")).toBeNull();
    });
  });

  describe("roundtrip encoding/decoding", () => {
    it("should preserve data through encode/decode cycle for sharer", async () => {
      const originalSdp: RTCSessionDescriptionInit = {
        type: "offer",
        sdp: "v=0\r\no=- 123 456 IN IP4 192.168.1.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=candidate:1234 1 udp 2113937151 192.168.1.1 54321 typ host\r\n",
      };

      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        mockUsername,
        originalSdp
      );

      const decoded = await decodeConnectionUrl(url);

      expect(decoded).not.toBeNull();
      expect(decoded?.role).toBe(PeerRole.SCREEN_SHARER);
      expect(decoded?.username).toBe(mockUsername);
      expect(decoded?.sdp.sdp).toBe(originalSdp.sdp);
    });

    it("should preserve data through encode/decode cycle for watcher", async () => {
      const originalSdp: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: "v=0\r\no=- 789 012 IN IP4 192.168.1.2\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n",
      };

      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_WATCHER,
        mockUsername,
        originalSdp
      );

      const decoded = await decodeConnectionUrl(url);

      expect(decoded).not.toBeNull();
      expect(decoded?.role).toBe(PeerRole.SCREEN_WATCHER);
      expect(decoded?.sdp.sdp).toBe(originalSdp.sdp);
    });

    it("should handle unicode characters in SDP", async () => {
      const unicodeSdp: RTCSessionDescriptionInit = {
        type: "offer",
        sdp: "v=0\r\no=- 123 456 IN IP4 192.168.1.1\r\ns=日本語テスト\r\nt=0 0\r\n",
      };

      const url = await encodeConnectionUrl(
        PeerRole.SCREEN_SHARER,
        "用户名",
        unicodeSdp
      );

      const decoded = await decodeConnectionUrl(url);

      expect(decoded).not.toBeNull();
      expect(decoded?.username).toBe("用户名");
      expect(decoded?.sdp.sdp).toBe(unicodeSdp.sdp);
    });
  });
});