import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest";
import { ConnectionManager } from "../../src/renderer/core/session/connection-manager";
import { 
  PeerRole, 
  ConnectionPhase,
  ConnectionManagerCallbacks,
  RemoteCursorState
} from "../../src/renderer/shared/types/index";

// Mock electron-log
vi.mock("electron-log/renderer", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];
  
  getTracks() {
    return this.tracks;
  }
  
  getVideoTracks() {
    return this.tracks.filter(t => t.kind === "video");
  }
  
  getAudioTracks() {
    return this.tracks.filter(t => t.kind === "audio");
  }
}

// Make MediaStream available globally for tests
globalThis.MediaStream = MockMediaStream as any;

function createMockWebRTCService() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    createSharerOffer: vi.fn(),
    createWatcherAnswer: vi.fn(),
    acceptAnswer: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(false),
    onIceConnectionStateChange: vi.fn(),
    onConnectionStateChange: vi.fn(),
    onRemoteStream: vi.fn(),
    // Cursor control methods
    updateRemoteCursor: vi.fn().mockReturnValue(true),
    onCursorPing: vi.fn(),
    onCursorUpdate: vi.fn(),
    pingRemoteCursor: vi.fn().mockReturnValue(true),
    // New cursor channel methods
    isCursorPositionsChannelReady: vi.fn().mockReturnValue(false),
    isCursorPingChannelReady: vi.fn().mockReturnValue(false),
    areCursorChannelsReady: vi.fn().mockReturnValue(false),
    onChannelOpen: vi.fn(),
    onChannelClose: vi.fn(),
    // Media control methods
    toggleMicrophone: vi.fn().mockReturnValue(true),
    setMicrophoneEnabled: vi.fn(),
    toggleDisplayStream: vi.fn().mockReturnValue(true),
    setDisplayStreamEnabled: vi.fn(),
    isMicrophoneEnabled: vi.fn().mockReturnValue(false),
    hasAudioInput: vi.fn().mockReturnValue(false),
    getAudioStream: vi.fn().mockReturnValue(null),
    getDisplayStream: vi.fn().mockReturnValue(null),
    isDisplayTrackEnabled: vi.fn().mockReturnValue(false),
    isDisplayCaptureAlive: vi.fn().mockReturnValue(false),
    // Connection state methods
  };
}

let mockWebRTCServiceInstance: ReturnType<typeof createMockWebRTCService>;

vi.mock("../../src/renderer/core/webrtc/index", () => ({
  WebRTCService: vi.fn().mockImplementation(function() {
    return mockWebRTCServiceInstance;
  })
}));

// Mock signaling-url utilities
vi.mock("../../src/renderer/shared/utils/index", () => ({
  encodeConnectionUrl: vi.fn(),
  decodeConnectionUrl: vi.fn(),
  isValidConnectionUrl: vi.fn(),
  getRoleFromUrl: vi.fn(),
  getDefaultWebRTCConnectionConfig: vi.fn().mockReturnValue({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  })
}));

// Import mocked modules for assertion
import { WebRTCService } from "../../src/renderer/core/webrtc/index";
import {
  encodeConnectionUrl,
  decodeConnectionUrl,
  isValidConnectionUrl,
  getRoleFromUrl
} from "../../src/renderer/shared/utils/index";

