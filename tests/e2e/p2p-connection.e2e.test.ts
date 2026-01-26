import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Buffer } from "buffer";
import { TextEncoder, TextDecoder } from "util";

// ============== Polyfills for Node.js environment ==============
// Must be set before any imports that use them

if (typeof globalThis.btoa === "undefined") {
  globalThis.btoa = (data: string) => Buffer.from(data, "binary").toString("base64");
}
if (typeof globalThis.atob === "undefined") {
  globalThis.atob = (data: string) => Buffer.from(data, "base64").toString("binary");
}

if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

// ============== Mocks - Must be before imports ==============

// Mock electron-log
vi.mock("electron-log", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock constants
vi.mock("../../src/shared/constants/index", () => ({
  URL_PROTOCOL: "lynxscreen://"
}));

// Mock clipboard for testing
let clipboardContent: string = "";

vi.mock("../../src/shared/utils/clipboard", () => ({
  copyToClipboard: vi.fn(async (text: string) => {
    clipboardContent = text;
  }),
  readFromClipboard: vi.fn(async () => {
    return clipboardContent;
  })
}));

vi.mock("../../src/shared/utils/webrtc-config", () => ({
  getDefaultWebRTCConnectionConfig: vi.fn(() => ({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  }))
}));

// ============== Mock Classes ==============

class MockMediaStreamTrack {
  kind: string;
  enabled: boolean = true;
  readyState: string = "live";
  id: string;
  onended: (() => void) | null = null;
  onmute: (() => void) | null = null;
  onunmute: (() => void) | null = null;
  
  constructor(kind: string) {
    this.kind = kind;
    this.id = `track-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  stop() {
    this.readyState = "ended";
    this.onended?.();
  }
  
  clone() {
    return new MockMediaStreamTrack(this.kind);
  }
  
  /* eslint-disable @typescript-eslint/no-unused-vars */
  addEventListener(_event: string, _handler: () => void) {}
  removeEventListener(_event: string, _handler: () => void) {}
  dispatchEvent(_event: Event): boolean { return true; }
  /* eslint-enable @typescript-eslint/no-unused-vars */
  getCapabilities() { return {}; }
  getConstraints() { return {}; }
  getSettings() { return {}; }
  applyConstraints() { return Promise.resolve(); }
}

class MockMediaStream {
  private tracks: MockMediaStreamTrack[] = [];
  active: boolean = true;
  id: string;
  
  constructor(tracks?: MockMediaStreamTrack[]) {
    this.id = `stream-${Math.random().toString(36).substr(2, 9)}`;
    if (tracks) {
      this.tracks = tracks;
    }
  }
  
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === "video"); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === "audio"); }
  addTrack(track: MockMediaStreamTrack) { this.tracks.push(track); }
  removeTrack(track: MockMediaStreamTrack) { this.tracks = this.tracks.filter(t => t !== track); }
  clone() { return new MockMediaStream(this.tracks.map(t => t.clone())); }
  /* eslint-disable @typescript-eslint/no-unused-vars */
  addEventListener(_event: string, _handler: () => void) {}
  removeEventListener(_event: string, _handler: () => void) {}
  dispatchEvent(_event: Event): boolean { return true; }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

globalThis.MediaStream = MockMediaStream as unknown as typeof MediaStream;
globalThis.MediaStreamTrack = MockMediaStreamTrack as unknown as typeof MediaStreamTrack;

type RTCPeerConnectionEventHandler = (...args: unknown[]) => void;

class MockRTCDataChannel {
  label: string;
  readyState: RTCDataChannelState = "connecting";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private linkedChannel: MockRTCDataChannel | null = null;
  
  constructor(label: string) { this.label = label; }
  
  linkChannel(channel: MockRTCDataChannel) {
    this.linkedChannel = channel;
    channel.linkedChannel = this;
  }
  
  send(data: string) {
    if (this.readyState !== "open") throw new Error("Data channel not open");
    if (this.linkedChannel) {
      setTimeout(() => { this.linkedChannel?.onmessage?.({ data } as MessageEvent); }, 5);
    }
  }
  
  close() {
    this.readyState = "closed";
    this.onclose?.();
  }
  
  simulateOpen() {
    this.readyState = "open";
    this.onopen?.();
    if (this.linkedChannel) {
      this.linkedChannel.readyState = "open";
      this.linkedChannel.onopen?.();
    }
  }
}

class MockRTCRtpSender {
  track: MockMediaStreamTrack;
  constructor(track: MockMediaStreamTrack) { this.track = track; }
}

// Track created peer connections
let createdPeerConnections: MockRTCPeerConnection[] = [];

class MockRTCPeerConnection {
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "new";
  
  private linkedPeer: MockRTCPeerConnection | null = null;
  private tracks: MockRTCRtpSender[] = [];
  private dataChannels: Map<string, MockRTCDataChannel> = new Map();
  private eventListeners: Map<string, Set<RTCPeerConnectionEventHandler>> = new Map();
  
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: RTCConfiguration) {
    createdPeerConnections.push(this);
    if (createdPeerConnections.length === 2) {
      createdPeerConnections[0].linkPeer(createdPeerConnections[1]);
    }
  }
  
  linkPeer(peer: MockRTCPeerConnection) {
    this.linkedPeer = peer;
    peer.linkedPeer = this;
  }
  
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: this.generateMockSdp("offer") };
  }
  
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: this.generateMockSdp("answer") };
  }
  
  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
    
    // Simulate ICE gathering synchronously for testing
    this.iceGatheringState = "gathering";
    this.onicegatheringstatechange?.();
    this.dispatchEvent("icegatheringstatechange");
    
    // Emit ICE candidate
    const candidateEvent = {
      candidate: {
        candidate: "candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0
      }
    } as RTCPeerConnectionIceEvent;
    this.onicecandidate?.(candidateEvent);
    this.dispatchEvent("icecandidate", candidateEvent);
    
    // Complete ICE gathering
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.();
    this.dispatchEvent("icegatheringstatechange");
    
    // Emit null candidate
    const nullCandidateEvent = { candidate: null } as RTCPeerConnectionIceEvent;
    this.onicecandidate?.(nullCandidateEvent);
    this.dispatchEvent("icecandidate", nullCandidateEvent);
  }
  
  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
    
    if (this.linkedPeer && desc.type === "offer") {
      this.linkedPeer.dataChannels.forEach((channel, label) => {
        const localChannel = new MockRTCDataChannel(label);
        channel.linkChannel(localChannel);
        this.dataChannels.set(label, localChannel);
        setTimeout(() => {
          this.ondatachannel?.({ channel: localChannel } as unknown as RTCDataChannelEvent);
        }, 5);
      });
    }
  }
  
  createDataChannel(label: string): RTCDataChannel {
    const channel = new MockRTCDataChannel(label);
    this.dataChannels.set(label, channel);
    return channel as unknown as RTCDataChannel;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addTrack(track: MediaStreamTrack, _stream: MediaStream): RTCRtpSender {
    const sender = new MockRTCRtpSender(track as unknown as MockMediaStreamTrack);
    this.tracks.push(sender);
    return sender as unknown as RTCRtpSender;
  }
  
  removeTrack(sender: RTCRtpSender): void {
    const mockSender = sender as unknown as MockRTCRtpSender;
    const index = this.tracks.indexOf(mockSender);
    if (index > -1) this.tracks.splice(index, 1);
  }
  
  addEventListener(event: string, handler: RTCPeerConnectionEventHandler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }
  
  removeEventListener(event: string, handler: RTCPeerConnectionEventHandler) {
    this.eventListeners.get(event)?.delete(handler);
  }
  
  private dispatchEvent(event: string, data?: unknown) {
    this.eventListeners.get(event)?.forEach(handler => handler(data));
  }
  
  close() {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
    this.dataChannels.forEach(channel => channel.close());
    this.dataChannels.clear();
  }
  
  simulateConnection() {
    // Update states first
    this.connectionState = "connected";
    this.iceConnectionState = "connected";
    
    // Then trigger callbacks - these will read the updated state
    this.onconnectionstatechange?.();
    this.oniceconnectionstatechange?.();
    
    // Also dispatch to addEventListener listeners
    this.dispatchEvent("connectionstatechange");
    this.dispatchEvent("iceconnectionstatechange");
    
    // Open all data channels
    this.dataChannels.forEach(channel => channel.simulateOpen());
    
    // Deliver tracks to remote peer
    if (this.linkedPeer) {
      const mockStream = new MockMediaStream(this.tracks.map(sender => sender.track));
      this.linkedPeer.ontrack?.({
        track: this.tracks[0]?.track,
        streams: [mockStream]
      } as unknown as RTCTrackEvent);
    }
  }
  
  private generateMockSdp(type: string): string {
    const iceUfrag = Math.random().toString(36).substr(2, 8);
    const icePwd = Math.random().toString(36).substr(2, 22);
    return `v=0\r\no=- ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\na=msid-semantic: WMS\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 0.0.0.0\r\na=rtcp:9 IN IP4 0.0.0.0\r\na=ice-ufrag:${iceUfrag}\r\na=ice-pwd:${icePwd}\r\na=fingerprint:sha-256 ${this.generateFingerprint()}\r\na=setup:${type === "offer" ? "actpass" : "active"}\r\na=mid:0\r\na=sendrecv\r\na=rtcp-mux\r\na=rtpmap:96 VP8/90000\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nc=IN IP4 0.0.0.0\r\na=rtcp:9 IN IP4 0.0.0.0\r\na=mid:1\r\na=sendrecv\r\na=rtcp-mux\r\na=rtpmap:111 opus/48000/2\r\n`;
  }
  
  private generateFingerprint(): string {
    return Array(32).fill(0).map(() => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()
    ).join(":");
  }
}

class MockRTCSessionDescription {
  type: RTCSdpType;
  sdp: string;
  
  constructor(descInit: RTCSessionDescriptionInit) {
    this.type = descInit.type!;
    this.sdp = descInit.sdp || "";
  }
  
  toJSON() { return { type: this.type, sdp: this.sdp }; }
}

// Store original globals
const originalRTCPeerConnection = globalThis.RTCPeerConnection;
const originalRTCSessionDescription = globalThis.RTCSessionDescription;

// ============== Now import tested modules ==============

import { ConnectionManager } from "../../src/renderer/core/session/connection-manager";
import { 
  encodeConnectionUrl, 
  decodeConnectionUrl, 
  isValidConnectionUrl,
  getRoleFromUrl 
} from "../../src/shared/utils/signaling-url";
import { 
  PeerRole, 
  ConnectionPhase,
  ConnectionManagerCallbacks 
} from "../../src/shared/types/index";

describe("P2P Connection E2E Tests", () => {
  let sharerManager: ConnectionManager;
  let watcherManager: ConnectionManager;
  let sharerCallbacks: ConnectionManagerCallbacks;
  let watcherCallbacks: ConnectionManagerCallbacks;
  let mockVideoElement: HTMLVideoElement;
  
  beforeEach(() => {
    clipboardContent = "";
    createdPeerConnections = [];
    
    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
    globalThis.RTCSessionDescription = MockRTCSessionDescription as unknown as typeof RTCSessionDescription;
    
    const mockDisplayStream = new MockMediaStream([new MockMediaStreamTrack("video")]);
    const mockAudioStream = new MockMediaStream([new MockMediaStreamTrack("audio")]);
    
    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: vi.fn(async () => mockAudioStream),
          getDisplayMedia: vi.fn(async () => mockDisplayStream)
        }
      },
      writable: true,
      configurable: true
    });
    
    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: vi.fn((tag: string) => {
          if (tag === "audio") {
            return { autoplay: false, controls: false, style: { display: "" }, srcObject: null, remove: vi.fn() };
          }
          return {};
        }),
        body: { appendChild: vi.fn() }
      },
      writable: true,
      configurable: true
    });
    
    sharerManager = new ConnectionManager();
    watcherManager = new ConnectionManager();
    
    sharerCallbacks = {
      onPhaseChange: vi.fn(),
      onUrlGenerated: vi.fn(),
      onIceConnectionStateChange: vi.fn(),
      onError: vi.fn(),
      onRemoteStream: vi.fn()
    };
    
    watcherCallbacks = {
      onPhaseChange: vi.fn(),
      onUrlGenerated: vi.fn(),
      onIceConnectionStateChange: vi.fn(),
      onError: vi.fn(),
      onRemoteStream: vi.fn()
    };
    
    sharerManager.setCallbacks(sharerCallbacks);
    watcherManager.setCallbacks(watcherCallbacks);
    
    mockVideoElement = { srcObject: null } as unknown as HTMLVideoElement;
  });
  
  afterEach(async () => {
    await sharerManager.reset();
    await watcherManager.reset();
    
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
    globalThis.RTCSessionDescription = originalRTCSessionDescription;
    
    vi.clearAllMocks();
  });
  
  describe("Complete P2P Connection Flow", () => {
    it("should complete full connection flow: Sharer → URL → Watcher → Answer → Connected", async () => {
      // ==================== Step 1: Sharer starts sharing ====================
      // Sharer clicks "Start Sharing", selects screen, generates Offer URL
      const offerUrl = await sharerManager.startSharing("TestSharer");
      
      // Verify offer URL was generated
      expect(offerUrl).not.toBeNull();
      expect(offerUrl).toContain("lynxscreen://share");
      expect(isValidConnectionUrl(offerUrl!)).toBe(true);
      expect(getRoleFromUrl(offerUrl!)).toBe(PeerRole.SCREEN_SHARER);
      
      // Verify sharer state
      expect(sharerManager.getRole()).toBe(PeerRole.SCREEN_SHARER);
      expect(sharerManager.getCurrentPhase()).toBe(ConnectionPhase.WAITING_FOR_ANSWER);
      expect(sharerCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
      expect(sharerCallbacks.onUrlGenerated).toHaveBeenCalledWith(offerUrl);
      
      // Verify URL was copied to clipboard
      expect(clipboardContent).toBe(offerUrl);
      
      // ==================== Step 2: Simulate URL transfer ====================
      // In real scenario, Sharer sends URL to Watcher via chat tool
      // Here we simulate by keeping the clipboard content
      
      // ==================== Step 3: Watcher processes Offer URL ====================
      // Watcher pastes URL, parses it, generates Answer
      const answerUrl = await watcherManager.joinSession("TestWatcher", mockVideoElement);
      
      // Verify answer URL was generated
      expect(answerUrl).not.toBeNull();
      expect(answerUrl).toContain("lynxscreen://watch");
      expect(isValidConnectionUrl(answerUrl!)).toBe(true);
      expect(getRoleFromUrl(answerUrl!)).toBe(PeerRole.SCREEN_WATCHER);
      
      // Verify watcher state
      expect(watcherManager.getRole()).toBe(PeerRole.SCREEN_WATCHER);
      expect(watcherCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.INITIALIZING);
      expect(watcherCallbacks.onUrlGenerated).toHaveBeenCalledWith(answerUrl);
      
      // Verify Answer URL was copied to clipboard
      expect(clipboardContent).toBe(answerUrl);
      
      // ==================== Step 4: Sharer accepts Answer ====================
      // Sharer pastes Answer URL, parses it, establishes connection
      const accepted = await sharerManager.acceptAnswerUrl();
      
      // Verify answer was accepted
      expect(accepted).toBe(true);
      expect(sharerCallbacks.onPhaseChange).toHaveBeenCalledWith(ConnectionPhase.CONNECTING);
      
      // ==================== Step 5: Simulate P2P Connection ====================
      // Allow any pending async operations to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Trigger connection simulation
      createdPeerConnections.forEach(pc => pc.simulateConnection());
      
      // Wait for callbacks to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify connection state via mock peer connections
      expect(createdPeerConnections.length).toBe(2);
      expect(createdPeerConnections[0].iceConnectionState).toBe("connected");
      expect(createdPeerConnections[1].iceConnectionState).toBe("connected");
      
      // Verify via WebRTC service
      const sharerService = sharerManager.getWebRTCService();
      const watcherService = watcherManager.getWebRTCService();
      
      expect(sharerService).not.toBeNull();
      expect(watcherService).not.toBeNull();
      expect(sharerService!.getIceConnectionState()).toBe("connected");
      expect(watcherService!.getIceConnectionState()).toBe("connected");
    });
  });
  
  describe("URL Encoding/Decoding", () => {
    it("should encode and decode offer URL correctly", async () => {
      const offerUrl = await sharerManager.startSharing("TestUser");
      expect(offerUrl).not.toBeNull();
      
      const decoded = await decodeConnectionUrl(offerUrl!);
      
      expect(decoded).not.toBeNull();
      expect(decoded!.role).toBe(PeerRole.SCREEN_SHARER);
      expect(decoded!.username).toBe("TestUser");
      expect(decoded!.sdp).toBeDefined();
      expect(decoded!.sdp.type).toBe("offer");
    });
  });
  
  describe("Error Handling", () => {
    it("should handle invalid offer URL gracefully", async () => {
      clipboardContent = "invalid-url";
      
      const result = await watcherManager.joinSession("Watcher", mockVideoElement);
      
      expect(result).toBeNull();
      expect(watcherCallbacks.onError).toHaveBeenCalled();
    });
    
    it("should handle accepting answer before starting sharing", async () => {
      const result = await sharerManager.acceptAnswerUrl();
      expect(result).toBe(false);
    });
  });
  
  describe("Disconnect and Cleanup", () => {
    it("should reset to initial state", async () => {
      await sharerManager.startSharing("Sharer");
      await sharerManager.reset();
      
      expect(sharerManager.getCurrentPhase()).toBe(ConnectionPhase.IDLE);
      expect(sharerManager.getRole()).toBeNull();
      expect(sharerManager.getWebRTCService()).toBeNull();
    });
  });
  
  describe("Role Validation", () => {
    it("should correctly identify sharer role", async () => {
      await sharerManager.startSharing("Sharer");
      const service = sharerManager.getWebRTCService();
      
      expect(service?.isScreenSharer()).toBe(true);
      expect(service?.isScreenWatcher()).toBe(false);
    });
    
    it("should correctly identify watcher role", async () => {
      await sharerManager.startSharing("Sharer");
      await watcherManager.joinSession("Watcher", mockVideoElement);
      const service = watcherManager.getWebRTCService();
      
      expect(service?.isScreenSharer()).toBe(false);
      expect(service?.isScreenWatcher()).toBe(true);
    });
  });
});

describe("URL Signaling Integration Tests", () => {
  it("should handle full URL encode/decode cycle", async () => {
    const mockSdp: RTCSessionDescriptionInit = {
      type: "offer",
      sdp: `
      v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:abcd\r\na=ice-pwd:efghijklmnopqrstuvwxyz\r\na=mid:0\r\na=sendrecv\r\n
      `
    };
    
    const url = await encodeConnectionUrl(PeerRole.SCREEN_SHARER, "TestUser", mockSdp);
    
    expect(url).toContain("lynxscreen://share");
    expect(url).toContain("username=");
    expect(url).toContain("token=");
    
    const decoded = await decodeConnectionUrl(url);
    
    expect(decoded).not.toBeNull();
    expect(decoded!.role).toBe(PeerRole.SCREEN_SHARER);
    expect(decoded!.username).toBe("TestUser");
    expect(decoded!.sdp.type).toBe("offer");
    expect(decoded!.sdp.sdp).toContain("v=0");
  });
  
  it("should validate connection URLs correctly", () => {
    expect(isValidConnectionUrl("lynxscreen://share?username=test&token=abc")).toBe(true);
    expect(isValidConnectionUrl("lynxscreen://watch?username=test&token=abc")).toBe(true);
    expect(isValidConnectionUrl("https://example.com")).toBe(false);
    expect(isValidConnectionUrl("invalid-url")).toBe(false);
  });
  
  it("should extract role from URL correctly", () => {
    expect(getRoleFromUrl("lynxscreen://share?username=test&token=abc")).toBe(PeerRole.SCREEN_SHARER);
    expect(getRoleFromUrl("lynxscreen://watch?username=test&token=abc")).toBe(PeerRole.SCREEN_WATCHER);
    expect(getRoleFromUrl("invalid-url")).toBeNull();
  });
});