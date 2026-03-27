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
      // Set video source for watcher
      if (this.isWatcherConfig(this.config)) {
        this.config.remoteVideo.srcObject = stream;
      }

      // Set audio source
      if (this.audioElement) {
        this.audioElement.srcObject = stream;
      }

      // Also forward to external callback if registered
      this.externalRemoteStreamCallback?.(stream);
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

  private async acquireAndAddAudioTrack(): Promise<boolean> {
    const audioStream = this.mediaService.getAudioStream();
    if (!audioStream) {
      log.warn("[WebRTCService] Failed to acquire audio stream");
      return false;
    }
    // Add all audio tracks to the peer connection so remote peer receives audio.
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

      // Create audio element for remote audio playback
      if (this.config.userConfig.isMicrophoneEnabledOnConnect) {
        this.audioElement = this.createAudioElement();
      }
      
      // Register internal callbacks
      this.setupInternalCallbacks();

      // Optional: get audio stream
      // Only request microphone permission when user explicitly enables it.
      if (this.config.userConfig.isMicrophoneEnabledOnConnect) {
        await this.mediaService.getUserAudio();
      }
      
      if (this.isScreenSharer()) {
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
    const currentState = this.mediaService.isDisplayStreamActive();
    this.mediaService.toggleVideoTrack(!currentState);
    return this.mediaService.isDisplayStreamActive();
  }

  public setDisplayStreamEnabled(enabled: boolean): void {
    this.mediaService.toggleVideoTrack(enabled);
  }

  public isMicrophoneActive(): boolean {
    return this.mediaService.isAudioTrackActive();
  }

  public getDisplayStream(): MediaStream | null {
    return this.mediaService.getDisplayStream();
  }

  public hasAudioInput(): boolean {
    return this.mediaService.hasAudioInput();
  }

  public getAudioStream(): MediaStream | null {
    return this.mediaService.getAudioStream();
  }

  public isDisplayStreamActive(): boolean {
    return this.mediaService.isDisplayStreamActive();
  }

  public isDisplayActive(): boolean {
    return this.mediaService.isDisplayActive();
  }

  // ============== Cursor Control ==============

  public updateRemoteCursor(cursorData: RemoteCursorState): boolean {
    return this.dataChannelService.updateRemoteCursor(cursorData);
  }

  public pingRemoteCursor(cursorId: string): boolean {
    return this.dataChannelService.pingRemoteCursor(cursorId);
  }

  public toggleRemoteCursors(enabled: boolean): boolean {
    return this.dataChannelService.toggleCursors(enabled);
  }

  public isCursorsEnabled(): boolean {
    return this.dataChannelService.isCursorsEnabled();
  }

  public isCursorPositionsChannelReady(): boolean {
    return this.dataChannelService.isCursorPositionsChannelReady();
  }

  public isCursorPingChannelReady(): boolean {
    return this.dataChannelService.isCursorPingChannelReady();
  }

  public areDataChannelsReady(): boolean {
    return this.dataChannelService.areAllChannelsReady();
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

  public getConnectionState(): RTCPeerConnectionState | null {
    return this.connectionService.getConnectionState();
  }

  public getIceConnectionState(): RTCIceConnectionState | null {
    return this.connectionService.getIceConnectionState();
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

    if (this.isWatcherConfig(this.config)) {
      this.config.remoteVideo.srcObject = null;
    }

    this.externalRemoteStreamCallback = undefined;
    this.isInitialized = false;

    log.info("WebRTC service disconnected");
  }

  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  public isScreenSharer(): boolean {
    return this.config.isScreenSharer;
  }

  public isScreenWatcher(): boolean {
    return !this.config.isScreenSharer;
  }
}