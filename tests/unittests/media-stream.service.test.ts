import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MediaStreamService } from "../../src/renderer/core/webrtc/media/index";

// Mock electron-log
vi.mock("electron-log", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

describe("MediaStreamService", () => {
  let service: MediaStreamService;
  let mockAudioTrack: MediaStreamTrack;
  let mockVideoTrack: MediaStreamTrack;
  let mockAudioStream: MediaStream;
  let mockDisplayStream: MediaStream;
  let mockMediaDevices: {
    getUserMedia: ReturnType<typeof vi.fn>
    getDisplayMedia: ReturnType<typeof vi.fn>
  };

  beforeEach(() => {
    service = new MediaStreamService();

    // Mock MediaStreamTrack
    mockAudioTrack = {
      kind: "audio",
      enabled: true,
      readyState: "live",
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onended: null,
      onmute: null,
      onunmute: null
    } as unknown as MediaStreamTrack;

    mockVideoTrack = {
      kind: "video",
      enabled: true,
      readyState: "live",
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onended: null,
      onmute: null,
      onunmute: null
    } as unknown as MediaStreamTrack;

    // Mock MediaStream
    mockAudioStream = {
      active: true,
      getTracks: vi.fn(() => [mockAudioTrack]),
      getAudioTracks: vi.fn(() => [mockAudioTrack]),
      getVideoTracks: vi.fn(() => []),
      removeTrack: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaStream;

    mockDisplayStream = {
      active: true,
      getTracks: vi.fn(() => [mockVideoTrack]),
      getAudioTracks: vi.fn(() => []),
      getVideoTracks: vi.fn(() => [mockVideoTrack]),
      removeTrack: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaStream;

    // Mock navigator.mediaDevices using vi.stubGlobal
    mockMediaDevices = {
      getUserMedia: vi.fn(),
      getDisplayMedia: vi.fn()
    };

    vi.stubGlobal("navigator", {
      mediaDevices: mockMediaDevices
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("getUserAudio", () => {
    it("should successfully get audio stream", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);

      const result = await service.getUserAudio();

      expect(result).toBe(mockAudioStream);
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: false
      });
    });

    it("should return null when user denies permission", async () => {
      mockMediaDevices.getUserMedia.mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await service.getUserAudio();

      expect(result).toBeNull();
      expect(service.getAudioStream()).toBeNull();
    });

    it("should stop existing audio stream before getting new one", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);

      await service.getUserAudio();

      const newMockStream = { ...mockAudioStream };
      mockMediaDevices.getUserMedia.mockResolvedValue(newMockStream);

      await service.getUserAudio();

      expect(mockAudioTrack.stop).toHaveBeenCalled();
      expect(service.getAudioStream()).toBe(newMockStream);
    });
  });

  describe("getDisplayMedia", () => {
    it("should successfully get display stream", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);

      const result = await service.getDisplayMedia();

      expect(result).toBe(mockDisplayStream);
      expect(mockMediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        audio: false,
        video: true
      });
    });

    it("should register event listeners for stream end", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);

      await service.getDisplayMedia();

      expect(mockDisplayStream.addEventListener).toHaveBeenCalledWith(
        "inactive",
        expect.any(Function)
      );
      expect(mockVideoTrack.addEventListener).toHaveBeenCalledWith(
        "ended",
        expect.any(Function)
      );
    });

    it("should return null when user cancels screen sharing", async () => {
      mockMediaDevices.getDisplayMedia.mockRejectedValue(
        new Error("User cancelled")
      );

      const result = await service.getDisplayMedia();

      expect(result).toBeNull();
      expect(service.getDisplayStream()).toBeNull();
    });

    it("should stop existing display stream before getting new one", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);

      await service.getDisplayMedia();

      const newMockStream = { ...mockDisplayStream };
      mockMediaDevices.getDisplayMedia.mockResolvedValue(newMockStream);

      await service.getDisplayMedia();

      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(mockDisplayStream.removeTrack).toHaveBeenCalled();
    });
  });

  describe("hasAudioInput", () => {
    it("should return false when no audio stream exists", () => {
      expect(service.hasAudioInput()).toBe(false);
    });

    it("should return true when audio stream exists", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);

      await service.getUserAudio();

      expect(service.hasAudioInput()).toBe(true);
    });
  });

  describe("isDisplayActive", () => {
    it("should return false when no display stream exists", () => {
      expect(service.isDisplayActive()).toBe(false);
    });

    it("should return true when display stream is active", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);

      await service.getDisplayMedia();

      expect(service.isDisplayActive()).toBe(true);
    });

    it("should return false when stream is inactive", async () => {
      const inactiveStream = {
        ...mockDisplayStream,
        active: false
      };
      mockMediaDevices.getDisplayMedia.mockResolvedValue(inactiveStream);

      await service.getDisplayMedia();

      expect(service.isDisplayActive()).toBe(false);
    });
  });

  describe("toggleAudioTrack", () => {
    it("should enable audio tracks", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);
      await service.getUserAudio();

      service.toggleAudioTrack(true);

      expect(mockAudioTrack.enabled).toBe(true);
    });

    it("should disable audio tracks", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);
      await service.getUserAudio();

      service.toggleAudioTrack(false);

      expect(mockAudioTrack.enabled).toBe(false);
    });

    it("should do nothing when no audio stream exists", () => {
      expect(() => service.toggleAudioTrack(true)).not.toThrow();
    });
  });

  describe("toggleVideoTrack", () => {
    it("should enable video tracks", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);
      await service.getDisplayMedia();

      service.toggleVideoTrack(true);

      expect(mockVideoTrack.enabled).toBe(true);
    });

    it("should disable video tracks", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);
      await service.getDisplayMedia();

      service.toggleVideoTrack(false);

      expect(mockVideoTrack.enabled).toBe(false);
    });

    it("should do nothing when no display stream exists", () => {
      expect(() => service.toggleVideoTrack(true)).not.toThrow();
    });
  });

  describe("isAudioTrackActive", () => {
    it("should return false when no audio stream exists", () => {
      expect(service.isAudioTrackActive()).toBe(false);
    });

    it("should return true when audio track is enabled", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);
      await service.getUserAudio();

      expect(service.isAudioTrackActive()).toBe(true);
    });

    it("should return false when audio track is disabled", async () => {
      mockAudioTrack.enabled = false;
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);
      await service.getUserAudio();

      expect(service.isAudioTrackActive()).toBe(false);
    });
  });

  describe("isVideoTrackActive", () => {
    it("should return false when no display stream exists", () => {
      expect(service.isVideoTrackActive()).toBe(false);
    });

    it("should return true when video track is enabled", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);
      await service.getDisplayMedia();

      expect(service.isVideoTrackActive()).toBe(true);
    });

    it("should return false when video track is disabled", async () => {
      mockVideoTrack.enabled = false;
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);
      await service.getDisplayMedia();

      expect(service.isVideoTrackActive()).toBe(false);
    });
  });

  describe("stopAllTracks", () => {
    it("should stop both audio and display streams", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);

      await service.getUserAudio();
      await service.getDisplayMedia();

      service.stopAllTracks();

      expect(mockAudioTrack.stop).toHaveBeenCalled();
      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(service.getAudioStream()).toBeNull();
      expect(service.getDisplayStream()).toBeNull();
    });

    it("should handle null streams gracefully", () => {
      expect(() => service.stopAllTracks()).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should call stopAllTracks", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);
      await service.getUserAudio();

      service.cleanup();

      expect(mockAudioTrack.stop).toHaveBeenCalled();
      expect(service.getAudioStream()).toBeNull();
    });
  });

  describe("memory leak prevention", () => {
    it("should remove event listeners when stopping display stream", async () => {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);

      await service.getDisplayMedia();
      service.stopAllTracks();

      expect(mockDisplayStream.removeEventListener).toHaveBeenCalledWith(
        "inactive",
        expect.any(Function)
      );
      expect(mockVideoTrack.removeEventListener).toHaveBeenCalledWith(
        "ended",
        expect.any(Function)
      );
    });

    it("should clear property listeners when stopping tracks", async () => {
      mockMediaDevices.getUserMedia.mockResolvedValue(mockAudioStream);

      await service.getUserAudio();
      service.stopAllTracks();

      expect(mockAudioTrack.onended).toBeNull();
      expect(mockAudioTrack.onmute).toBeNull();
      expect(mockAudioTrack.onunmute).toBeNull();
    });
  });
});