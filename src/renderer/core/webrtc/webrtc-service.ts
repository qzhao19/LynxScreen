import log from "electron-log";
import { 
  RemoteCursorState,
  WebRTCSharerConfig, 
  WebRTCWatcherConfig, 
  WebRTCServiceConfig
 } from "../../../shared/types/index";
import { getDefaultWebRTCConnectionConfig } from "../../../shared/utils/index";
import { MediaStreamService } from "./media/index";
import { DataChannelService } from "./data/index";
import { PeerConnectionService } from "./connection/index";

/**
 * WebRTC main service
 * Manages all WebRTC-related functionality using the Facade pattern
 */
export class WebRTCService {
  private mediaService: MediaStreamService;
  private dataChannelService: DataChannelService;
  private connectionService: PeerConnectionService;
  private config: WebRTCServiceConfig;
  private audioElement: HTMLAudioElement | null = null;
  private isInitialized: boolean = false;

  constructor(config: WebRTCServiceConfig) {
    this.config = config;
    this.mediaService = new MediaStreamService();
    // Use isScreenSharer to explicitly determine role
    this.dataChannelService = new DataChannelService(config.isScreenSharer);

    // use default ICE servers when not provided
    const connectionConfig = config.connectionConfig || getDefaultWebRTCConnectionConfig();

    this.connectionService = new PeerConnectionService(
      connectionConfig,
      this.dataChannelService
    );
  }

  /**
   * Type guard to check if config is for screen sharer
   */
  private isSharerConfig(config: WebRTCServiceConfig): config is WebRTCSharerConfig {
    return config.isScreenSharer === true;
  }

  /**
   * Type guard to check if config is for screen watcher
   */
  private isWatcherConfig(config: WebRTCServiceConfig): config is WebRTCWatcherConfig {
    return config.isScreenSharer === false;
  }

  /**
   * Creates an HTMLAudioElement for playing remote audio
   */
  private createAudioElement(): HTMLAudioElement {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.controls = false;
    // Add to DOM to ensure audio playback
    audio.style.display = "none";
    document.body.appendChild(audio);
    return audio;
  }

  /**
   * Sets up screen sharer media tracks (display + audio)
   */
  private async setupSharerMediaTracks(): Promise<void> {
    const displayStream = await this.mediaService.getDisplayMedia().catch(error => {
      log.warn("Display capture failed:", error);
      return null;
    });

    if (!displayStream) {
      log.warn("Failed to get display media, sharer cannot share screen");
      return;
    }

    // Add display tracks
    for (const track of displayStream.getTracks()) {
      this.connectionService.addTrack(track, displayStream);
    }

    // Add audio tracks to display stream
    const audioStream = this.mediaService.getAudioStream();
    if (audioStream) {
      for (const track of audioStream.getTracks()) {
        track.enabled = this.config.userConfig.isMicrophoneEnabledOnConnect;
        this.connectionService.addTrack(track, displayStream);
      }
    }
  }

  /**
   * Sets up screen watcher media tracks (audio only)
   */
  private async setupWatcherMediaTracks(): Promise<void> {
    const audioStream = this.mediaService.getAudioStream();

    if (audioStream) {
      for (const track of audioStream.getTracks()) {
        track.enabled = this.config.userConfig.isMicrophoneEnabledOnConnect;
        this.connectionService.addTrack(track, audioStream);
      }
    }
  }

