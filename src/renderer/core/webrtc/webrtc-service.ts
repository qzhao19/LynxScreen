import log from "electron-log/renderer";
import { RemoteCursorState } from "../../../shared/types/index";
import {
  WebRTCSharerConfig,
  WebRTCWatcherConfig,
  WebRTCServiceConfig
} from "../../shared/types/index";
import { getDefaultWebRTCConnectionConfig } from "../../../shared/utils/index";
import { MediaStreamService } from "./media/index";
import { DataChannelService } from "./data/index";
import { PeerConnectionService } from "./connection/index";

/**
 * WebRTC main service.
 * Manages all WebRTC-related functionality using the Facade pattern.
 */
export class WebRTCService {
  private mediaService: MediaStreamService;
  private dataChannelService: DataChannelService;
  private connectionService: PeerConnectionService;
  private config: WebRTCServiceConfig;
  private audioElement: HTMLAudioElement | null = null;
  private isInitialized: boolean = false;
  private combinedRemoteStream: MediaStream | null = null;

  // Allow external consumers to layer their own stream callback on top
  private externalRemoteStreamCallback?: (stream: MediaStream) => void;

  constructor(config: WebRTCServiceConfig) {
    this.config = config;
    this.mediaService = new MediaStreamService();
    this.dataChannelService = new DataChannelService(config.isScreenSharer);

    const connectionConfig = config.connectionConfig || getDefaultWebRTCConnectionConfig();
    this.connectionService = new PeerConnectionService(
      connectionConfig,
      this.dataChannelService
    );
  }

  // ============== Private Helpers ==============

  private isSharerConfig(config: WebRTCServiceConfig): config is WebRTCSharerConfig {
    return config.isScreenSharer === true;
  }

  private isWatcherConfig(config: WebRTCServiceConfig): config is WebRTCWatcherConfig {
    return config.isScreenSharer === false;
  }

  /**
   * Creates a hidden audio element for remote audio playback.
   */
  private createAudioElement(): HTMLAudioElement {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.controls = false;
    audio.style.display = "none";
    document.body.appendChild(audio);
    return audio;
  }

  /**
   * Safely removes the audio element from DOM.
   */
  private removeAudioElement(): void {
    if (!this.audioElement) return;
    try {
      this.audioElement.srcObject = null;
      this.audioElement.remove();
    } catch (error) {
      log.warn("Failed to remove audio element:", error);
    }
    this.audioElement = null;
  }

  /**
   * Sets up screen sharer media tracks (display + audio).
   */
  private async setupSharerMediaTracks(): Promise<void> {
    const displayStream = await this.mediaService.getDisplayMedia();

    if (!displayStream) {
      throw new Error("Display capture failed: user denied permission or no screen available");
    }

    // Add display tracks
    for (const track of displayStream.getTracks()) {
      this.connectionService.addTrack(track, displayStream);
    }

    // Add audio tracks (optional — mic may not be available)
    if (this.config.userConfig.isMicrophoneEnabledOnConnect) {
      const audioStream = this.mediaService.getAudioStream();
      if (audioStream) {
        for (const track of audioStream.getTracks()) {
          track.enabled = this.config.userConfig.isMicrophoneEnabledOnConnect;
          this.connectionService.addTrack(track, audioStream);
        }
      }
    }
  }

  /**
   * Sets up screen watcher media tracks (audio only).
   */
  private async setupWatcherMediaTracks(): Promise<void> {
    if (this.config.userConfig.isMicrophoneEnabledOnConnect) {
      const audioStream = this.mediaService.getAudioStream();
      if (audioStream) {
        for (const track of audioStream.getTracks()) {
          track.enabled = this.config.userConfig.isMicrophoneEnabledOnConnect;
          this.connectionService.addTrack(track, audioStream);
        }
      }
    }
  }

