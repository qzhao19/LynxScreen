import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DataChannelService } from "../../src/renderer/core/webrtc/data/index";
import { RemoteCursorState } from "../../src/shared/types/index";
import { DataChannelName } from "../../src/renderer/shared/types/index";

// Mock electron-log
vi.mock("electron-log", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

describe("DataChannelService", () => {
  let service: DataChannelService;
  let mockPeerConnection: RTCPeerConnection;
  let mockCursorPositionsChannel: RTCDataChannel;
  let mockCursorPingChannel: RTCDataChannel;

  const createMockDataChannel = (label: string): RTCDataChannel => {
    return {
      label,
      readyState: "open",
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null
    } as unknown as RTCDataChannel;
  };

  beforeEach(() => {
    service = new DataChannelService(false);

    mockCursorPositionsChannel = createMockDataChannel(DataChannelName.CURSOR_POSITIONS);
    mockCursorPingChannel = createMockDataChannel(DataChannelName.CURSOR_PING);

    mockPeerConnection = {
      createDataChannel: vi.fn((label: string) => {
        if (label === DataChannelName.CURSOR_POSITIONS) {
          return mockCursorPositionsChannel;
        }
        if (label === DataChannelName.CURSOR_PING) {
          return mockCursorPingChannel;
        }
        return createMockDataChannel(label);
      })
    } as unknown as RTCPeerConnection;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with isScreenSharer as false by default", () => {
      const defaultService = new DataChannelService();
      expect(defaultService.isCursorsEnabled()).toBe(false);
    });

    it("should initialize with isScreenSharer as true when specified", () => {
      const screensharerService = new DataChannelService(true);
      expect(screensharerService.isCursorsEnabled()).toBe(false);
    });
  });

  describe("createChannels", () => {
    it("should create cursor positions and ping channels", () => {
      service.createChannels(mockPeerConnection);

      expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith(
        DataChannelName.CURSOR_POSITIONS
      );
      expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith(
        DataChannelName.CURSOR_PING
      );
    });

    it("should setup event handlers on created channels", () => {
      service.createChannels(mockPeerConnection);

      expect(mockCursorPositionsChannel.onopen).not.toBeNull();
      expect(mockCursorPositionsChannel.onclose).not.toBeNull();
      expect(mockCursorPositionsChannel.onerror).not.toBeNull();
      expect(mockCursorPositionsChannel.onmessage).not.toBeNull();
    });
  });

  describe("handleIncomingChannel", () => {
    it("should setup cursor positions channel when received", () => {
      const incomingChannel = createMockDataChannel(DataChannelName.CURSOR_POSITIONS);

      service.handleIncomingChannel(incomingChannel);

      expect(incomingChannel.onopen).not.toBeNull();
      expect(incomingChannel.onmessage).not.toBeNull();
    });

    it("should setup cursor ping channel when received", () => {
      const incomingChannel = createMockDataChannel(DataChannelName.CURSOR_PING);

      service.handleIncomingChannel(incomingChannel);

      expect(incomingChannel.onopen).not.toBeNull();
      expect(incomingChannel.onmessage).not.toBeNull();
    });

    it("should ignore unknown channel labels", () => {
      const unknownChannel = createMockDataChannel("unknownChannel");

      service.handleIncomingChannel(unknownChannel);

      expect(unknownChannel.onopen).toBeNull();
      expect(unknownChannel.onmessage).toBeNull();
    });
  });

  describe("onCursorUpdate", () => {
    it("should call callback when Sharer receives cursor data (Sharer receives, Watcher sends)", () => {
      // Sharer (isScreenSharer=true) receives Watcher's cursor position
      const sharerService = new DataChannelService(true);
      const callback = vi.fn();
      sharerService.onCursorUpdate(callback);

      sharerService.createChannels(mockPeerConnection);
      sharerService.toggleCursors(true);

      const cursorData: RemoteCursorState = {
        id: "cursor-1",
        name: "TestUser",
        color: "#FF0000",
        x: 100,
        y: 200
      };

      const messageEvent = {
        data: JSON.stringify(cursorData)
      } as MessageEvent;

      mockCursorPositionsChannel.onmessage?.(messageEvent);

      expect(callback).toHaveBeenCalledWith(cursorData);
    });

    it("should NOT call callback when Watcher receives cursor data (Watcher sends, not receives)", () => {
      // Watcher (isScreenSharer=false) should NOT process incoming cursor data
      const watcherService = new DataChannelService(false);
      const callback = vi.fn();
      watcherService.onCursorUpdate(callback);
      watcherService.createChannels(mockPeerConnection);
      watcherService.toggleCursors(true);

      const cursorData: RemoteCursorState = {
        id: "cursor-1",
        name: "TestUser",
        color: "#FF0000",
        x: 100,
        y: 200
      };

      const messageEvent = {
        data: JSON.stringify(cursorData)
      } as MessageEvent;

      mockCursorPositionsChannel.onmessage?.(messageEvent);

      // Watcher only sends cursor data, does not receive
      expect(callback).not.toHaveBeenCalled();
    });

    it("should not call callback when cursors are disabled", () => {
      const sharerService = new DataChannelService(true);
      const callback = vi.fn();
      sharerService.onCursorUpdate(callback);
      sharerService.createChannels(mockPeerConnection);
      // cursors are disabled by default

      const messageEvent = {
        data: JSON.stringify({ id: "cursor-1", name: "Test", color: "#000", x: 0, y: 0 })
      } as MessageEvent;

      mockCursorPositionsChannel.onmessage?.(messageEvent);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not call callback when no callback is registered", () => {
      const sharerService = new DataChannelService(true);
      sharerService.createChannels(mockPeerConnection);
      sharerService.toggleCursors(true);

      const messageEvent = {
        data: JSON.stringify({ id: "cursor-1", name: "Test", color: "#000", x: 0, y: 0 })
      } as MessageEvent;

      expect(() => {
        mockCursorPositionsChannel.onmessage?.(messageEvent);
      }).not.toThrow();
    });
  });

  describe("onCursorPing", () => {
    it("should call ping callback for Watcher (ping is bidirectional)", () => {
      const watcherService = new DataChannelService(false);
      const callback = vi.fn();
      watcherService.onCursorPing(callback);

      watcherService.createChannels(mockPeerConnection);
      watcherService.toggleCursors(true);

      const messageEvent = {
        data: "cursor-1"
      } as MessageEvent;

      mockCursorPingChannel.onmessage?.(messageEvent);

      expect(callback).toHaveBeenCalledWith("cursor-1");
    });

    it("should call ping callback for Sharer (ping is bidirectional)", () => {
      const sharerService = new DataChannelService(true);
      const callback = vi.fn();
      sharerService.onCursorPing(callback);
      sharerService.createChannels(mockPeerConnection);
      sharerService.toggleCursors(true);

      const messageEvent = {
        data: "cursor-1"
      } as MessageEvent;

      mockCursorPingChannel.onmessage?.(messageEvent);

      // Ping is bidirectional, both roles should receive
      expect(callback).toHaveBeenCalledWith("cursor-1");
    });

    it("should not call ping callback when cursors are disabled", () => {
      const callback = vi.fn();
      service.onCursorPing(callback);
      service.createChannels(mockPeerConnection);
      // cursors disabled by default

      const messageEvent = {
        data: "cursor-1"
      } as MessageEvent;

      mockCursorPingChannel.onmessage?.(messageEvent);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("onChannelOpen", () => {
    it("should call callback when channel opens", () => {
      const callback = vi.fn();
      service.onChannelOpen(callback);
      service.createChannels(mockPeerConnection);

      // Simulate channel open
      mockCursorPositionsChannel.onopen?.(new Event("open"));

      expect(callback).toHaveBeenCalledWith(DataChannelName.CURSOR_POSITIONS);
    });
  });

  describe("onChannelClose", () => {
    it("should call callback when channel closes", () => {
      const callback = vi.fn();
      service.onChannelClose(callback);
      service.createChannels(mockPeerConnection);

      // Simulate channel close
      mockCursorPositionsChannel.onclose?.(new Event("close"));

      expect(callback).toHaveBeenCalledWith(DataChannelName.CURSOR_POSITIONS);
    });
  });

  describe("sendCursorUpdate", () => {
    it("should send cursor update successfully when cursors enabled and channel ready", () => {
      service.createChannels(mockPeerConnection);
      service.toggleCursors(true);

      const cursorData: RemoteCursorState = {
        id: "cursor-1",
        name: "TestUser",
        color: "#FF0000",
        x: 100,
        y: 200
      };

      const result = service.sendCursorUpdate(cursorData);

      expect(result).toBe(true);
      expect(mockCursorPositionsChannel.send).toHaveBeenCalledWith(JSON.stringify(cursorData));
    });

    it("should return false when cursors are disabled", () => {
      service.createChannels(mockPeerConnection);
      // cursors disabled by default

      const cursorData: RemoteCursorState = {
        id: "cursor-1",
        name: "TestUser",
        color: "#FF0000",
        x: 100,
        y: 200
      };

      const result = service.sendCursorUpdate(cursorData);

      expect(result).toBe(false);
      expect(mockCursorPositionsChannel.send).not.toHaveBeenCalled();
    });

    it("should return false when channel is not ready", () => {
      // Do not create channels
      service.toggleCursors(true);

      const cursorData: RemoteCursorState = {
        id: "cursor-1",
        name: "TestUser",
        color: "#FF0000",
        x: 100,
        y: 200
      };

      const result = service.sendCursorUpdate(cursorData);

      expect(result).toBe(false);
    });

    it("should return false when channel is closed", () => {
      service.createChannels(mockPeerConnection);
      service.toggleCursors(true);
      (mockCursorPositionsChannel as any).readyState = "closed";

      const cursorData: RemoteCursorState = {
        id: "cursor-1",
        name: "TestUser",
        color: "#FF0000",
        x: 100,
        y: 200
      };

      const result = service.sendCursorUpdate(cursorData);

      expect(result).toBe(false);
    });

    it("should return false and log error when send throws", () => {
      service.createChannels(mockPeerConnection);
      service.toggleCursors(true);
      (mockCursorPositionsChannel.send as any).mockImplementation(() => {
        throw new Error("Send failed");
      });

      const cursorData: RemoteCursorState = {
        id: "cursor-1",
        name: "TestUser",
        color: "#FF0000",
        x: 100,
        y: 200
      };

      const result = service.sendCursorUpdate(cursorData);

      expect(result).toBe(false);
    });
  });

  describe("sendCursorPing", () => {
    it("should send cursor ping successfully when cursors enabled and channel ready", () => {
      service.createChannels(mockPeerConnection);
      service.toggleCursors(true);

      const result = service.sendCursorPing("cursor-1");

      expect(result).toBe(true);
      expect(mockCursorPingChannel.send).toHaveBeenCalledWith("cursor-1");
    });

    it("should return false when cursors are disabled", () => {
      service.createChannels(mockPeerConnection);
      // cursors disabled by default

      const result = service.sendCursorPing("cursor-1");

      expect(result).toBe(false);
      expect(mockCursorPingChannel.send).not.toHaveBeenCalled();
    });

    it("should return false when channel is not ready", () => {
      service.toggleCursors(true);

      const result = service.sendCursorPing("cursor-1");

      expect(result).toBe(false);
    });

    it("should return false when send throws", () => {
      service.createChannels(mockPeerConnection);
      service.toggleCursors(true);
      (mockCursorPingChannel.send as any).mockImplementation(() => {
        throw new Error("Send failed");
      });

      const result = service.sendCursorPing("cursor-1");

      expect(result).toBe(false);
    });
  });

  describe("toggleCursors", () => {
    it("should enable cursors regardless of channel state (records user intent)", () => {
      // No channels created — should still record user intent
      const result = service.toggleCursors(true);

      expect(result).toBe(true);
      expect(service.isCursorsEnabled()).toBe(true);
    });

    it("should disable cursors", () => {
      service.toggleCursors(true);

      const result = service.toggleCursors(false);

      expect(result).toBe(false);
      expect(service.isCursorsEnabled()).toBe(false);
    });

    it("should enable cursors when channels are ready", () => {
      service.createChannels(mockPeerConnection);

      const result = service.toggleCursors(true);

      expect(result).toBe(true);
      expect(service.isCursorsEnabled()).toBe(true);
    });
  });

  describe("isCursorsEnabled", () => {
    it("should return false by default", () => {
      expect(service.isCursorsEnabled()).toBe(false);
    });

    it("should return true after enabling", () => {
      service.toggleCursors(true);

      expect(service.isCursorsEnabled()).toBe(true);
    });
  });

  describe("isCursorPositionsChannelReady", () => {
    it("should return false when channel does not exist", () => {
      expect(service.isCursorPositionsChannelReady()).toBe(false);
    });

    it("should return true when channel is open", () => {
      service.createChannels(mockPeerConnection);

      expect(service.isCursorPositionsChannelReady()).toBe(true);
    });

    it("should return false when channel is closed", () => {
      service.createChannels(mockPeerConnection)
      ;(mockCursorPositionsChannel as any).readyState = "closed";

      expect(service.isCursorPositionsChannelReady()).toBe(false);
    });
  });

  describe("isCursorPingChannelReady", () => {
    it("should return false when channel does not exist", () => {
      expect(service.isCursorPingChannelReady()).toBe(false);
    });

    it("should return true when channel is open", () => {
      service.createChannels(mockPeerConnection);

      expect(service.isCursorPingChannelReady()).toBe(true);
    });
  });

  describe("areAllChannelsReady", () => {
    it("should return false when no channels exist", () => {
      expect(service.areAllChannelsReady()).toBe(false);
    });

    it("should return true when all channels are open", () => {
      service.createChannels(mockPeerConnection);

      expect(service.areAllChannelsReady()).toBe(true);
    });

    it("should return false when one channel is closed", () => {
      service.createChannels(mockPeerConnection)
      ;(mockCursorPositionsChannel as any).readyState = "closed";

      expect(service.areAllChannelsReady()).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should close all channels and clear callbacks", () => {
      const openCallback = vi.fn();
      const closeCallback = vi.fn();
      const cursorCallback = vi.fn();
      const pingCallback = vi.fn();

      service.onChannelOpen(openCallback);
      service.onChannelClose(closeCallback);
      service.onCursorUpdate(cursorCallback);
      service.onCursorPing(pingCallback);
      service.createChannels(mockPeerConnection);
      service.toggleCursors(true);

      service.cleanup();

      expect(mockCursorPositionsChannel.close).toHaveBeenCalled();
      expect(mockCursorPingChannel.close).toHaveBeenCalled();
      expect(mockCursorPositionsChannel.onopen).toBeNull();
      expect(mockCursorPositionsChannel.onclose).toBeNull();
      expect(mockCursorPositionsChannel.onerror).toBeNull();
      expect(mockCursorPositionsChannel.onmessage).toBeNull();
      expect(service.isCursorsEnabled()).toBe(false);
      expect(service.isCursorPositionsChannelReady()).toBe(false);
      expect(service.isCursorPingChannelReady()).toBe(false);
    });

    it("should handle cleanup when channels are null", () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle invalid JSON in cursor update message", () => {
      // Use Sharer since only Sharer processes incoming cursor data
      const sharerService = new DataChannelService(true);
      const callback = vi.fn();
      sharerService.onCursorUpdate(callback);
      sharerService.createChannels(mockPeerConnection);
      sharerService.toggleCursors(true);

      const messageEvent = {
        data: "invalid json"
      } as MessageEvent;

      expect(() => {
        mockCursorPositionsChannel.onmessage?.(messageEvent);
      }).not.toThrow();

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle channel error event", () => {
      service.createChannels(mockPeerConnection);

      const errorEvent = new Event("error");

      expect(() => {
        mockCursorPositionsChannel.onerror?.(errorEvent as RTCErrorEvent);
      }).not.toThrow();
    });
  });

  describe("role-based behavior", () => {
    describe("sharer role (isScreenSharer=true)", () => {
      let sharerService: DataChannelService;

      beforeEach(() => {
        sharerService = new DataChannelService(true);
      });

      it("should process incoming cursor updates (Sharer receives Watcher cursor)", () => {
        const callback = vi.fn();
        sharerService.onCursorUpdate(callback);
        sharerService.createChannels(mockPeerConnection);
        sharerService.toggleCursors(true);

        const cursorData: RemoteCursorState = {
          id: "cursor-1",
          name: "TestUser",
          color: "#FF0000",
          x: 100,
          y: 200
        };

        const messageEvent = {
          data: JSON.stringify(cursorData)
        } as MessageEvent;

        mockCursorPositionsChannel.onmessage?.(messageEvent);

        expect(callback).toHaveBeenCalledWith(cursorData);
      });

      it("should process incoming cursor ping (ping is bidirectional)", () => {
        const callback = vi.fn();
        sharerService.onCursorPing(callback);
        sharerService.createChannels(mockPeerConnection);
        sharerService.toggleCursors(true);

        const messageEvent = {
          data: "cursor-1"
        } as MessageEvent;

        mockCursorPingChannel.onmessage?.(messageEvent);

        expect(callback).toHaveBeenCalledWith("cursor-1");
      });
    });

    describe("watcher role (isScreenSharer=false)", () => {
      let watcherService: DataChannelService;

      beforeEach(() => {
        watcherService = new DataChannelService(false);
      });

      it("should NOT process incoming cursor updates (Watcher sends, not receives)", () => {
        const callback = vi.fn();
        watcherService.onCursorUpdate(callback);
        watcherService.createChannels(mockPeerConnection);
        watcherService.toggleCursors(true);

        const cursorData: RemoteCursorState = {
          id: "cursor-1",
          name: "TestUser",
          color: "#FF0000",
          x: 100,
          y: 200
        };

        const messageEvent = {
          data: JSON.stringify(cursorData)
        } as MessageEvent;

        mockCursorPositionsChannel.onmessage?.(messageEvent);

        expect(callback).not.toHaveBeenCalled();
      });

      it("should process incoming cursor ping (ping is bidirectional)", () => {
        const callback = vi.fn();
        watcherService.onCursorPing(callback);
        watcherService.createChannels(mockPeerConnection);
        watcherService.toggleCursors(true);

        const messageEvent = {
          data: "cursor-1"
        } as MessageEvent;

        mockCursorPingChannel.onmessage?.(messageEvent);

        expect(callback).toHaveBeenCalledWith("cursor-1");
      });

      it("should be able to send cursor update", () => {
        watcherService.createChannels(mockPeerConnection);
        watcherService.toggleCursors(true);

        const cursorData: RemoteCursorState = {
          id: "cursor-1",
          name: "TestUser",
          color: "#FF0000",
          x: 100,
          y: 200
        };

        const result = watcherService.sendCursorUpdate(cursorData);

        expect(result).toBe(true);
      });
    });
  });
});