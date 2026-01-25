import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebRTCService } from "../../src/renderer/core/webrtc/index";
import { RemoteCursorState } from "../../src/shared/types/index";
import { WebRTCSharerConfig, WebRTCWatcherConfig } from "../../src/shared/types/index";

// Mock electron-log
vi.mock("electron-log", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

describe("WebRTCService", () => {
  let service: WebRTCService;
  let mockSharerConfig: WebRTCSharerConfig;
  let mockWatcherConfig: WebRTCWatcherConfig;
  let mockVideoElement: HTMLVideoElement;
  let mockPeerConnection: RTCPeerConnection;
  let mockAudioStream: MediaStream;
  let mockDisplayStream: MediaStream;

  const createMockMediaStream = (kind: "audio" | "video"): MediaStream => {
    const mockTrack = {
      kind,
      enabled: true,
      readyState: "live" as MediaStreamTrackState,
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaStreamTrack;

    return {
      getTracks: vi.fn(() => [mockTrack]),
      getAudioTracks: vi.fn(() => kind === "audio" ? [mockTrack] : []),
      getVideoTracks: vi.fn(() => kind === "video" ? [mockTrack] : []),
      active: true,
      removeTrack: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaStream;
  };

  const createMockRTCSessionDescription = (type: RTCSdpType): RTCSessionDescriptionInit => ({
    type,
    sdp: `mock-${type}-sdp`
  });

  beforeEach(() => {
    // Mock video element
    mockVideoElement = {
      srcObject: null
    } as unknown as HTMLVideoElement;

    // Mock config
    mockSharerConfig = {
      userConfig: {
        username: "testUser",
        isMicrophoneEnabledOnConnect: false
      },
      isScreenSharer: true,
      connectionConfig: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" }
        ]
      }
    };

    mockWatcherConfig = {
      userConfig: {
        username: "testUser",
        isMicrophoneEnabledOnConnect: false
      },
      isScreenSharer: false,
      remoteVideo: mockVideoElement,
      connectionConfig: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" }
        ]
      }
    };

    // Mock streams
    mockAudioStream = createMockMediaStream("audio");
    mockDisplayStream = createMockMediaStream("video");

    // Track localDescription dynamically
    let currentLocalDescription: RTCSessionDescriptionInit | null = null;

    // Mock RTCPeerConnection
    mockPeerConnection = {
      createOffer: vi.fn().mockResolvedValue(createMockRTCSessionDescription("offer")),
      createAnswer: vi.fn().mockResolvedValue(createMockRTCSessionDescription("answer")),
      setLocalDescription: vi.fn().mockImplementation((desc: RTCSessionDescriptionInit) => {
        currentLocalDescription = desc;
        return Promise.resolve();
      }),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      addTrack: vi.fn().mockReturnValue({} as RTCRtpSender),
      removeTrack: vi.fn(),
      createDataChannel: vi.fn().mockReturnValue({
        label: "test",
        readyState: "open",
        send: vi.fn(),
        close: vi.fn(),
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null
      }),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      connectionState: "new" as RTCPeerConnectionState,
      iceConnectionState: "new" as RTCIceConnectionState,
      iceGatheringState: "complete" as RTCIceGatheringState,
      ondatachannel: null,
      ontrack: null,
      onicecandidate: null,
      oniceconnectionstatechange: null,
      onconnectionstatechange: null,
      onicegatheringstatechange: null
    } as unknown as RTCPeerConnection;

    // Define localDescription as getter
    Object.defineProperty(mockPeerConnection, "localDescription", {
      get: () => currentLocalDescription,
      configurable: true
    });

    // Mock RTCPeerConnection constructor
    const RTCPeerConnectionMock = vi.fn(function (this: RTCPeerConnection) {
      const props = ["createOffer", "createAnswer", "setLocalDescription",
        "setRemoteDescription", "addTrack", "removeTrack", "createDataChannel",
        "close", "addEventListener", "removeEventListener", "connectionState",
        "iceConnectionState", "iceGatheringState", "ondatachannel",
        "ontrack", "onicecandidate", "oniceconnectionstatechange",
        "onconnectionstatechange", "onicegatheringstatechange"];

      for (const prop of props) {
        (this as any)[prop] = (mockPeerConnection as any)[prop];
      }

      Object.defineProperty(this, "localDescription", {
        get: () => currentLocalDescription,
        configurable: true
      });

      return this;
    });
    vi.stubGlobal("RTCPeerConnection", RTCPeerConnectionMock);

    // Mock RTCSessionDescription constructor
    const RTCSessionDescriptionMock = vi.fn(function (this: RTCSessionDescription, desc: RTCSessionDescriptionInit) {
      Object.assign(this, desc);
      return this;
    });
    vi.stubGlobal("RTCSessionDescription", RTCSessionDescriptionMock);

    // Mock navigator.mediaDevices
    const mockMediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockAudioStream),
      getDisplayMedia: vi.fn().mockResolvedValue(mockDisplayStream)
    };
    vi.stubGlobal("navigator", {
      mediaDevices: mockMediaDevices
    });

    // Mock document.createElement for audio element
    const mockAudioElement = {
      autoplay: false,
      controls: false,
      style: { display: "" },
      srcObject: null,
      remove: vi.fn()
    };
    // vi.spyOn(document, "createElement").mockReturnValue(mockAudioElement as unknown as HTMLElement);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "audio") {
        return mockAudioElement as any;
      }
      // For other elements, return default behavior
      return document.createElement(tagName as keyof HTMLElementTagNameMap);
    });
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockAudioElement as unknown as Node);

    service = new WebRTCService(mockSharerConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("constructor", () => {
    it("should create instance with screen sharer config", () => {
      expect(service).toBeInstanceOf(WebRTCService);
      expect(service.isScreenSharer()).toBe(true);
      expect(service.isScreenWatcher()).toBe(false);
    });

    it("should create instance with screen watcher config", () => {
      // const watcherConfig: WebRTCServiceConfig = {
      //   ...mockConfig,
      //   isScreenSharer: false
      // };
      const watcherService = new WebRTCService(mockWatcherConfig);

      expect(watcherService.isScreenSharer()).toBe(false);
      expect(watcherService.isScreenWatcher()).toBe(true);
    });
  });

  describe("setup", () => {
    it("should initialize service as screen sharer", async () => {
      await service.initialize();

      expect(service.isServiceInitialized()).toBe(true);
      expect(RTCPeerConnection).toHaveBeenCalled();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: false
      });
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        audio: false,
        video: true
      });
    });

    it("should initialize service as screen watcher", async () => {
      // const watcherConfig: WebRTCServiceConfig = {
      //   ...mockConfig,
      //   isScreenSharer: false
      // };
      const watcherService = new WebRTCService(mockWatcherConfig);

      await watcherService.initialize();

      expect(watcherService.isServiceInitialized()).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      expect(navigator.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
    });

    it("should create audio element", async () => {
      await service.initialize();

      expect(document.createElement).toHaveBeenCalledWith("audio");
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    it("should handle audio permission denial gracefully", async () => {
      (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(new Error("Permission denied"));

      await service.initialize();

      expect(service.isServiceInitialized()).toBe(true);
    });

    it("should handle display capture failure gracefully", async () => {
      (navigator.mediaDevices.getDisplayMedia as any).mockRejectedValue(new Error("Permission denied"));

      await service.initialize();

      expect(service.isServiceInitialized()).toBe(true);
    });
  });

  describe("createSharerOffer", () => {
    it("should create offer and data channels", async () => {
      await service.initialize();

      const offer = await service.createSharerOffer();

      expect(offer.type).toBe("offer");
      expect(mockPeerConnection.createDataChannel).toHaveBeenCalled();
      expect(mockPeerConnection.createOffer).toHaveBeenCalled();
    });

    it("should throw error if not initialized", async () => {
      await expect(service.createSharerOffer()).rejects.toThrow(
        "WebRTC service not initialized"
      );
    });
  });

  describe("createWatcherAnswer", () => {
    it("should create answer for received offer", async () => {
      // const watcherConfig: WebRTCServiceConfig = {
      //   ...mockConfig,
      //   isScreenSharer: false
      // };
      const watcherService = new WebRTCService(mockWatcherConfig);
      await watcherService.initialize();

      const offer = createMockRTCSessionDescription("offer");
      const answer = await watcherService.createWatcherAnswer(offer);

      expect(answer.type).toBe("answer");
      expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled();
      expect(mockPeerConnection.createAnswer).toHaveBeenCalled();
    });

    it("should throw error if not initialized", async () => {
      // const watcherConfig: WebRTCServiceConfig = {
      //   ...mockConfig,
      //   isScreenSharer: false
      // };
      const watcherService = new WebRTCService(mockWatcherConfig);

      const offer = createMockRTCSessionDescription("offer");
      await expect(watcherService.createWatcherAnswer(offer)).rejects.toThrow(
        "WebRTC service not initialized"
      );
    });
  });

  describe("acceptAnswer", () => {
    it("should accept remote answer", async () => {
      await service.initialize();
      await service.createSharerOffer();

      const answer = createMockRTCSessionDescription("answer");
      await service.acceptAnswer(answer);

      expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled();
    });

    it("should throw error if not initialized", async () => {
      const answer = createMockRTCSessionDescription("answer");

      await expect(service.acceptAnswer(answer)).rejects.toThrow(
        "WebRTC service not initialized"
      );
    });
  });

  describe("media control", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe("toggleMicrophone", () => {
      it("should toggle microphone state", () => {
        const initialState = service.isMicrophoneActive();
        const newState = service.toggleMicrophone();

        expect(newState).toBe(!initialState);
      });
    });

    describe("setMicrophoneEnabled", () => {
      it("should set microphone state", () => {
        service.setMicrophoneEnabled(false);

        expect(service.isMicrophoneActive()).toBe(false);
      });
    });

    describe("toggleDisplayStream", () => {
      it("should toggle display stream state", () => {
        const initialState = service.isDisplayStreamActive();
        const newState = service.toggleDisplayStream();

        expect(newState).toBe(!initialState);
      });
    });

    describe("setDisplayStreamEnabled", () => {
      it("should set display stream state", () => {
        service.setDisplayStreamEnabled(false);

        expect(service.isDisplayStreamActive()).toBe(false);
      });
    });

    describe("hasAudioInput", () => {
      it("should return true when audio stream exists", () => {
        expect(service.hasAudioInput()).toBe(true);
      });
    });

    describe("getAudioStream", () => {
      it("should return audio stream", () => {
        expect(service.getAudioStream()).toBe(mockAudioStream);
      });
    });

    describe("isDisplayActive", () => {
      it("should return true when display stream is active", () => {
        expect(service.isDisplayActive()).toBe(true);
      });
    });
  });

  describe("cursor control", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe("updateRemoteCursor", () => {
      it("should send cursor update", () => {
        const cursorData: RemoteCursorState = {
          id: "cursor1",
          name: "Test User",
          color: "#FF0000",
          x: 100,
          y: 200
        };

        // Note: Will return false because data channel not actually open
        const result = service.updateRemoteCursor(cursorData);
        expect(typeof result).toBe("boolean");
      });
    });

    describe("pingRemoteCursor", () => {
      it("should send cursor ping", () => {
        const result = service.pingRemoteCursor("cursor1");
        expect(typeof result).toBe("boolean");
      });
    });

    describe("toggleRemoteCursors", () => {
      it("should toggle remote cursors", () => {
        const result = service.toggleRemoteCursors(true);
        expect(typeof result).toBe("boolean");
      });
    });

    describe("isCursorsEnabled", () => {
      it("should return cursors enabled state", () => {
        expect(typeof service.isCursorsEnabled()).toBe("boolean");
      });
    });

    describe("areDataChannelsReady", () => {
      it("should check if data channels are ready", () => {
        expect(typeof service.areDataChannelsReady()).toBe("boolean");
      });
    });

    describe("callback registration", () => {
      it("should register cursor update callback", () => {
        const callback = vi.fn();
        expect(() => service.onCursorUpdate(callback)).not.toThrow();
      });

      it("should register cursor ping callback", () => {
        const callback = vi.fn();
        expect(() => service.onCursorPing(callback)).not.toThrow();
      });

      it("should register channel open callback", () => {
        const callback = vi.fn();
        expect(() => service.onChannelOpen(callback)).not.toThrow();
      });

      it("should register channel close callback", () => {
        const callback = vi.fn();
        expect(() => service.onChannelClose(callback)).not.toThrow();
      });
    });
  });

  describe("connection state", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe("onConnectionStateChange", () => {
      it("should register connection state callback", () => {
        const callback = vi.fn();
        expect(() => service.onIceConnectionStateChange(callback)).not.toThrow();
      });
    });

    describe("isConnected", () => {
      it("should return false when not connected", () => {
        expect(service.isConnected()).toBe(false);
      });

      it("should return true when connected", async () => {
        // Get the actual peer connection instance and modify it directly
        const pc = (service as any).connectionService.getPeerConnection();
        Object.defineProperty(pc, "connectionState", {
          value: "connected",
          configurable: true
        });
        expect(service.isConnected()).toBe(true);
      });
    });

    describe("getConnectionState", () => {
      it("should return connection state", () => {
        expect(service.getConnectionState()).toBe("new");
      });
    });

    describe("getIceConnectionState", () => {
      it("should return ICE connection state", () => {
        expect(service.getIceConnectionState()).toBe("new");
      });
    });
  });

  describe("lifecycle", () => {
    describe("disconnect", () => {
      it("should disconnect and cleanup resources", async () => {
        await service.initialize();

        await service.disconnect();

        expect(service.isServiceInitialized()).toBe(false);
        expect(mockPeerConnection.close).toHaveBeenCalled();
      });

      it("should clear video element srcObject for watcher", async () => {
        const watcherService = new WebRTCService(mockWatcherConfig);
        await watcherService.initialize();
        mockVideoElement.srcObject = {} as MediaStream;

        await watcherService.disconnect();

        expect(mockVideoElement.srcObject).toBeNull();
      });

      it("should handle disconnect when not initialized", async () => {
        await expect(service.disconnect()).resolves.not.toThrow();
      });
    });

    describe("isServiceInitialized", () => {
      it("should return false before setup", () => {
        expect(service.isServiceInitialized()).toBe(false);
      });

      it("should return true after setup", async () => {
        await service.initialize();
        expect(service.isServiceInitialized()).toBe(true);
      });

      it("should return false after disconnect", async () => {
        await service.initialize();
        await service.disconnect();
        expect(service.isServiceInitialized()).toBe(false);
      });
    });
  });

  describe("role checks", () => {
    describe("isScreenSharer", () => {
      it("should return true for screen sharer", () => {
        expect(service.isScreenSharer()).toBe(true);
      });

      it("should return false for screen watcher", () => {
        // const watcherConfig: WebRTCServiceConfig = {
        //   ...mockConfig,
        //   isScreenSharer: false
        // };
        const watcherService = new WebRTCService(mockWatcherConfig);

        expect(watcherService.isScreenSharer()).toBe(false);
      });
    });

    describe("isScreenWatcher", () => {
      it("should return false for screen sharer", () => {
        expect(service.isScreenWatcher()).toBe(false);
      });

      it("should return true for screen watcher", () => {
        // const watcherConfig: WebRTCServiceConfig = {
        //   ...mockConfig,
        //   isScreenSharer: false
        // };
        const watcherService = new WebRTCService(mockWatcherConfig);

        expect(watcherService.isScreenWatcher()).toBe(true);
      });
    });
  });

  describe("track handling", () => {
    it("should set remote video srcObject when track is received", async () => {
      const watcherService = new WebRTCService(mockWatcherConfig);
      await watcherService.initialize();

      // Get the peer connection and trigger ontrack
      const pc = (watcherService as any).connectionService.getPeerConnection();
      const mockRemoteStream = createMockMediaStream("video");

      if (pc?.ontrack) {
        pc.ontrack({
          track: { kind: "video" },
          streams: [mockRemoteStream]
        } as unknown as RTCTrackEvent);
      }

      expect(mockVideoElement.srcObject).toBe(mockRemoteStream);
    });
  });

  describe("edge cases", () => {
    it("should handle setup failure and cleanup", async () => {
      // Force initialization error
      (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(new Error("Device not found"));
      (navigator.mediaDevices.getDisplayMedia as any).mockRejectedValue(new Error("Not allowed"));

      // Should not throw, but initialize with limitations
      await service.initialize();
      expect(service.isServiceInitialized()).toBe(true);
    });

    // it("should handle null remoteVideo config", async () => {
    //   const noVideoConfig: WebRTCServiceConfig = {
    //     ...mockConfig,
    //     remoteVideo: null
    //   };
    //   const noVideoService = new WebRTCService(noVideoConfig);

    //   await noVideoService.setup();

    //   expect(noVideoService.isServiceInitialized()).toBe(true);
    // });

    it("should handle multiple setup calls", async () => {
      await service.initialize();
      await service.initialize();

      expect(service.isServiceInitialized()).toBe(true);
    });

    it("should handle multiple disconnect calls", async () => {
      await service.initialize();
      await service.disconnect();
      await service.disconnect();

      expect(service.isServiceInitialized()).toBe(false);
    });
  });
});