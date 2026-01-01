import log from "electron-log";
import type { RemoteCursorState } from "../../../shared/types/index";
import { WebRTCConnectionState, WebRTCServiceConfig } from "../../shared/types/index";
import { MediaStreamService } from "./media-stream";
import { DataChannelService } from "./data-channel";
import { WebRTCConnectionService } from "./peer-connection";

/**
 * WebRTC main service
 * Manages all WebRTC-related functionality using the Facade pattern
 */
export class WebRTCService {
  private mediaService: MediaStreamService;
  private dataChannelService: DataChannelService;
  private connectionService: WebRTCConnectionService;
  private config: WebRTCServiceConfig;
  private audioElement: HTMLAudioElement | null = null;
  private isInitialized: boolean = false;

  constructor(config: WebRTCServiceConfig) {
    this.config = config;
    this.mediaService = new MediaStreamService();
    // Use isScreenSharer to explicitly determine role
    this.dataChannelService = new DataChannelService(config.isScreenSharer);

    this.connectionService = new WebRTCConnectionService(
      { iceServers: config.settings.iceServers },
      this.dataChannelService
    );
  }

  /**
   * Initializes the WebRTC service
   */
  async setup(): Promise<void> {
    try {
      // Initialize connection
      await this.connectionService.initialize();

      // Create audio element (implemented in this class)
      this.audioElement = this.createAudioElement();

      // Set track receiving callback
      this.connectionService.onTrack((stream: MediaStream) => {
        // Set video source
        if (this.config.remoteVideo) {
          this.config.remoteVideo.srcObject = stream;
        }
        // Set audio source
        if (this.audioElement) {
          this.audioElement.srcObject = stream;
        }
      });

      // Get audio stream
      await this.mediaService.getUserAudio();

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
   * Creates an HTMLAudioElement for playing remote audio
   */
  private createAudioElement(): HTMLAudioElement {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.controls = false;
    // Add to DOM to ensure audio playback
    audio.style.display = 'none';
    document.body.appendChild(audio);
    return audio;
  }

  /**
   * Sets up screen sharer media tracks (display + audio)
   */
  private async setupSharerMediaTracks(): Promise<void> {
    const displayStream = await this.mediaService.getDisplayMedia().catch(err => {
      log.warn("Display capture failed:", err);
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
        track.enabled = this.config.settings.isMicrophoneEnabledOnConnect;
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
        track.enabled = this.config.settings.isMicrophoneEnabledOnConnect;
        this.connectionService.addTrack(track, audioStream);
      }
    }
  }

  /**
   * Creates sharer offer (screen sharer initiates connection)
   */
  async createSharerOffer(): Promise<RTCSessionDescriptionInit> {
    this.ensureInitialized();

    // Create data channels
    this.connectionService.createDataChannels();

    // Create offer
    return await this.connectionService.createOffer();
  }

  /**
   * Creates watcher answer (screen watcher responds to offer)
   */
  async createWatcherAnswer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    this.ensureInitialized();
    return await this.connectionService.createAnswer(offer);
  }

  /**
   * Accepts remote answer to complete connection
   * Used by sharer to receive watcher's answer
   */
  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.ensureInitialized();
    await this.connectionService.acceptAnswer(answer);
  }

  // ============== Media Control ==============

  /**
   * Toggles microphone state
   * @returns Whether microphone is currently enabled
   */
  toggleMicrophone(): boolean {
    // Get current state and toggle
    const currentState = this.mediaService.isAudioTrackActive();
    this.mediaService.toggleAudioTrack(!currentState);
    return !currentState;
  }

  /**
   * Sets microphone state
   * @param enabled - Whether to enable microphone
   */
  setMicrophoneEnabled(enabled: boolean): void {
    this.mediaService.toggleAudioTrack(enabled);
  }

  /**
   * Toggles display stream state
   * @returns Whether display stream is currently enabled
   */
  toggleDisplayStream(): boolean {
    // Get current state and toggle
    const currentState = this.mediaService.isVideoTrackActive();
    this.mediaService.toggleVideoTrack(!currentState);
    return !currentState;
  }

