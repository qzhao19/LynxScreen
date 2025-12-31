import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebRTCConnectionService, DataChannelService } from '../../src/renderer/core/index';
import { WebRTCConnectionConfig } from '../../src/shared/types/index';

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

describe('WebRTCConnectionService', () => {
  let service: WebRTCConnectionService;
  let mockDataChannelService: DataChannelService;
  let mockPeerConnection: RTCPeerConnection;
  let mockConfig: WebRTCConnectionConfig;

  const createMockRTCSessionDescription = (type: RTCSdpType): RTCSessionDescriptionInit => ({
    type,
    sdp: `mock-${type}-sdp`
  });

  beforeEach(() => {
    // Mock DataChannelService
    mockDataChannelService = {
      createChannels: vi.fn(),
      handleIncomingChannel: vi.fn(),
      cleanup: vi.fn()
    } as unknown as DataChannelService;

    // Mock config
    mockConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:turn.example.com', username: 'user', credential: 'pass' }
      ]
    };
    let currentLocalDescription: RTCSessionDescriptionInit | null = createMockRTCSessionDescription('offer');

    // Mock RTCPeerConnection
    mockPeerConnection = {
      createOffer: vi.fn().mockResolvedValue(createMockRTCSessionDescription('offer')),
      createAnswer: vi.fn().mockResolvedValue(createMockRTCSessionDescription('answer')),
      setLocalDescription: vi.fn().mockImplementation((desc: RTCSessionDescriptionInit) => {
        currentLocalDescription = desc;
        return Promise.resolve();
      }),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      addTrack: vi.fn().mockReturnValue({} as RTCRtpSender),
      removeTrack: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      connectionState: 'new' as RTCPeerConnectionState,
      iceConnectionState: 'new' as RTCIceConnectionState,
      iceGatheringState: 'complete' as RTCIceGatheringState,
      ondatachannel: null,
      ontrack: null,
      onicecandidate: null,
      oniceconnectionstatechange: null,
      onconnectionstatechange: null,
      onicegatheringstatechange: null
    } as unknown as RTCPeerConnection;

    // Define localDescription as a getter
    Object.defineProperty(mockPeerConnection, 'localDescription', {
      get: () => currentLocalDescription,
      configurable: true
    });

    // Mock RTCPeerConnection constructor
    const RTCPeerConnectionMock = vi.fn(function (this: RTCPeerConnection) {
      // Copy regular properties
      const props = ['createOffer', 'createAnswer', 'setLocalDescription', 
        'setRemoteDescription', 'addTrack', 'removeTrack', 'close', 
        'addEventListener', 'removeEventListener', 'connectionState',
        'iceConnectionState', 'iceGatheringState', 'ondatachannel',
        'ontrack', 'onicecandidate', 'oniceconnectionstatechange',
        'onconnectionstatechange', 'onicegatheringstatechange'];
      
      for (const prop of props) {
        (this as any)[prop] = (mockPeerConnection as any)[prop];
      }
      
      // Define getter for localDescription
      Object.defineProperty(this, 'localDescription', {
        get: () => currentLocalDescription,
        configurable: true
      });
      
      return this;
    });
    vi.stubGlobal('RTCPeerConnection', RTCPeerConnectionMock);

    // Mock RTCSessionDescription constructor
    const RTCSessionDescriptionMock = vi.fn(function (this: RTCSessionDescription, desc: RTCSessionDescriptionInit) {
      Object.assign(this, desc);
      return this;
    });
    vi.stubGlobal('RTCSessionDescription', RTCSessionDescriptionMock);

    // Mock RTCIceCandidate constructor
    const RTCIceCandidateMock = vi.fn(function (this: RTCIceCandidate, candidate: RTCIceCandidateInit) {
      Object.assign(this, candidate);
      return this;
    });
    vi.stubGlobal('RTCIceCandidate', RTCIceCandidateMock);

    service = new WebRTCConnectionService(mockConfig, mockDataChannelService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should create instance with config and data channel service', () => {
      expect(service).toBeInstanceOf(WebRTCConnectionService);
    });
  });

  describe('initialize', () => {
    it('should create RTCPeerConnection with ICE servers', async () => {
      await service.initialize();

      expect(RTCPeerConnection).toHaveBeenCalledWith({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302', username: undefined, credential: undefined },
          { urls: 'turn:turn.example.com', username: 'user', credential: 'pass' }
        ]
      });
    });

    it('should setup peer connection handlers after initialization', async () => {
      await service.initialize();

      const pc = service.getPeerConnection();
      expect(pc?.ondatachannel).not.toBeNull();
      expect(pc?.ontrack).not.toBeNull();
      expect(pc?.onicecandidate).not.toBeNull();
      expect(pc?.oniceconnectionstatechange).not.toBeNull();
    });

    it('should close existing connection before reinitializing', async () => {
      await service.initialize();
      const firstPc = service.getPeerConnection();

      await service.initialize();

      expect(firstPc?.close).toHaveBeenCalled();
    });
  });

  describe('createOffer', () => {
    it('should create and return SDP offer', async () => {
      await service.initialize();

      const offer = await service.createOffer();

      const pc = service.getPeerConnection();
      expect(pc?.createOffer).toHaveBeenCalled();
      expect(pc?.setLocalDescription).toHaveBeenCalled();
      expect(offer.type).toBe('offer');
    });

    it('should throw error if peer connection not initialized', async () => {
      await expect(service.createOffer()).rejects.toThrow(
        'Peer connection not initialized'
      );
    });

    it('should wait for ICE gathering to complete', async () => {
      await service.initialize();

      await service.createOffer();

      const pc = service.getPeerConnection();
      expect(pc?.setLocalDescription).toHaveBeenCalled();
    });
  });

  describe('createAnswer', () => {
    it('should create answer for received offer', async () => {
      await service.initialize();
      const offer = createMockRTCSessionDescription('offer');

      const answer = await service.createAnswer(offer);

      const pc = service.getPeerConnection();
      expect(pc?.setRemoteDescription).toHaveBeenCalled();
      expect(pc?.createAnswer).toHaveBeenCalled();
      expect(pc?.setLocalDescription).toHaveBeenCalled();
      expect(answer.type).toBe('answer');
    });

    it('should throw error if peer connection not initialized', async () => {
      const offer = createMockRTCSessionDescription('offer');

      await expect(service.createAnswer(offer)).rejects.toThrow(
        'Peer connection not initialized'
      );
    });
  });

  describe('acceptAnswer', () => {
    it('should set remote description with answer', async () => {
      await service.initialize();
      const answer = createMockRTCSessionDescription('answer');

      await service.acceptAnswer(answer);

      const pc = service.getPeerConnection();
      expect(pc?.setRemoteDescription).toHaveBeenCalled();
    });

    it('should throw error if peer connection not initialized', async () => {
      const answer = createMockRTCSessionDescription('answer');

      await expect(service.acceptAnswer(answer)).rejects.toThrow(
        'Peer connection not initialized'
      );
    });
  });

  describe('addTrack', () => {
    it('should add track to peer connection', async () => {
      await service.initialize();
      const mockTrack = { kind: 'video' } as MediaStreamTrack;
      const mockStream = {} as MediaStream;

      const sender = service.addTrack(mockTrack, mockStream);

      const pc = service.getPeerConnection();
      expect(pc?.addTrack).toHaveBeenCalledWith(mockTrack, mockStream);
      expect(sender).toBeDefined();
    });

    it('should throw error if peer connection not initialized', () => {
      const mockTrack = { kind: 'video' } as MediaStreamTrack;
      const mockStream = {} as MediaStream;

      expect(() => service.addTrack(mockTrack, mockStream)).toThrow(
        'Peer connection not initialized'
      );
    });
  });

  describe('removeTrack', () => {
    it('should remove track from peer connection', async () => {
      await service.initialize();
      const mockSender = {} as RTCRtpSender;

      service.removeTrack(mockSender);

      const pc = service.getPeerConnection();
      expect(pc?.removeTrack).toHaveBeenCalledWith(mockSender);
    });

    it('should throw error if peer connection not initialized', () => {
      const mockSender = {} as RTCRtpSender;

      expect(() => service.removeTrack(mockSender)).toThrow(
        'Peer connection not initialized'
      );
    });
  });

  describe('createDataChannels', () => {
    it('should create data channels via data channel service', async () => {
      await service.initialize();

      service.createDataChannels();

      const pc = service.getPeerConnection();
      expect(mockDataChannelService.createChannels).toHaveBeenCalledWith(pc);
    });

    it('should throw error if peer connection not initialized', () => {
      expect(() => service.createDataChannels()).toThrow(
        'Peer connection not initialized'
      );
    });
  });

  describe('onConnectionStateChange', () => {
    it('should register callback for connection state changes', async () => {
      const callback = vi.fn();
      service.onConnectionStateChange(callback);

      await service.initialize();

      const pc = service.getPeerConnection();
      const handler = pc?.oniceconnectionstatechange as (() => void) | null;
      handler?.();

      expect(callback).toHaveBeenCalledWith('new');
    });
  });

  describe('onTrack', () => {
    it('should register callback for receiving tracks', async () => {
      const callback = vi.fn();
      service.onTrack(callback);

      await service.initialize();

      const pc = service.getPeerConnection();
      const mockStream = {} as MediaStream;
      const trackHandler = pc?.ontrack as ((event: RTCTrackEvent) => void) | null;
      trackHandler?.({
        track: { kind: 'video' },
        streams: [mockStream]
      } as unknown as RTCTrackEvent);

      expect(callback).toHaveBeenCalledWith(mockStream);
    });

    it('should not call callback if no streams in track event', async () => {
      const callback = vi.fn();
      service.onTrack(callback);

      await service.initialize();

      const pc = service.getPeerConnection();
      const trackHandler = pc?.ontrack as ((event: RTCTrackEvent) => void) | null;
      trackHandler?.({
        track: { kind: 'video' },
        streams: []
      } as unknown as RTCTrackEvent);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return false when not initialized', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return true when connection state is connected', async () => {
      await service.initialize();
      const pc = service.getPeerConnection() as any;
      pc.connectionState = 'connected';

      expect(service.isConnected()).toBe(true);
    });

    it('should return false when connection state is not connected', async () => {
      await service.initialize();
      const pc = service.getPeerConnection() as any;
      pc.connectionState = 'disconnected';

      expect(service.isConnected()).toBe(false);
    });
  });

  describe('getConnectionState', () => {
    it('should return null when not initialized', () => {
      expect(service.getConnectionState()).toBeNull();
    });

    it('should return connection state when initialized', async () => {
      await service.initialize();
      const pc = service.getPeerConnection() as any;
      pc.connectionState = 'connecting';

      expect(service.getConnectionState()).toBe('connecting');
    });
  });

  describe('getIceConnectionState', () => {
    it('should return null when not initialized', () => {
      expect(service.getIceConnectionState()).toBeNull();
    });

    it('should return ICE connection state when initialized', async () => {
      await service.initialize();
      const pc = service.getPeerConnection() as any;
      pc.iceConnectionState = 'checking';

      expect(service.getIceConnectionState()).toBe('checking');
    });
  });

  describe('getPeerConnection', () => {
    it('should return null when not initialized', () => {
      expect(service.getPeerConnection()).toBeNull();
    });

    it('should return peer connection when initialized', async () => {
      await service.initialize();

      expect(service.getPeerConnection()).not.toBeNull();
    });
  });

  describe('close', () => {
    it('should close peer connection and clear handlers', async () => {
      await service.initialize();
      const pc = service.getPeerConnection();

      service.close();

      expect(pc?.close).toHaveBeenCalled();
      expect(pc?.ondatachannel).toBeNull();
      expect(pc?.ontrack).toBeNull();
      expect(pc?.onicecandidate).toBeNull();
      expect(service.getPeerConnection()).toBeNull();
    });

    it('should handle close when not initialized', () => {
      expect(() => service.close()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should close connection and cleanup data channel service', async () => {
      await service.initialize();
      const pc = service.getPeerConnection();

      service.cleanup();

      expect(pc?.close).toHaveBeenCalled();
      expect(mockDataChannelService.cleanup).toHaveBeenCalled();
      expect(service.getPeerConnection()).toBeNull();
    });

    it('should clear callbacks on cleanup', async () => {
      const stateCallback = vi.fn();
      const trackCallback = vi.fn();
      service.onConnectionStateChange(stateCallback);
      service.onTrack(trackCallback);

      await service.initialize();
      service.cleanup();

      // Reinitialize and trigger events - old callbacks should not be called
      await service.initialize();
      const pc = service.getPeerConnection();
      const handler = pc?.oniceconnectionstatechange as (() => void) | null;
      handler?.();

      expect(stateCallback).not.toHaveBeenCalled();
    });
  });

  describe('waitForIceGathering', () => {
    it('should resolve immediately if gathering is complete', async () => {
      await service.initialize();
      const pc = service.getPeerConnection() as any;
      pc.iceGatheringState = 'complete';

      const startTime = Date.now();
      await service.createOffer();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('event handlers', () => {
    describe('ondatachannel', () => {
      it('should handle incoming data channel', async () => {
        await service.initialize();

        const pc = service.getPeerConnection();
        const mockChannel = { label: 'test-channel' } as RTCDataChannel;
        const handler = pc?.ondatachannel as ((event: RTCDataChannelEvent) => void) | null;
        handler?.({ channel: mockChannel } as RTCDataChannelEvent);

        expect(mockDataChannelService.handleIncomingChannel).toHaveBeenCalledWith(mockChannel);
      });
    });

    describe('onicecandidate', () => {
      it('should handle ICE candidate discovery', async () => {
        await service.initialize();

        const pc = service.getPeerConnection();
        const handler = pc?.onicecandidate as ((event: RTCPeerConnectionIceEvent) => void) | null;

        expect(() => handler?.({ candidate: {} } as RTCPeerConnectionIceEvent)).not.toThrow();
        expect(() => handler?.({ candidate: null } as RTCPeerConnectionIceEvent)).not.toThrow();
      });
    });

    describe('onconnectionstatechange', () => {
      it('should log connection state changes', async () => {
        await service.initialize();

        const pc = service.getPeerConnection();
        const handler = pc?.onconnectionstatechange as (() => void) | null;
        expect(() => handler?.()).not.toThrow();
      });
    });

    describe('onicegatheringstatechange', () => {
      it('should log ICE gathering state changes', async () => {
        await service.initialize();

        const pc = service.getPeerConnection();
        const handler = pc?.onicegatheringstatechange as (() => void) | null;
        expect(() => handler?.()).not.toThrow();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle null local description after setLocalDescription', async () => {
       await service.initialize();
      
      // Override setLocalDescription to set null
      const pc = service.getPeerConnection() as any;
      pc.setLocalDescription = vi.fn().mockImplementation(() => {
        return Promise.resolve();
      });
      
      // Need to reinitialize to get fresh state
      service.close();
      
      // Create new service with special mock
      const nullLocalDescription: RTCSessionDescriptionInit | null = null;
      const specialMockPc = {
        ...mockPeerConnection,
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        createOffer: vi.fn().mockResolvedValue(createMockRTCSessionDescription('offer'))
      };
      Object.defineProperty(specialMockPc, 'localDescription', {
        get: () => nullLocalDescription,
        configurable: true
      });
      
      const SpecialRTCPeerConnectionMock = vi.fn(function (this: RTCPeerConnection) {
        Object.assign(this, specialMockPc);
        Object.defineProperty(this, 'localDescription', {
          get: () => nullLocalDescription,
          configurable: true
        });
        return this;
      });
      vi.stubGlobal('RTCPeerConnection', SpecialRTCPeerConnectionMock);
      
      await service.initialize();

      await expect(service.createOffer()).rejects.toThrow(
        'Failed to create local description'
      );
    });

    it('should handle multiple rapid initialize calls', async () => {
      await Promise.all([
        service.initialize(),
        service.initialize(),
        service.initialize()
      ]);

      expect(service.getPeerConnection()).not.toBeNull();
    });

    it('should handle cleanup when already cleaned up', () => {
      service.cleanup();
      expect(() => service.cleanup()).not.toThrow();
    });
  });
});