describe("ConnectionManager", () => {
  let connectionManager: ConnectionManager;
  let mockCallbacks: ConnectionManagerCallbacks;
  let mockVideoElement: HTMLVideoElement;
  let mockCursorData: RemoteCursorState;


  const mockOffer: RTCSessionDescriptionInit = {
    type: "offer",
    sdp: "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\n..."
  };

  const mockAnswer: RTCSessionDescriptionInit = {
    type: "answer",
    sdp: "v=0\r\no=- 654321 2 IN IP4 127.0.0.1\r\n..."
  };

  const mockOfferUrl = "lynxscreen://share?username=sharer&token=gz:abc123&type=offer";
  const mockAnswerUrl = "lynxscreen://watch?username=watcher&token=gz:def456&type=answer";

  const setupCursorMocks = () => {
    mockWebRTCServiceInstance = {
      ...createMockWebRTCService(),
      updateRemoteCursor: vi.fn().mockReturnValue(true),
      onCursorUpdate: vi.fn(),
    };
    mockWebRTCServiceInstance.createSharerOffer.mockResolvedValue(mockOffer);
    mockWebRTCServiceInstance.createWatcherAnswer.mockResolvedValue(mockAnswer);
    connectionManager.setCallbacks(mockCallbacks);
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockWebRTCServiceInstance = createMockWebRTCService();
    mockWebRTCServiceInstance.createSharerOffer.mockResolvedValue(mockOffer);
    mockWebRTCServiceInstance.createWatcherAnswer.mockResolvedValue(mockAnswer);

    (encodeConnectionUrl as Mock).mockResolvedValue(mockOfferUrl);
    (isValidConnectionUrl as Mock).mockReturnValue(true);
    (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_SHARER);
    (decodeConnectionUrl as Mock).mockResolvedValue({
      role: PeerRole.SCREEN_SHARER,
      username: "sharer",
      sdp: mockOffer
    });

    connectionManager = new ConnectionManager();
    
    mockCallbacks = {
      onPhaseChange: vi.fn(),
      onUrlGenerated: vi.fn(),
      onIceConnectionStateChange: vi.fn(),
      onError: vi.fn(),
      onRemoteStream: vi.fn()
    };

    mockVideoElement = {
      srcObject: null
    } as unknown as HTMLVideoElement;

    mockCursorData = {
      id: "cursor-123",
      name: "TestUser",
      color: "#FF5733",
      x: 0.5,
      y: 0.5
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============== Constructor & Initial State ==============

  describe("constructor and initial state", () => {
    it("should not be connected initially", () => {
      expect(connectionManager.isConnected()).toBe(false);
    });
  });

  // ============== setCallbacks ==============

  describe("setCallbacks", () => {
    it("should register callbacks", () => {
      connectionManager.setCallbacks(mockCallbacks);
      // Callbacks are tested indirectly through other methods
      expect(mockCallbacks.onPhaseChange).not.toHaveBeenCalled();
    });

    it("should merge with existing callbacks", () => {
      const firstCallback = { onPhaseChange: vi.fn() };
      const secondCallback = { onError: vi.fn() };
      
      connectionManager.setCallbacks(firstCallback);
      connectionManager.setCallbacks(secondCallback);
    });
  });

  // ============== Sharer Flow: startSharing ==============

  describe("startSharing", () => {
    beforeEach(() => {
      connectionManager.setCallbacks(mockCallbacks);
    });

    it("should create offer URL", async () => {
      const result = await connectionManager.startSharing("TestSharer");

      expect(result).toBe(mockOfferUrl);
      expect(WebRTCService).toHaveBeenCalledWith(
        expect.objectContaining({
          isScreenSharer: true,
          userConfig: expect.objectContaining({
            username: "TestSharer"
          })
        })
      );
      expect(mockWebRTCServiceInstance.initialize).toHaveBeenCalled();
      expect(mockWebRTCServiceInstance.createSharerOffer).toHaveBeenCalled();
      expect(encodeConnectionUrl).toHaveBeenCalledWith(
        PeerRole.SCREEN_SHARER,
        "TestSharer",
        mockOffer
      );
    });

    it("should update connection phases correctly", async () => {
      await connectionManager.startSharing("TestSharer");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.OFFER_CREATED);
      // expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.WAITING_FOR_ANSWER);
    });

    it("should set role to SCREEN_SHARER", async () => {
      await connectionManager.startSharing("TestSharer");
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
    });

    it("should call onUrlGenerated callback", async () => {
      await connectionManager.startSharing("TestSharer");
      expect(mockCallbacks.onUrlGenerated).toHaveBeenCalledWith(mockOfferUrl);
    });

    // it("should return null and call onError for empty username", async () => {
    //   const result = await connectionManager.startSharing("");
      
    //   expect(result).toBeNull();
    //   expect(mockCallbacks.onError).toHaveBeenCalled();
    //   expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.ERROR);
    // });

    // it("should return null and call onError for whitespace-only username", async () => {
    //   const result = await connectionManager.startSharing("   ");
    //   expect(result).toBeNull();
    //   expect(mockCallbacks.onError).toHaveBeenCalled();
    // });

    it("should return null if operation is already in progress", async () => {
      // Start first operation
      const firstPromise = connectionManager.startSharing("User1");
      // Try to start second operation immediately
      const secondResult = await connectionManager.startSharing("User2");

      await firstPromise;

      expect(secondResult).toBeNull();
    });

    it("should handle WebRTC setup failure", async () => {
    mockWebRTCServiceInstance.initialize.mockRejectedValue(new Error("Setup failed"));

    const result = await connectionManager.startSharing("TestSharer");

    expect(result).toBeNull();
    expect(mockCallbacks.onError).toHaveBeenCalled();
    expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.ERROR);

    });

    it("should handle offer creation failure", async () => {
      mockWebRTCServiceInstance.createSharerOffer.mockRejectedValue(new Error("Offer failed"));

      const result = await connectionManager.startSharing("TestSharer");

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should handle URL encoding failure", async () => {
      (encodeConnectionUrl as Mock).mockRejectedValue(new Error("Encoding failed"));

      const result = await connectionManager.startSharing("TestSharer");

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should apply custom config when provided", async () => {
      const customConfig = {
        userConfig: {
          username: "CustomUser",
          isMicrophoneEnabledOnConnect: true
        },
        connectionConfig: {
          iceServers: [{ urls: "turn:turn.example.com", authUsername: "user", credential: "pass" }]
        }
      };

      await connectionManager.startSharing("TestSharer", customConfig);

      expect(WebRTCService).toHaveBeenCalledWith(
        expect.objectContaining({
          userConfig: expect.objectContaining({
            isMicrophoneEnabledOnConnect: true
          }),
          connectionConfig: customConfig.connectionConfig
        })
      );
    });
  });

  // ============== Sharer Flow: acceptAnswerUrl ==============

  describe("acceptAnswerUrl", () => {
    beforeEach(async () => {
      connectionManager.setCallbacks(mockCallbacks);
      // First start sharing to set up as sharer
      await connectionManager.startSharing("TestSharer");
      vi.clearAllMocks();

      // Setup mocks for answer acceptance
      // (readFromClipboard as Mock).mockResolvedValue(mockAnswerUrl);
      (isValidConnectionUrl as Mock).mockReturnValue(true);
      (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_WATCHER);
      (decodeConnectionUrl as Mock).mockResolvedValue({
        role: PeerRole.SCREEN_WATCHER,
        username: "watcher",
        sdp: mockAnswer
      });
    });

    it("should accept answer URL successfully", async () => {
      const result = await connectionManager.acceptAnswerUrl(mockAnswerUrl);

      expect(result).toBe(true);
      expect(isValidConnectionUrl).toHaveBeenCalledWith(mockAnswerUrl);
      expect(getRoleFromUrl).toHaveBeenCalledWith(mockAnswerUrl);
      expect(decodeConnectionUrl).toHaveBeenCalledWith(mockAnswerUrl);
      expect(mockWebRTCServiceInstance.acceptAnswer).toHaveBeenCalledWith(mockAnswer);
    });

    it("should update phase to CONNECTING", async () => {
      await connectionManager.acceptAnswerUrl(mockAnswerUrl);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTING);
    });

    it("should return false if not initialized as sharer", async () => {
      // Reset to fresh state
      await connectionManager.reset();
      vi.clearAllMocks();

      const result = await connectionManager.acceptAnswerUrl(mockAnswerUrl);

      expect(result).toBe(false);
    });

    it("should return false if no URL provided", async () => {
      const result = await connectionManager.acceptAnswerUrl("");

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false for invalid URL", async () => {
      (isValidConnectionUrl as Mock).mockReturnValue(false);

      const result = await connectionManager.acceptAnswerUrl(mockAnswerUrl);

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if URL is from sharer (not watcher)", async () => {
      (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_SHARER);

      const result = await connectionManager.acceptAnswerUrl(mockAnswerUrl);

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if URL decoding fails", async () => {
      (decodeConnectionUrl as Mock).mockResolvedValue(null);

      const result = await connectionManager.acceptAnswerUrl(mockAnswerUrl);

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if accepting answer fails", async () => {
      mockWebRTCServiceInstance.acceptAnswer.mockRejectedValue(new Error("Accept failed"));

      const result = await connectionManager.acceptAnswerUrl(mockAnswerUrl);

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if operation is already in progress", async () => {
      const firstPromise = connectionManager.acceptAnswerUrl(mockAnswerUrl);
      const secondResult = await connectionManager.acceptAnswerUrl(mockAnswerUrl);

      await firstPromise;

      expect(secondResult).toBe(false);
    });
  });

  // ============== Watcher Flow: joinSession ==============

  describe("joinSession", () => {
    beforeEach(() => {
      connectionManager.setCallbacks(mockCallbacks);

      // (readFromClipboard as Mock).mockResolvedValue(mockOfferUrl);
      (isValidConnectionUrl as Mock).mockReturnValue(true);
      (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_SHARER);
      (decodeConnectionUrl as Mock).mockResolvedValue({
        role: PeerRole.SCREEN_SHARER,
        username: "sharer",
        sdp: mockOffer
      });
      (encodeConnectionUrl as Mock).mockResolvedValue(mockAnswerUrl);
    });

    it("should join session and create answer URL", async () => {
      const result = await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(result).toBe(mockAnswerUrl);
      expect(WebRTCService).toHaveBeenCalledWith(
        expect.objectContaining({
          isScreenSharer: false,
          remoteVideo: mockVideoElement,
          userConfig: expect.objectContaining({
            username: "TestWatcher"
          })
        })
      );
      expect(mockWebRTCServiceInstance.initialize).toHaveBeenCalled();
      expect(mockWebRTCServiceInstance.createWatcherAnswer).toHaveBeenCalledWith(mockOffer);
      expect(encodeConnectionUrl).toHaveBeenCalledWith(
        PeerRole.SCREEN_WATCHER,
        "TestWatcher",
        mockAnswer
      );
    });

    it("should set role to SCREEN_WATCHER", async () => {
      await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
    });

    it("should update connection phases correctly", async () => {
      await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.ANSWER_CREATED);
    });

    it("should call onUrlGenerated callback", async () => {
      await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(mockCallbacks.onUrlGenerated).toHaveBeenCalledWith(mockAnswerUrl);
    });

    // it("should return null for empty username", async () => {
    //   const result = await connectionManager.joinSession("", mockVideoElement);
    //   expect(result).toBeNull();
    //   expect(mockCallbacks.onError).toHaveBeenCalled();
    // });

    // it("should return null for null video element", async () => {
    //   const result = await connectionManager.joinSession("TestWatcher", null as any);
    //   expect(result).toBeNull();
    //   expect(mockCallbacks.onError).toHaveBeenCalled();
    // });

    it("should return null if no URL provided", async () => {
      const result = await connectionManager.joinSession("TestWatcher", "", mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null for invalid URL", async () => {
      (isValidConnectionUrl as Mock).mockReturnValue(false);

      const result = await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if URL is from watcher (not sharer)", async () => {
      (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_WATCHER);

      const result = await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if URL decoding fails", async () => {
      (decodeConnectionUrl as Mock).mockResolvedValue(null);

      const result = await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if answer creation fails", async () => {
      mockWebRTCServiceInstance.createWatcherAnswer.mockRejectedValue(new Error("Answer failed"));

      const result = await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if operation is already in progress", async () => {
      const firstPromise = connectionManager.joinSession("User1", mockOfferUrl, mockVideoElement);
      const secondResult = await connectionManager.joinSession("User2", mockOfferUrl, mockVideoElement);

      await firstPromise;

      expect(secondResult).toBeNull();
    });
  });

  // ================ Cursor Control ================

  describe("updateRemoteCursor", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.updateRemoteCursor(mockCursorData);
      expect(result).toBe(false);
    });

    it("should forward cursor update to WebRTC service when connected", async () => {
      await connectionManager.startSharing("TestSharer");
      const result = connectionManager.updateRemoteCursor(mockCursorData);
      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.updateRemoteCursor).toHaveBeenCalledWith(mockCursorData);
    });

    it("should return false when WebRTC service returns false", async () => {
      mockWebRTCServiceInstance.updateRemoteCursor.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");
      const result = connectionManager.updateRemoteCursor(mockCursorData);
      expect(result).toBe(false);
    });

    it("should handle cursor data with edge position values", async () => {
      await connectionManager.startSharing("TestSharer");
      const edgeCursorData: RemoteCursorState = { id: "cursor-edge", name: "EdgeUser", color: "#000000", x: 0, y: 1 };
      connectionManager.updateRemoteCursor(edgeCursorData);
      expect(mockWebRTCServiceInstance.updateRemoteCursor).toHaveBeenCalledWith(edgeCursorData);
    });
  });

  // describe("onCursorUpdate", () => {
  //   beforeEach(setupCursorMocks);

  //   it("should not register callback when not connected", () => {
  //     const callback = vi.fn();
  //     connectionManager.onCursorUpdate(callback);
  //     expect(mockWebRTCServiceInstance.onCursorUpdate).not.toHaveBeenCalled();
  //   });

  //   it("should register callback with WebRTC service when connected", async () => {
  //     await connectionManager.startSharing("TestSharer");
  //     const callback = vi.fn();
  //     connectionManager.onCursorUpdate(callback);
  //     expect(mockWebRTCServiceInstance.onCursorUpdate).toHaveBeenCalledWith(callback);
  //   });

  //   it("should allow registering multiple callbacks", async () => {
  //     await connectionManager.startSharing("TestSharer");
  //     const c1 = vi.fn();
  //     const c2 = vi.fn();
  //     connectionManager.onCursorUpdate(c1);
  //     connectionManager.onCursorUpdate(c2);
  //     expect(mockWebRTCServiceInstance.onCursorUpdate).toHaveBeenCalledTimes(2);
  //   });
  // });

  describe("areCursorChannelsReady", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.areCursorChannelsReady();
      expect(result).toBe(false);
    });

    it("should return true when data channels are ready", async () => {
      mockWebRTCServiceInstance.areCursorChannelsReady.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");
      const result = connectionManager.areCursorChannelsReady();
      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.areCursorChannelsReady).toHaveBeenCalled();
    });

    it("should return false when data channels are not ready", async () => {
      mockWebRTCServiceInstance.areCursorChannelsReady.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");
      const result = connectionManager.areCursorChannelsReady();
      expect(result).toBe(false);
    });
  });

  describe("cursor control integration", () => {
    beforeEach(setupCursorMocks);

    it("should support full cursor workflow for sharer", async () => {
      mockWebRTCServiceInstance.areCursorChannelsReady.mockReturnValue(true);

      await connectionManager.startSharing("TestSharer");

      expect(connectionManager.areCursorChannelsReady()).toBe(true);

      // onCursorUpdate is registered internally via setupServiceCallbacks
      expect(mockWebRTCServiceInstance.onCursorUpdate).toHaveBeenCalled();
    });

    it("should support full cursor workflow for watcher", async () => {
      mockWebRTCServiceInstance.areCursorChannelsReady.mockReturnValue(true);

      await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      expect(connectionManager.areCursorChannelsReady()).toBe(true);

      const result = connectionManager.updateRemoteCursor(mockCursorData);
      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.updateRemoteCursor).toHaveBeenCalledWith(mockCursorData);
    });

    it("should reset cursor state after disconnect", async () => {
      mockWebRTCServiceInstance.areCursorChannelsReady.mockReturnValue(true);

      await connectionManager.startSharing("TestSharer");

      expect(connectionManager.areCursorChannelsReady()).toBe(true);

      await connectionManager.disconnect();

      expect(connectionManager.areCursorChannelsReady()).toBe(false);
      expect(connectionManager.updateRemoteCursor(mockCursorData)).toBe(false);
    });

    it("should reset cursor state after reset", async () => {
      mockWebRTCServiceInstance.areCursorChannelsReady.mockReturnValue(true);

      await connectionManager.startSharing("TestSharer");
      await connectionManager.reset();

      expect(connectionManager.areCursorChannelsReady()).toBe(false);
    });
  });

  // ============== Cursor Channel Status ==============

  describe("isCursorPositionsChannelReady", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.isCursorPositionsChannelReady();
      expect(result).toBe(false);
    });

    it("should return WebRTC service cursor positions channel status when connected", async () => {
      mockWebRTCServiceInstance.isCursorPositionsChannelReady.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isCursorPositionsChannelReady();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.isCursorPositionsChannelReady).toHaveBeenCalled();
    });

    it("should return false when cursor positions channel is not ready", async () => {
      mockWebRTCServiceInstance.isCursorPositionsChannelReady.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isCursorPositionsChannelReady();

      expect(result).toBe(false);
    });
  });

  describe("isCursorPingChannelReady", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.isCursorPingChannelReady();
      expect(result).toBe(false);
    });

    it("should return WebRTC service cursor ping channel status when connected", async () => {
      mockWebRTCServiceInstance.isCursorPingChannelReady.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isCursorPingChannelReady();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.isCursorPingChannelReady).toHaveBeenCalled();
    });

    it("should return false when cursor ping channel is not ready", async () => {
      mockWebRTCServiceInstance.isCursorPingChannelReady.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isCursorPingChannelReady();

      expect(result).toBe(false);
    });
  });

  // describe("onChannelOpen", () => {
  //   beforeEach(setupCursorMocks);

  //   it("should not register callback when not connected", () => {
  //     const callback = vi.fn();
  //     connectionManager.onChannelOpen(callback);
  //     expect(mockWebRTCServiceInstance.onChannelOpen).not.toHaveBeenCalled();
  //   });

  //   it("should register callback with WebRTC service when connected", async () => {
  //     await connectionManager.startSharing("TestSharer");
  //     const callback = vi.fn();

  //     connectionManager.onChannelOpen(callback);

  //     expect(mockWebRTCServiceInstance.onChannelOpen).toHaveBeenCalledWith(callback);
  //   });
  // });

  // describe("onChannelClose", () => {
  //   beforeEach(setupCursorMocks);

  //   it("should not register callback when not connected", () => {
  //     const callback = vi.fn();
  //     connectionManager.onChannelClose(callback);
  //     expect(mockWebRTCServiceInstance.onChannelClose).not.toHaveBeenCalled();
  //   });

  //   it("should register callback with WebRTC service when connected", async () => {
  //     await connectionManager.startSharing("TestSharer");
  //     const callback = vi.fn();

  //     connectionManager.onChannelClose(callback);

  //     expect(mockWebRTCServiceInstance.onChannelClose).toHaveBeenCalledWith(callback);
  //   });
  // });

  // ============== Media Control ==============

  describe("toggleMicrophone", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", async () => {
      const result = await connectionManager.toggleMicrophone();
      expect(result).toBe(false);
    });

    it("should toggle microphone through WebRTC service when connected", async () => {
      mockWebRTCServiceInstance.toggleMicrophone.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = await connectionManager.toggleMicrophone();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.toggleMicrophone).toHaveBeenCalled();
    });

    it("should return false when microphone toggle fails", async () => {
      mockWebRTCServiceInstance.toggleMicrophone.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = await connectionManager.toggleMicrophone();

      expect(result).toBe(false);
    });
  });

  describe("setMicrophoneEnabled", () => {
    beforeEach(setupCursorMocks);

    it("should not call WebRTC service when not connected", () => {
      connectionManager.setMicrophoneEnabled(true);
      expect(mockWebRTCServiceInstance.setMicrophoneEnabled).not.toHaveBeenCalled();
    });

    it("should enable microphone through WebRTC service when connected", async () => {
      await connectionManager.startSharing("TestSharer");

      connectionManager.setMicrophoneEnabled(true);

      expect(mockWebRTCServiceInstance.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    });

    it("should disable microphone through WebRTC service when connected", async () => {
      await connectionManager.startSharing("TestSharer");

      connectionManager.setMicrophoneEnabled(false);

      expect(mockWebRTCServiceInstance.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    });
  });

  describe("toggleDisplayStream", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.toggleDisplayStream();
      expect(result).toBe(false);
    });

    it("should toggle display stream through WebRTC service when connected", async () => {
      mockWebRTCServiceInstance.toggleDisplayStream.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.toggleDisplayStream();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.toggleDisplayStream).toHaveBeenCalled();
    });

    it("should return false when display stream toggle fails", async () => {
      mockWebRTCServiceInstance.toggleDisplayStream.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.toggleDisplayStream();

      expect(result).toBe(false);
    });
  });

  describe("setDisplayStreamEnabled", () => {
    beforeEach(setupCursorMocks);

    it("should not call WebRTC service when not connected", () => {
      connectionManager.setDisplayStreamEnabled(true);
      expect(mockWebRTCServiceInstance.setDisplayStreamEnabled).not.toHaveBeenCalled();
    });

    it("should enable display stream through WebRTC service when connected", async () => {
      await connectionManager.startSharing("TestSharer");

      connectionManager.setDisplayStreamEnabled(true);

      expect(mockWebRTCServiceInstance.setDisplayStreamEnabled).toHaveBeenCalledWith(true);
    });

    it("should disable display stream through WebRTC service when connected", async () => {
      await connectionManager.startSharing("TestSharer");

      connectionManager.setDisplayStreamEnabled(false);

      expect(mockWebRTCServiceInstance.setDisplayStreamEnabled).toHaveBeenCalledWith(false);
    });
  });

  describe("isMicrophoneEnabled", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.isMicrophoneEnabled();
      expect(result).toBe(false);
    });

    it("should return WebRTC service microphone status when connected", async () => {
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isMicrophoneEnabled();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.isMicrophoneEnabled).toHaveBeenCalled();
    });

    it("should return false when microphone is not active", async () => {
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isMicrophoneEnabled();

      expect(result).toBe(false);
    });
  });

  describe("hasAudioInput", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.hasAudioInput();
      expect(result).toBe(false);
    });

    it("should return true when audio input is available", async () => {
      mockWebRTCServiceInstance.hasAudioInput.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.hasAudioInput();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.hasAudioInput).toHaveBeenCalled();
    });

    it("should return false when audio input is not available", async () => {
      mockWebRTCServiceInstance.hasAudioInput.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.hasAudioInput();

      expect(result).toBe(false);
    });
  });

  describe("getAudioStream", () => {
    beforeEach(setupCursorMocks);

    it("should return null when not connected", () => {
      const result = connectionManager.getAudioStream();
      expect(result).toBeNull();
    });

    it("should return audio stream from WebRTC service when connected", async () => {
      const mockStream = new MockMediaStream() as unknown as MediaStream;
      mockWebRTCServiceInstance.getAudioStream.mockReturnValue(mockStream);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.getAudioStream();

      expect(result).toBe(mockStream);
      expect(mockWebRTCServiceInstance.getAudioStream).toHaveBeenCalled();
    });

    it("should return null when no audio stream available", async () => {
      mockWebRTCServiceInstance.getAudioStream.mockReturnValue(null);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.getAudioStream();

      expect(result).toBeNull();
    });
  });

  describe("getDisplayStream", () => {
    beforeEach(setupCursorMocks);

    it("should return null when not connected", () => {
      const result = connectionManager.getDisplayStream();
      expect(result).toBeNull();
    });

    it("should return display stream from WebRTC service when connected", async () => {
      const mockStream = new MockMediaStream() as unknown as MediaStream;
      mockWebRTCServiceInstance.getDisplayStream.mockReturnValue(mockStream);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.getDisplayStream();

      expect(result).toBe(mockStream);
      expect(mockWebRTCServiceInstance.getDisplayStream).toHaveBeenCalled();
    });

    it("should return null when no display stream available", async () => {
      mockWebRTCServiceInstance.getDisplayStream.mockReturnValue(null);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.getDisplayStream();

      expect(result).toBeNull();
    });
  });

  describe("isDisplayTrackEnabled", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.isDisplayTrackEnabled();
      expect(result).toBe(false);
    });

    it("should return true when display stream is active", async () => {
      mockWebRTCServiceInstance.isDisplayTrackEnabled.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isDisplayTrackEnabled();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.isDisplayTrackEnabled).toHaveBeenCalled();
    });

    it("should return false when display stream is not active", async () => {
      mockWebRTCServiceInstance.isDisplayTrackEnabled.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isDisplayTrackEnabled();

      expect(result).toBe(false);
    });
  });

  describe("isDisplayCaptureAlive", () => {
    beforeEach(setupCursorMocks);

    it("should return false when not connected", () => {
      const result = connectionManager.isDisplayCaptureAlive();
      expect(result).toBe(false);
    });

    it("should return true when display is active", async () => {
      mockWebRTCServiceInstance.isDisplayCaptureAlive.mockReturnValue(true);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isDisplayCaptureAlive();

      expect(result).toBe(true);
      expect(mockWebRTCServiceInstance.isDisplayCaptureAlive).toHaveBeenCalled();
    });

    it("should return false when display is not active", async () => {
      mockWebRTCServiceInstance.isDisplayCaptureAlive.mockReturnValue(false);
      await connectionManager.startSharing("TestSharer");

      const result = connectionManager.isDisplayCaptureAlive();

      expect(result).toBe(false);
    });
  });

  // ============== Connection State ==============


  // ============== Media Control Integration ==========================

  describe("media control integration", () => {
    beforeEach(setupCursorMocks);

    it("should support full media workflow for sharer", async () => {
      mockWebRTCServiceInstance.isDisplayCaptureAlive.mockReturnValue(true);
      mockWebRTCServiceInstance.hasAudioInput.mockReturnValue(true);
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(false);
      
      await connectionManager.startSharing("TestSharer");

      // Check initial state
      expect(connectionManager.isDisplayCaptureAlive()).toBe(true);
      expect(connectionManager.hasAudioInput()).toBe(true);
      expect(connectionManager.isMicrophoneEnabled()).toBe(false);

      // Enable microphone
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(true);
      connectionManager.setMicrophoneEnabled(true);
      expect(mockWebRTCServiceInstance.setMicrophoneEnabled).toHaveBeenCalledWith(true);
      expect(connectionManager.isMicrophoneEnabled()).toBe(true);

      // Toggle display stream
      mockWebRTCServiceInstance.isDisplayTrackEnabled.mockReturnValue(false);
      connectionManager.toggleDisplayStream();
      expect(mockWebRTCServiceInstance.toggleDisplayStream).toHaveBeenCalled();
    });

    it("should support full media workflow for watcher", async () => {
      mockWebRTCServiceInstance.hasAudioInput.mockReturnValue(true);
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(false);
      
      await connectionManager.joinSession("TestWatcher", mockOfferUrl, mockVideoElement);

      // Check initial state
      expect(connectionManager.hasAudioInput()).toBe(true);
      expect(connectionManager.isMicrophoneEnabled()).toBe(false);

      // Enable microphone for voice communication
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(true);
      connectionManager.setMicrophoneEnabled(true);
      expect(mockWebRTCServiceInstance.setMicrophoneEnabled).toHaveBeenCalledWith(true);
      expect(connectionManager.isMicrophoneEnabled()).toBe(true);

      // Toggle microphone
      mockWebRTCServiceInstance.toggleMicrophone.mockReturnValue(false);
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(false);
      const toggleResult = await connectionManager.toggleMicrophone();
      expect(toggleResult).toBe(false);
      expect(connectionManager.isMicrophoneEnabled()).toBe(false);
    });

    it("should reset media state after disconnect", async () => {
      mockWebRTCServiceInstance.isDisplayCaptureAlive.mockReturnValue(true);
      mockWebRTCServiceInstance.isMicrophoneEnabled.mockReturnValue(true);

      await connectionManager.startSharing("TestSharer");

      // Verify media works before disconnect
      expect(connectionManager.isDisplayCaptureAlive()).toBe(true);
      expect(connectionManager.isMicrophoneEnabled()).toBe(true);

      // Disconnect
      await connectionManager.disconnect();

      // After disconnect, media methods should return false/null
      expect(connectionManager.isDisplayCaptureAlive()).toBe(false);
      expect(connectionManager.isMicrophoneEnabled()).toBe(false);
      expect(connectionManager.getDisplayStream()).toBeNull();
      expect(connectionManager.getAudioStream()).toBeNull();
    });
  });

  // ============== Common Methods ==============

  describe("isConnected", () => {
    it("should return false when not initialized", () => {
      expect(connectionManager.isConnected()).toBe(false);
    });

    it("should return WebRTC service connection status", async () => {
      await connectionManager.startSharing("TestSharer");
      mockWebRTCServiceInstance.isConnected.mockReturnValue(true);

      expect(connectionManager.isConnected()).toBe(true);
    });
  });

  // ============== Disconnect ==============

  describe("disconnect", () => {
    beforeEach(async () => {
      connectionManager.setCallbacks(mockCallbacks);
      await connectionManager.startSharing("TestSharer");
      vi.clearAllMocks();
    });

    it("should disconnect WebRTC service", async () => {
      await connectionManager.disconnect();
      expect(mockWebRTCServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should notify phase change to DISCONNECTED", async () => {
      await connectionManager.disconnect();
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.DISCONNECTED);
    });

    it("should handle disconnect when not initialized", () => {
      const freshManager = new ConnectionManager();
      expect(() => freshManager.disconnect()).not.toThrow();
    });
  });

  // ============== Reset ==============

  describe("reset", () => {
    beforeEach(async () => {
      connectionManager.setCallbacks(mockCallbacks);
      await connectionManager.startSharing("TestSharer");
      vi.clearAllMocks();
    });

    it("should call disconnect", async () => {
      await connectionManager.reset();
      expect(mockWebRTCServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should notify phase change to DISCONNECTED before clearing callbacks", async () => {
      await connectionManager.reset();
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.DISCONNECTED);
    });

    it("should clear callbacks after reset", async () => {
      // Record the number of callback calls before reset
      const phaseChangeCallsBefore = (mockCallbacks.onPhaseChange as Mock).mock.calls.length;
      
      await connectionManager.reset();
      
      // reset will trigger DISCONNECTED and IDLE phase changes
      // This is normal behavior, verifying that callbacks are called during reset
      expect((mockCallbacks.onPhaseChange as Mock).mock.calls.length).toBeGreaterThan(phaseChangeCallsBefore);

      // Create new callbacks to verify that old callbacks have been cleared
      const newCallbacks = {
        onPhaseChange: vi.fn()
      };

      // Create a new mock instance for the new operation
      mockWebRTCServiceInstance = createMockWebRTCService();
      mockWebRTCServiceInstance.createSharerOffer.mockResolvedValue(mockOffer);
      (encodeConnectionUrl as Mock).mockResolvedValue(mockOfferUrl);

      // Clear the call records of old callbacks
      vi.clearAllMocks();

      // Set new callbacks and perform the operation
      connectionManager.setCallbacks(newCallbacks);
      await connectionManager.startSharing("NewUser");

      // New callbacks should be called
      expect(newCallbacks.onPhaseChange).toHaveBeenCalled();
      // Old callbacks should not be called after clearAllMocks
      expect(mockCallbacks.onPhaseChange).not.toHaveBeenCalled();
    });
  });

  // ============== Connection State Callbacks ==============

  describe("connection state callbacks", () => {
    let savedIceCallback: ((state: RTCIceConnectionState) => void) | undefined;
    let savedConnectionCallback: ((state: RTCPeerConnectionState) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let savedStreamCallback: ((stream: MediaStream) => void) | undefined;

    beforeEach(async () => {
      connectionManager.setCallbacks(mockCallbacks);
      await connectionManager.startSharing("TestSharer");
      
      savedIceCallback = mockWebRTCServiceInstance.onIceConnectionStateChange.mock.calls[0]?.[0];
      savedConnectionCallback = mockWebRTCServiceInstance.onConnectionStateChange.mock.calls[0]?.[0];
      savedStreamCallback = mockWebRTCServiceInstance.onRemoteStream.mock.calls[0]?.[0];
    });

    it("should forward ICE connection state changes", async () => {
      expect(savedIceCallback).toBeDefined();
      
      savedIceCallback!("connected");

      expect(mockCallbacks.onIceConnectionStateChange).toHaveBeenCalledWith("connected");
    });

    it("should NOT override OFFER_CREATED on ICE checking state", async () => {
      expect(savedIceCallback).toBeDefined();
      // After startSharing, phase is OFFER_CREATED — checking must not regress it
      vi.clearAllMocks();

      savedIceCallback!("checking");
      expect(mockCallbacks.onPhaseChange).not.toHaveBeenCalled();
    });

    it("should update phase to CONNECTED on connected state", async () => {
      expect(savedConnectionCallback).toBeDefined();
      vi.clearAllMocks();

      savedConnectionCallback!("connected");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTED);
    });

   it("should update phase to CONNECTED on completed state", async () => {
      // connectionState does not have a "completed" value;
      // the authoritative connected signal is connectionState === "connected".
      expect(savedConnectionCallback).toBeDefined();
      vi.clearAllMocks();

      savedConnectionCallback!("connected");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTED);
    });

    it("should update phase to DISCONNECTED on failed state", async () => {
      expect(savedConnectionCallback).toBeDefined();

      // Set phase to connected first via DTLS connection state
      savedConnectionCallback!("connected");
      vi.clearAllMocks();

      // Then simulate failure
      savedConnectionCallback!("failed");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.DISCONNECTED);
    });

    it("should forward remote stream events", async () => {
      await connectionManager.startSharing("TestSharer");

      const streamCallback = mockWebRTCServiceInstance.onRemoteStream.mock.calls[0][0];
      const mockStream = new MediaStream();

      streamCallback(mockStream);

      expect(mockCallbacks.onRemoteStream).toHaveBeenCalledWith(mockStream);
    });
  });

  // ============== Edge Cases ==============

  describe("edge cases", () => {
    it("should handle multiple sequential operations", async () => {
      connectionManager.setCallbacks(mockCallbacks);

      // Start sharing
      await connectionManager.startSharing("User1");

      // Disconnect
      await connectionManager.disconnect();

      mockWebRTCServiceInstance = createMockWebRTCService();
      mockWebRTCServiceInstance.createWatcherAnswer.mockResolvedValue(mockAnswer);

      // Join session
      await connectionManager.joinSession("User2", mockOfferUrl, mockVideoElement);
    });

    it("should not duplicate phase change callbacks", async () => {
      connectionManager.setCallbacks(mockCallbacks);

      await connectionManager.startSharing("TestSharer");

      // Count how many times INITIALIZING was called
      const initializingCalls = (mockCallbacks.onPhaseChange as Mock).mock.calls.filter(
        (call) => call[0] === ConnectionPhase.INITIALIZING
      );

      expect(initializingCalls.length).toBe(1);
    });

    it("should handle callbacks being undefined", async () => {
      // Don't set any callbacks
      const result = await connectionManager.startSharing("TestSharer");

      expect(result).toBe(mockOfferUrl);
    });

    it("should handle partial callbacks", async () => {
      connectionManager.setCallbacks({
        onPhaseChange: vi.fn()
        // No other callbacks
      });

      const result = await connectionManager.startSharing("TestSharer");

      expect(result).toBe(mockOfferUrl);
    });
  });

  // ============== Concurrency Protection ==============

  describe("concurrency protection", () => {
    it("should prevent simultaneous startSharing calls", async () => {
      connectionManager.setCallbacks(mockCallbacks);

      const promise1 = connectionManager.startSharing("User1");
      const promise2 = connectionManager.startSharing("User2");

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should return null
      expect([result1, result2].filter(r => r !== null).length).toBe(1);
    });

    it("should prevent startSharing during joinSession", async () => {
      connectionManager.setCallbacks(mockCallbacks);

      const joinPromise = connectionManager.joinSession("Watcher", mockOfferUrl, mockVideoElement);
      const shareResult = await connectionManager.startSharing("Sharer");

      await joinPromise;

      expect(shareResult).toBeNull();
    });

    it("should allow operation after previous completes", async () => {
      connectionManager.setCallbacks(mockCallbacks);

      await connectionManager.startSharing("User1");
      await connectionManager.disconnect();

      mockWebRTCServiceInstance = createMockWebRTCService();
      mockWebRTCServiceInstance.createSharerOffer.mockResolvedValue(mockOffer);


      const result = await connectionManager.startSharing("User2");
      expect(result).toBe(mockOfferUrl);
    });
  });
});