  /**
   * Registers internal callbacks on sub-services.
   * Called once during initialize() — separate method for clarity.
   */
  private setupInternalCallbacks(): void {
    // Handle display stream ending (sharer side)
    this.mediaService.onDisplayEnd(() => {
      log.warn("Display stream ended by user");
      this.disconnect();
    });

    // Handle incoming remote media stream
    this.connectionService.onRemoteStream((stream: MediaStream) => {
      // Merge all incoming tracks into one stable stream.
      // Without this, later ontrack events can overwrite srcObject
      // and drop previously received audio/video tracks.
      if (!this.combinedRemoteStream) {
        this.combinedRemoteStream = new MediaStream();
      }

      for (const track of stream.getTracks()) {
        if (!this.combinedRemoteStream.getTrackById(track.id)) {
          this.combinedRemoteStream.addTrack(track);
        }
      }

      // Watcher: video element plays both remote video + remote audio
      if (this.isWatcherConfig(this.config)) {
        this.config.remoteVideo.srcObject = this.combinedRemoteStream;
      }

      // Sharer: play remote audio via hidden audio element
      if (this.audioElement) {
        this.audioElement.srcObject = this.combinedRemoteStream;
      }

      // Forward combined stream to outer layer
      this.externalRemoteStreamCallback?.(this.combinedRemoteStream);
    });
  }

  /**
   * Ensures the service is initialized and connection is usable.
   */
  private ensureReady(): void {
    if (!this.isInitialized) {
      throw new Error("WebRTC service not initialized. Call initialize() first.");
    }
    const state = this.connectionService.getConnectionState();
    if (state === "failed" || state === "closed") {
      throw new Error(`Connection is in '${state}' state. Cannot proceed.`);
    }
  }

  /**
   * Checks and requests macOS microphone permission via Electron IPC.
   */
  private async ensureMicrophonePermission(): Promise<boolean> {
    try {
      const api = (window as any).electron?.mediaPermission;
      if (!api) return true; // preload not available

      const status: string = await api.getMicrophoneStatus();
      if (status === "granted") return true;
      if (status === "denied" || status === "restricted") {
        log.warn(`[WebRTCService] Microphone permission ${status} at OS level`);
        return false;
      }

      // status is "not-determined" — trigger the macOS permission dialog
      const granted: boolean = await api.requestMicrophoneAccess();
      if (!granted) {
        log.warn("[WebRTCService] User denied microphone permission");
      }
      return granted;
    } catch (error) {
      log.warn("[WebRTCService] Failed to check microphone permission:", error);
      return true; // fall through to let getUserMedia handle it
    }
  }

  private async acquireAndAddAudioTrack(): Promise<boolean> {
    // Ensure macOS microphone permission before calling getUserMedia
    // When isMicrophoneEnabledOnConnect = false, user need to toggle mic
    const permitted = await this.ensureMicrophonePermission();
    if (!permitted) return false;

    // Must actively request user audio here.
    const audioStream = await this.mediaService.getUserAudio();
    if (!audioStream) {
      log.warn("[WebRTCService] Failed to acquire audio stream");
      return false;
    }

    // Add all audio tracks to peer connection so remote peer can hear us.
    for (const track of audioStream.getAudioTracks()) {
      track.enabled = true;
      this.connectionService.addTrack(track, audioStream);
    }

    log.info("[WebRTCService] Audio track added to peer connection dynamically");
    return true;
  }

  // ============== Lifecycle ==============

  /**
   * Initializes the WebRTC service.
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize RTCPeerConnection
      this.connectionService.initialize();

      // Create playback element for remote audio.
      // Sharer needs this regardless of local mic-on setting.
      // Watcher does not need it because remoteVideo already plays audio.
      if (this.isSharerConfig(this.config)) {
        this.audioElement = this.createAudioElement();
      }
      
      // Register internal callbacks
      this.setupInternalCallbacks();

      // Optional: get audio stream
      // Only request microphone permission when user explicitly enables it.
      if (this.config.userConfig.isMicrophoneEnabledOnConnect) {
        const permitted = await this.ensureMicrophonePermission();
        if (permitted) {
          await this.mediaService.getUserAudio();
        }
      }
      
      if (this.isSharerConfig(this.config)) {
        // Sharer: capture screen — will throw if user denies
        await this.setupSharerMediaTracks();
      } else {
        // Watcher: only audio
        await this.setupWatcherMediaTracks();
      }

      this.isInitialized = true;
      log.info("WebRTC service initialized successfully");
    } catch (error) {
      // Cleanup partial initialization
      this.removeAudioElement();
      this.connectionService.close();
      this.mediaService.cleanup();

      log.error("Failed to initialize WebRTC service:", error);
      throw error;
    }
  }

  /**
   * Creates sharer offer (Sharer initiates connection).
   */
  public async createSharerOffer(): Promise<RTCSessionDescriptionInit> {
    this.ensureReady();

    this.connectionService.createDataChannels();
    return await this.connectionService.createOffer();
  }