  /**
   * Initializes the WebRTC service
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize connection
      await this.connectionService.initialize();

      // Create audio element (implemented in this class)
      this.audioElement = this.createAudioElement();

       // Notify when user stops screen sharing
      this.mediaService.onDisplayEnd(() => {
        log.warn("Display stream ended by user");
        this.disconnect(); // Cleanup
      });

      // Set track receiving callback
      this.connectionService.onRemoteStream((stream: MediaStream) => {
        // Set video source for watcher
        if (this.isWatcherConfig(this.config)) {
          this.config.remoteVideo.srcObject = stream;
        }
        // Set audio source
        if (this.audioElement) {
          this.audioElement.srcObject = stream;
        }
      });

      // Get audio stream
      await this.mediaService.getUserAudio().catch(error => {
        log.error("Audio permission denied or unavailable:", error);
      });

      if (this.isScreenSharer()) {
        // screenSharer mode: get screen sharing
        await this.setupSharerMediaTracks();
      } else {
        // screenWatcher mode: only add audio
        await this.setupWatcherMediaTracks();
      }

      this.isInitialized = true;
      log.info("WebRTC service initialized successfully");
    } catch (error) {
      // Cleanup audio element on failure
      if (this.audioElement) {
        this.audioElement.remove();
        this.audioElement = null;
      }
      
      log.error("Failed to setup WebRTC service:", error);
      throw error;
    }
  }

  /**
   * Creates sharer offer (screen sharer initiates connection)
   */
  public async createSharerOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.isInitialized) {
      throw new Error("WebRTC service not initialized. Call setup() first.");
    }

    // Create data channels
    this.connectionService.createDataChannels();

    // Create offer
    return await this.connectionService.createOffer();
  }

  /**
   * Creates watcher answer (screen watcher responds to offer)
   */
  public async createWatcherAnswer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.isInitialized) {
      throw new Error("WebRTC service not initialized. Call setup() first.");
    }
    return await this.connectionService.createAnswer(offer);
  }

  /**
   * Accepts remote answer to complete connection
   * Used by sharer to receive watcher's answer
   */
  public async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("WebRTC service not initialized. Call setup() first.");
    }
    await this.connectionService.acceptAnswer(answer);
  }

  // ============== Media Control ==============

  /**
   * Toggles microphone state
   * @returns Whether microphone is currently enabled
   */
  public toggleMicrophone(): boolean {
    // Get current state and toggle
    const currentState = this.mediaService.isAudioTrackActive();
    this.mediaService.toggleAudioTrack(!currentState);
    return this.mediaService.isAudioTrackActive();
  }

  /**
   * Sets microphone state
   * @param enabled - Whether to enable microphone
   */
  public setMicrophoneEnabled(enabled: boolean): void {
    this.mediaService.toggleAudioTrack(enabled);
  }

  /**
   * Toggles display stream state
   * @returns Whether display stream is currently enabled
   */
  public toggleDisplayStream(): boolean {
    // Get current state and toggle
    const currentState = this.mediaService.isVideoTrackActive();
    this.mediaService.toggleVideoTrack(!currentState);
    return this.mediaService.isVideoTrackActive();
  }

  /**
   * Sets display stream state
   * @param enabled - Whether to enable display stream
   */
  public setDisplayStreamEnabled(enabled: boolean): void {
    this.mediaService.toggleVideoTrack(enabled);
  }

  /**
   * Checks if microphone is active
   */
  public isMicrophoneActive(): boolean {
    return this.mediaService.isAudioTrackActive();
  }

  /**
   * Checks if audio input is available
   */
  public hasAudioInput(): boolean {
    return this.mediaService.hasAudioInput();
  }

  /**
   * Gets audio stream
   */
  public getAudioStream(): MediaStream | null {
    return this.mediaService.getAudioStream();
  }

  /**
   * Checks if display stream is active
   */
  public isDisplayStreamActive(): boolean {
    return this.mediaService.isVideoTrackActive();
  }

  /**
   * Checks if display sharing is active
   */
  public isDisplayActive(): boolean {
    return this.mediaService.isDisplayActive();
  }

  // ============== Cursor Control ==============

  /**
   * Updates remote cursor
   */
  public updateRemoteCursor(cursorData: RemoteCursorState): boolean {
    return this.dataChannelService.sendCursorUpdate(cursorData);
  }

  /**
   * Pings remote cursor
   */
  public pingRemoteCursor(cursorId: string): boolean {
    return this.dataChannelService.sendCursorPing(cursorId);
  }

  /**
   * Toggles remote cursors
   */
  public toggleRemoteCursors(enabled: boolean): boolean {
    return this.dataChannelService.toggleCursors(enabled);
  }

  /**
   * Checks if cursors are enabled
   */
  public isCursorsEnabled(): boolean {
    return this.dataChannelService.isCursorsEnabled();
  }

  /**
   * Checks if data channels are ready
   */
  public areDataChannelsReady(): boolean {
    return this.dataChannelService.areAllChannelsReady();
  }

  /**
   * Registers cursor update callback
   */
  public onCursorUpdate(callback: (data: RemoteCursorState) => void): void {
    this.dataChannelService.onCursorUpdate(callback);
  }

  /**
   * Registers cursor ping callback
   */
  public onCursorPing(callback: (cursorId: string) => void): void {
    this.dataChannelService.onCursorPing(callback);
  }

  /**
   * Registers data channel open callback
   */
  public onChannelOpen(callback: (channelName: string) => void): void {
    this.dataChannelService.onChannelOpen(callback);
  }

  /**
   * Registers data channel close callback
   */
  public onChannelClose(callback: (channelName: string) => void): void {
    this.dataChannelService.onChannelClose(callback);
  }

  // ============== Connection State ==============

  /**
   * Registers remote track callback (pass-through to PeerConnectionService)
   */
  public onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.connectionService.onRemoteStream(callback);
  }

  /**
   * Registers connection state change callback
   */
  public onIceConnectionStateChange(callback: (state: RTCIceConnectionState) => void): void {
    this.connectionService.onIceConnectionStateChange(callback);
  }

  /**
   * Checks if connected
   */
  public isConnected(): boolean {
    return this.connectionService.isConnected();
  }

  /**
   * Gets connection state
   */
  public getConnectionState(): RTCPeerConnectionState | null {
    return this.connectionService.getConnectionState();
  }

  /**
   * Gets ICE connection state
   */
  public getIceConnectionState(): RTCIceConnectionState | null {
    return this.connectionService.getIceConnectionState();
  }

  // ============== Lifecycle ==============

  /**
   * Disconnects and cleans up resources
   */
  public async disconnect(): Promise<void> {
    log.info("Disconnecting WebRTC service...");

    // Clean up media
    this.mediaService.cleanup();

    // Clean up connection
    this.connectionService.cleanup();

    // Clean up audio element
    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement.remove();
      this.audioElement = null;
    }

    // Clean up video element
    if (this.isWatcherConfig(this.config)) {
      this.config.remoteVideo.srcObject = null;
    }

    this.isInitialized = false;
    log.info("WebRTC service disconnected");
  }

  /**
   * Checks if service is initialized
   */
  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Checks if current role is screen sharer
   */
  public isScreenSharer(): boolean {
    return this.config.isScreenSharer;
  }

  /**
   * Checks if current role is screen watcher
   */
  public isScreenWatcher(): boolean {
    return !this.config.isScreenSharer;
  }
}