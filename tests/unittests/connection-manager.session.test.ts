import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest";
import { ConnectionManager } from "../../src/renderer/core/session/connection-manager";
import { 
  PeerRole, 
  ConnectionPhase,
  ConnectionManagerCallbacks 
} from "../../src/shared/types/index";

// Mock electron-log
vi.mock("electron-log", () => ({
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
    setup: vi.fn().mockResolvedValue(undefined),
    createSharerOffer: vi.fn(),
    createWatcherAnswer: vi.fn(),
    acceptAnswer: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(false),
    onIceConnectionStateChange: vi.fn(),
    onRemoteStream: vi.fn()
  };
}

let mockWebRTCServiceInstance: ReturnType<typeof createMockWebRTCService>;

vi.mock("../../src/renderer/core/webrtc/index", () => ({
  WebRTCService: vi.fn().mockImplementation(function() {
    return mockWebRTCServiceInstance;
  })
}));

// Mock signaling-url utilities
vi.mock("../../src/shared/utils/index", () => ({
  encodeConnectionUrl: vi.fn(),
  decodeConnectionUrl: vi.fn(),
  isValidConnectionUrl: vi.fn(),
  getRoleFromUrl: vi.fn(),
  copyToClipboard: vi.fn(),
  readFromClipboard: vi.fn(),
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
  getRoleFromUrl,
  copyToClipboard,
  readFromClipboard
} from "../../src/shared/utils/index";

describe("ConnectionManager", () => {
  let connectionManager: ConnectionManager;
  let mockCallbacks: ConnectionManagerCallbacks;
  let mockVideoElement: HTMLVideoElement;

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

  beforeEach(() => {
    mockWebRTCServiceInstance = createMockWebRTCService();
    
    mockWebRTCServiceInstance.createSharerOffer.mockResolvedValue(mockOffer);
    mockWebRTCServiceInstance.createWatcherAnswer.mockResolvedValue(mockAnswer);

    vi.clearAllMocks();

    (encodeConnectionUrl as Mock).mockResolvedValue(mockOfferUrl);
    (copyToClipboard as Mock).mockResolvedValue(undefined);
    (readFromClipboard as Mock).mockResolvedValue(mockOfferUrl);
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============== Constructor & Initial State ==============

  describe("constructor and initial state", () => {
    it("should initialize with IDLE phase", () => {
      expect(connectionManager.getCurrentPhase()).toBe(ConnectionPhase.IDLE);
    });

    it("should initialize with null role", () => {
      expect(connectionManager.getRole()).toBeNull();
    });

    it("should initialize with null WebRTC service", () => {
      expect(connectionManager.getWebRTCService()).toBeNull();
    });

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

    it("should create offer URL and copy to clipboard", async () => {
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
      expect(mockWebRTCServiceInstance.setup).toHaveBeenCalled();
      expect(mockWebRTCServiceInstance.createSharerOffer).toHaveBeenCalled();
      expect(encodeConnectionUrl).toHaveBeenCalledWith(
        PeerRole.SCREEN_SHARER,
        "TestSharer",
        mockOffer
      );
      expect(copyToClipboard).toHaveBeenCalledWith(mockOfferUrl);
    });

    it("should update connection phases correctly", async () => {
      await connectionManager.startSharing("TestSharer");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.OFFER_CREATED);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.WAITING_FOR_ANSWER);
    });

    it("should set role to SCREEN_SHARER", async () => {
      await connectionManager.startSharing("TestSharer");
      expect(connectionManager.getRole()).toBe(PeerRole.SCREEN_SHARER);
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
      mockWebRTCServiceInstance.setup.mockRejectedValue(new Error("Setup failed"));

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

    it("should handle clipboard write failure", async () => {
      (copyToClipboard as Mock).mockRejectedValue(new Error("Clipboard failed"));

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
      (readFromClipboard as Mock).mockResolvedValue(mockAnswerUrl);
      (isValidConnectionUrl as Mock).mockReturnValue(true);
      (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_WATCHER);
      (decodeConnectionUrl as Mock).mockResolvedValue({
        role: PeerRole.SCREEN_WATCHER,
        username: "watcher",
        sdp: mockAnswer
      });
    });

    it("should accept answer URL successfully", async () => {
      const result = await connectionManager.acceptAnswerUrl();

      expect(result).toBe(true);
      expect(readFromClipboard).toHaveBeenCalled();
      expect(isValidConnectionUrl).toHaveBeenCalledWith(mockAnswerUrl);
      expect(getRoleFromUrl).toHaveBeenCalledWith(mockAnswerUrl);
      expect(decodeConnectionUrl).toHaveBeenCalledWith(mockAnswerUrl);
      expect(mockWebRTCServiceInstance.acceptAnswer).toHaveBeenCalledWith(mockAnswer);
    });

    it("should update phase to CONNECTING", async () => {
      await connectionManager.acceptAnswerUrl();
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTING);
    });

    it("should return false if not initialized as sharer", async () => {
      // Reset to fresh state
      await connectionManager.reset();
      vi.clearAllMocks();

      const result = await connectionManager.acceptAnswerUrl();

      expect(result).toBe(false);
    });

    it("should return false if clipboard is empty", async () => {
      (readFromClipboard as Mock).mockResolvedValue(null);

      const result = await connectionManager.acceptAnswerUrl();

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false for invalid URL", async () => {
      (isValidConnectionUrl as Mock).mockReturnValue(false);

      const result = await connectionManager.acceptAnswerUrl();

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if URL is from sharer (not watcher)", async () => {
      (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_SHARER);

      const result = await connectionManager.acceptAnswerUrl();

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if URL decoding fails", async () => {
      (decodeConnectionUrl as Mock).mockResolvedValue(null);

      const result = await connectionManager.acceptAnswerUrl();

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if accepting answer fails", async () => {
      mockWebRTCServiceInstance.acceptAnswer.mockRejectedValue(new Error("Accept failed"));

      const result = await connectionManager.acceptAnswerUrl();

      expect(result).toBe(false);
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return false if operation is already in progress", async () => {
      const firstPromise = connectionManager.acceptAnswerUrl();
      const secondResult = await connectionManager.acceptAnswerUrl();

      await firstPromise;

      expect(secondResult).toBe(false);
    });
  });

  // ============== Watcher Flow: joinSession ==============

  describe("joinSession", () => {
    beforeEach(() => {
      connectionManager.setCallbacks(mockCallbacks);

      (readFromClipboard as Mock).mockResolvedValue(mockOfferUrl);
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
      const result = await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(result).toBe(mockAnswerUrl);
      expect(readFromClipboard).toHaveBeenCalled();
      expect(WebRTCService).toHaveBeenCalledWith(
        expect.objectContaining({
          isScreenSharer: false,
          remoteVideo: mockVideoElement,
          userConfig: expect.objectContaining({
            username: "TestWatcher"
          })
        })
      );
      expect(mockWebRTCServiceInstance.setup).toHaveBeenCalled();
      expect(mockWebRTCServiceInstance.createWatcherAnswer).toHaveBeenCalledWith(mockOffer);
      expect(encodeConnectionUrl).toHaveBeenCalledWith(
        PeerRole.SCREEN_WATCHER,
        "TestWatcher",
        mockAnswer
      );
      expect(copyToClipboard).toHaveBeenCalledWith(mockAnswerUrl);
    });

    it("should set role to SCREEN_WATCHER", async () => {
      await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(connectionManager.getRole()).toBe(PeerRole.SCREEN_WATCHER);
    });

    it("should update connection phases correctly", async () => {
      await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.ANSWER_CREATED);
    });

    it("should call onUrlGenerated callback", async () => {
      await connectionManager.joinSession("TestWatcher", mockVideoElement);

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

    it("should return null if clipboard is empty", async () => {
      (readFromClipboard as Mock).mockResolvedValue(null);

      const result = await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null for invalid URL", async () => {
      (isValidConnectionUrl as Mock).mockReturnValue(false);

      const result = await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if URL is from watcher (not sharer)", async () => {
      (getRoleFromUrl as Mock).mockReturnValue(PeerRole.SCREEN_WATCHER);

      const result = await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if URL decoding fails", async () => {
      (decodeConnectionUrl as Mock).mockResolvedValue(null);

      const result = await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if answer creation fails", async () => {
      mockWebRTCServiceInstance.createWatcherAnswer.mockRejectedValue(new Error("Answer failed"));

      const result = await connectionManager.joinSession("TestWatcher", mockVideoElement);

      expect(result).toBeNull();
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });

    it("should return null if operation is already in progress", async () => {
      const firstPromise = connectionManager.joinSession("User1", mockVideoElement);
      const secondResult = await connectionManager.joinSession("User2", mockVideoElement);

      await firstPromise;

      expect(secondResult).toBeNull();
    });
  });

  // ============== Common Methods ==============

  describe("getCurrentPhase", () => {
    it("should return current phase", () => {
      expect(connectionManager.getCurrentPhase()).toBe(ConnectionPhase.IDLE);
    });
  });

  describe("getRole", () => {
    it("should return null before any operation", () => {
      expect(connectionManager.getRole()).toBeNull();
    });

    it("should return SCREEN_SHARER after startSharing", async () => {
      await connectionManager.startSharing("TestSharer");
      expect(connectionManager.getRole()).toBe(PeerRole.SCREEN_SHARER);
    });

    it("should return SCREEN_WATCHER after joinSession", async () => {
      connectionManager.setCallbacks(mockCallbacks);
      await connectionManager.joinSession("TestWatcher", mockVideoElement);
      expect(connectionManager.getRole()).toBe(PeerRole.SCREEN_WATCHER);
    });
  });

  describe("getWebRTCService", () => {
    it("should return null before initialization", () => {
      expect(connectionManager.getWebRTCService()).toBeNull();
    });

    it("should return service after startSharing", async () => {
      await connectionManager.startSharing("TestSharer");
      expect(connectionManager.getWebRTCService()).not.toBeNull();
    });
  });

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

    it("should set phase to DISCONNECTED", async () => {
      await connectionManager.disconnect();
      expect(connectionManager.getCurrentPhase()).toBe(ConnectionPhase.DISCONNECTED);
    });

    it("should clear role", async () => {
      await connectionManager.disconnect();
      expect(connectionManager.getRole()).toBeNull();
    });

    it("should clear WebRTC service reference", async () => {
      await connectionManager.disconnect();
      expect(connectionManager.getWebRTCService()).toBeNull();
    });

    it("should handle disconnect when not initialized", async () => {
      const freshManager = new ConnectionManager();
      await expect(freshManager.disconnect()).resolves.not.toThrow();
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

    it("should set phase to IDLE", async () => {
      await connectionManager.reset();
      expect(connectionManager.getCurrentPhase()).toBe(ConnectionPhase.IDLE);
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
      (copyToClipboard as Mock).mockResolvedValue(undefined);

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let savedStreamCallback: ((stream: MediaStream) => void) | undefined;

    beforeEach(async () => {
      connectionManager.setCallbacks(mockCallbacks);
      await connectionManager.startSharing("TestSharer");
      
      savedIceCallback = mockWebRTCServiceInstance.onIceConnectionStateChange.mock.calls[0]?.[0];
      savedStreamCallback = mockWebRTCServiceInstance.onRemoteStream.mock.calls[0]?.[0];
    });

    it("should forward ICE connection state changes", async () => {
      expect(savedIceCallback).toBeDefined();
      
      savedIceCallback!("connected");

      expect(mockCallbacks.onIceConnectionStateChange).toHaveBeenCalledWith("connected");
    });

    it("should update phase to CONNECTING on checking state", async () => {
      expect(savedIceCallback).toBeDefined();
      vi.clearAllMocks();

      savedIceCallback!("checking");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTING);
    });

    it("should update phase to CONNECTED on connected state", async () => {
      expect(savedIceCallback).toBeDefined();
      vi.clearAllMocks();

      savedIceCallback!("connected");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTED);
    });

   it("should update phase to CONNECTED on completed state", async () => {
      expect(savedIceCallback).toBeDefined();
      vi.clearAllMocks();

      savedIceCallback!("completed");

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTED);
    });

    it("should update phase to DISCONNECTED on failed state", async () => {
      await connectionManager.startSharing("TestSharer");

      // Set phase to connected first
      const iceCallback = mockWebRTCServiceInstance.onIceConnectionStateChange.mock.calls[0][0];
      iceCallback("connected");
      vi.clearAllMocks();

      // Then simulate failure
      iceCallback("failed");

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
      expect(connectionManager.getRole()).toBe(PeerRole.SCREEN_SHARER);

      // Disconnect
      await connectionManager.disconnect();
      expect(connectionManager.getRole()).toBeNull();

      mockWebRTCServiceInstance = createMockWebRTCService();
      mockWebRTCServiceInstance.createWatcherAnswer.mockResolvedValue(mockAnswer);

      // Join session
      await connectionManager.joinSession("User2", mockVideoElement);
      expect(connectionManager.getRole()).toBe(PeerRole.SCREEN_WATCHER);
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

      const joinPromise = connectionManager.joinSession("Watcher", mockVideoElement);
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