  /**
   * Sets display stream state
   * @param enabled - Whether to enable display stream
   */
  setDisplayStreamEnabled(enabled: boolean): void {
    this.mediaService.toggleVideoTrack(enabled);
  }

  /**
   * Checks if microphone is active
   */
  isMicrophoneActive(): boolean {
    return this.mediaService.isAudioTrackActive();
  }

  /**
   * Checks if audio input is available
   */
  hasAudioInput(): boolean {
    return this.mediaService.hasAudioInput();
  }

  /**
   * Gets audio stream
   */
  getAudioStream(): MediaStream | null {
    return this.mediaService.getAudioStream();
  }

  /**
   * Checks if display stream is active
   */
  isDisplayStreamActive(): boolean {
    return this.mediaService.isVideoTrackActive();
  }

  /**
   * Checks if display sharing is active
   */
  isDisplayActive(): boolean {
    return this.mediaService.isDisplayActive();
  }

  // ============== Cursor Control ==============

  /**
   * Updates remote cursor
   */
  updateRemoteCursor(cursorData: RemoteCursorState): boolean {
    return this.dataChannelService.sendCursorUpdate(cursorData);
  }

  /**
   * Pings remote cursor
   */
  pingRemoteCursor(cursorId: string): boolean {
    return this.dataChannelService.sendCursorPing(cursorId);
  }

  /**
   * Toggles remote cursors
   */
  toggleRemoteCursors(enabled: boolean): boolean {
    return this.dataChannelService.toggleCursors(enabled);
  }

  /**
   * Checks if cursors are enabled
   */
  isCursorsEnabled(): boolean {
    return this.dataChannelService.isCursorsEnabled();
  }

  /**
   * Checks if data channels are ready
   */
  areDataChannelsReady(): boolean {
    return this.dataChannelService.areAllChannelsReady();
  }

  /**
   * Registers cursor update callback
   */
  onCursorUpdate(callback: (data: RemoteCursorState) => void): void {
    this.dataChannelService.onCursorUpdate(callback);
  }

  /**
   * Registers cursor ping callback
   */
  onCursorPing(callback: (cursorId: string) => void): void {
    this.dataChannelService.onCursorPing(callback);
  }

  /**
   * Registers data channel open callback
   */
  onChannelOpen(callback: (channelName: string) => void): void {
    this.dataChannelService.onChannelOpen(callback);
  }

  /**
   * Registers data channel close callback
   */
  onChannelClose(callback: (channelName: string) => void): void {
    this.dataChannelService.onChannelClose(callback);
  }

  // ============== Connection State ==============

  /**
   * Registers connection state change callback
   */
  onConnectionStateChange(callback: (state: WebRTCConnectionState) => void): void {
    this.connectionService.onConnectionStateChange(callback);
  }

  /**
   * Checks if connected
   */
  isConnected(): boolean {
    return this.connectionService.isConnected();
  }

  /**
   * Gets connection state
   */
  getConnectionState(): RTCPeerConnectionState | null {
    return this.connectionService.getConnectionState();
  }

  /**
   * Gets ICE connection state
   */
  getIceConnectionState(): RTCIceConnectionState | null {
    return this.connectionService.getIceConnectionState();
  }

  // ============== Lifecycle ==============

  /**
   * Disconnects and cleans up resources
   */
  async disconnect(): Promise<void> {
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
    if (this.config.remoteVideo) {
      this.config.remoteVideo.srcObject = null;
    }

    this.isInitialized = false;
    log.info("WebRTC service disconnected");
  }

  /**
   * Checks if service is initialized
   */
  isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Checks if current role is screen sharer
   */
  isScreenSharer(): boolean {
    return this.config.isScreenSharer;
  }

  /**
   * Checks if current role is screen watcher
   */
  isScreenWatcher(): boolean {
    return !this.config.isScreenSharer;
  }

  /**
   * Ensures service is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("WebRTC service not initialized. Call setup() first.");
    }
  }
}