  /**
   * Creates watcher answer (Watcher responds to Sharer's offer).
   */
  public async createWatcherAnswer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    this.ensureReady();

    return await this.connectionService.createAnswer(offer);
  }

  /**
   * Accepts remote answer to complete the handshake.
   * Used by Sharer to process Watcher's answer.
   */
  public async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.ensureReady();

    await this.connectionService.acceptAnswer(answer);
  }

  // ============== Media Control ==============

  public async toggleMicrophone(): Promise<boolean> {
    if (!this.mediaService.hasAudioInput()) {
      const success = await this.acquireAndAddAudioTrack();
      if (!success) return false;

      return true;
    }

    const currentState = this.mediaService.isAudioTrackActive();
    this.mediaService.toggleAudioTrack(!currentState);
    return this.mediaService.isAudioTrackActive();
  }

  public async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.mediaService.hasAudioInput()) {
      if (!enabled) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const success = await this.acquireAndAddAudioTrack();
      return;
    }

    this.mediaService.toggleAudioTrack(enabled);
  }

  public toggleDisplayStream(): boolean {
    const currentState = this.mediaService.isDisplayTrackActive();
    this.mediaService.toggleVideoTrack(!currentState);
    return this.mediaService.isDisplayTrackActive();
  }

  public setDisplayStreamEnabled(enabled: boolean): void {
    this.mediaService.toggleVideoTrack(enabled);
  }

  public isMicrophoneEnabled(): boolean {
    return this.mediaService.isAudioTrackActive();
  }

  public hasAudioInput(): boolean {
    return this.mediaService.hasAudioInput();
  }

  public getDisplayStream(): MediaStream | null {
    return this.mediaService.getDisplayStream();
  }

  public getAudioStream(): MediaStream | null {
    return this.mediaService.getAudioStream();
  }

  public isDisplayTrackEnabled(): boolean {
    return this.mediaService.isDisplayTrackActive();
  }

  public isDisplayCaptureAlive(): boolean {
    return this.mediaService.isDisplayCaptureAlive();
  }

  // ============== Cursor Control ==============

  public updateRemoteCursor(cursorData: RemoteCursorState): boolean {
    return this.dataChannelService.updateRemoteCursor(cursorData);
  }

  public pingRemoteCursor(cursorId: string): boolean {
    return this.dataChannelService.pingRemoteCursor(cursorId);
  }

  public isCursorPositionsChannelReady(): boolean {
    return this.dataChannelService.isCursorPositionsChannelReady();
  }

  public isCursorPingChannelReady(): boolean {
    return this.dataChannelService.isCursorPingChannelReady();
  }

  public areCursorChannelsReady(): boolean {
    return this.dataChannelService.areCursorChannelsReady();
  }

  public onCursorUpdate(callback: (data: RemoteCursorState) => void): void {
    this.dataChannelService.onCursorUpdate(callback);
  }

  public onCursorPing(callback: (cursorId: string) => void): void {
    this.dataChannelService.onCursorPing(callback);
  }

  public onChannelOpen(callback: (channelName: string) => void): void {
    this.dataChannelService.onChannelOpen(callback);
  }

  public onChannelClose(callback: (channelName: string) => void): void {
    this.dataChannelService.onChannelClose(callback);
  }

  // ============== Connection State ==============

  /**
   * Registers an additional remote stream callback.
   * Does NOT override the internal video/audio setup — layers on top of it.
   */
  public onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.externalRemoteStreamCallback = callback;
  }

  public onIceConnectionStateChange(callback: (state: RTCIceConnectionState) => void): void {
    this.connectionService.onIceConnectionStateChange(callback);
  }

  public onConnectionStateChange(callback: (state: RTCPeerConnectionState) => void): void {
    this.connectionService.onConnectionStateChange(callback);
  }

  public isConnected(): boolean {
    return this.connectionService.isConnected();
  }

  // ============== Disconnect ==============

  /**
   * Disconnects and cleans up all resources.
   */
  public disconnect(): void {
    log.info("Disconnecting WebRTC service...");

    this.mediaService.cleanup();
    this.connectionService.cleanup();
    this.removeAudioElement();
    this.combinedRemoteStream = null;

    if (this.isWatcherConfig(this.config)) {
      this.config.remoteVideo.srcObject = null;
    }

    this.externalRemoteStreamCallback = undefined;
    this.isInitialized = false;

    log.info("WebRTC service disconnected");
  }
}