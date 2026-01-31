import log from "electron-log";
import { WebRTCService } from "../webrtc/index";
import { 
  encodeConnectionUrl, 
  decodeConnectionUrl, 
  copyToClipboard, 
  readFromClipboard,
  isValidConnectionUrl,
  getRoleFromUrl
} from "../../../shared/utils/index";
import { 
  PeerRole, 
  ConnectionPhase,
  ConnectionManagerCallbacks,
  RemoteCursorState
} from "../../../shared/types/index";
import { WebRTCServiceConfig } from "../../shared/types/index";

/**
 * Manages the complete P2P connection flow for screen sharing.
 * Handle WebRTC service, URL encoding/decoding, and clipboard operations.
 */
export class ConnectionManager {
  private webrtcService: WebRTCService | null = null;
  private currentPhase: ConnectionPhase = ConnectionPhase.IDLE;
  private role: PeerRole | null = null;
  private username: string = "";
  private callbacks: ConnectionManagerCallbacks = {};
  private isOperationInProgress = false;

  /**
   * Sets callback handlers for connection events
   */
  public setCallbacks(callbacks: ConnectionManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Updates and notifies connection phase change
   */
  private setConnectionPhase(phase: ConnectionPhase): void {
    if (this.currentPhase === phase) return;
    this.currentPhase = phase;
    log.info(`[ConnectionManager] State changed: ${phase}`);
    this.callbacks.onPhaseChange?.(phase);
  }

  /**
   * Handles errors
   */
  private handleError(message: string, error: unknown): void {
    const errorMsg = error instanceof Error ? error : new Error(String(error));
    log.error(`[ConnectionManager] ${message}:`, errorMsg);
    this.setConnectionPhase(ConnectionPhase.ERROR);
    this.callbacks.onError?.(errorMsg);
  }

  /**
   * Acquires the operation lock to prevent concurrent async operations
   */
  private acquireOperationLock(): boolean {
    if (this.isOperationInProgress) {
      log.warn("[ConnectionManager] Operation in progress");
      return false;
    }
    this.isOperationInProgress = true;
    return true;
  }

  /**
   * Releases the operation lock after async operation completes
   */
  private releaseOperationLock(): void {
    this.isOperationInProgress = false;
  }

  /**
   * Sets up WebRTC connection state callbacks
   */
  private setupServiceCallbacks(): void {
    if (!this.webrtcService) return;

    // Setup ICE step
    this.webrtcService.onIceConnectionStateChange((state) => {
      this.callbacks.onIceConnectionStateChange?.(state);
      switch (state) {
        case "checking":
          this.setConnectionPhase(ConnectionPhase.CONNECTING);
          break;
        case "connected":
        case "completed":
          this.setConnectionPhase(ConnectionPhase.CONNECTED);
          break;
        case "disconnected":
        case "failed":
        case "closed":
          if (this.currentPhase === ConnectionPhase.CONNECTED ||
              this.currentPhase === ConnectionPhase.CONNECTING) {
            this.setConnectionPhase(ConnectionPhase.DISCONNECTED);
          }
          break;
      }
    });

    // Setup remote media stream callback
    this.webrtcService.onRemoteStream((stream) => {
      this.callbacks.onRemoteStream?.(stream);
    });
  }

  // ============== SHARER FLOW ==============

  /**
   * Initialize and create offer URL
   * Called when user clicks "Start Sharing"
   */
  public async startSharing(
    username: string, 
    config?: Partial<WebRTCServiceConfig>
  ): Promise<string | null> {

    if (!this.acquireOperationLock()) return null;
    try {
      this.setConnectionPhase(ConnectionPhase.INITIALIZING);
      this.role = PeerRole.SCREEN_SHARER;
      this.username = username;

      // Create WebRTC service for sharer
      const serviceConfig: WebRTCServiceConfig = {
        isScreenSharer: true,
        userConfig: {
          username,
          isMicrophoneEnabledOnConnect: config?.userConfig?.isMicrophoneEnabledOnConnect ?? false,
        },
        connectionConfig: config?.connectionConfig
      };

      this.webrtcService = new WebRTCService(serviceConfig);

      // Setup connection state callback
      this.setupServiceCallbacks();
      
      // Initialize screen captures, audio
      await this.webrtcService.initialize();

      // Create offer
      const offer = await this.webrtcService.createSharerOffer();

      // Encode a WebRTC SessionDescription to URL
      const offerUrl = await encodeConnectionUrl(PeerRole.SCREEN_SHARER, username, offer);

      // Copy URL to clipboard
      await copyToClipboard(offerUrl);

      //Setup connetion step as offer-created
      this.setConnectionPhase(ConnectionPhase.OFFER_CREATED);
      this.setConnectionPhase(ConnectionPhase.WAITING_FOR_ANSWER);
      this.callbacks.onUrlGenerated?.(offerUrl); 

      log.info("[ConnectionManager] Offer URL created and copied to clipboard");
      return offerUrl;
    } catch (error) {
      this.handleError("Failed to start sharing", error);
      await this.disconnect();
      return null;
    } finally {
      this.releaseOperationLock();
    }
  }

  /**
   * Accept answer URL from watcher
   * Called when sharer pastes the answer URL
   */
  public async acceptAnswerUrl(): Promise<boolean> {
    if (!this.acquireOperationLock()) return false;
    try {
      if (!this.webrtcService || this.role !== PeerRole.SCREEN_SHARER) {
        throw new Error("Not initialized as sharer");
      }

      this.setConnectionPhase(ConnectionPhase.CONNECTING);

      // Read URL from clipboard
      const url = await readFromClipboard();
      if (!url) {
        throw new Error("No URL in clipboard");
      }

      // Validate URL
      if (!isValidConnectionUrl(url)) {
        throw new Error("Invalid connection URL");
      }

      // Check it's an answer (from watcher)
      const urlRole = getRoleFromUrl(url);
      if (urlRole !== PeerRole.SCREEN_WATCHER) {
        throw new Error("Expected answer URL from watcher, got offer URL");
      }

      // Decode URL
      const decoded = await decodeConnectionUrl(url);
      if (!decoded) {
        throw new Error("Failed to decode answer URL");
      }

      // Accept teh answer
      await this.webrtcService.acceptAnswer(decoded.sdp);

      log.info(`[ConnectionManager] Accepted answer from: ${decoded.username}`);
      // Connection state will change to "connected" via callback
      return true;
    } catch (error) {
      this.handleError("Failed to accept answer", error);
      return false;
    } finally {
      this.releaseOperationLock();
    }
  }

  // ============== WATCHER FLOW ==============

  /**
   * Process offer URL and create answer
   * Called when watcher pastes the offer URL
   */
  public async joinSession(
    username: string, 
    remoteVideo: HTMLVideoElement, 
    config?: Partial<WebRTCServiceConfig>
  ): Promise<string | null> {
    if (!this.acquireOperationLock()) return null;
    try {
      this.setConnectionPhase(ConnectionPhase.INITIALIZING);
      this.role = PeerRole.SCREEN_WATCHER;
      this.username = username;

      // Read URL from clipboard
      const url = await readFromClipboard();
      if (!url) {
        throw new Error("No URL in clipboard");
      }

      // Validate URL
      if (!isValidConnectionUrl(url)) {
        throw new Error("Invalid connection URL");
      }

      // Check it's an offer (from sharer)
      const urlRole = getRoleFromUrl(url);
      if (urlRole !== PeerRole.SCREEN_SHARER) {
        throw new Error("Expected offer URL from sharer, got answer URL");
      }

      // Decode URL
      const decoded = await decodeConnectionUrl(url);
      if (!decoded) {
        throw new Error("Failed to decode offer URL");
      }

      log.info(`[ConnectionManager] Joining session from: ${decoded.username}`);

      // Create WebRTC service config for watcher
      const serviceConfig: WebRTCServiceConfig = {
        isScreenSharer: false,
        remoteVideo: remoteVideo,
        userConfig: {
          username,
          isMicrophoneEnabledOnConnect: config?.userConfig?.isMicrophoneEnabledOnConnect || false,
        },
        connectionConfig: config?.connectionConfig
      };

      this.webrtcService = new WebRTCService(serviceConfig);

      // Call connection state callback
      this.setupServiceCallbacks();

      // Initialize
      await this.webrtcService.initialize();

      // Create answer from offer
      const answer = await this.webrtcService.createWatcherAnswer(decoded.sdp);

      // Encode answer URL
      const answerUrl = await encodeConnectionUrl(PeerRole.SCREEN_WATCHER, username, answer);

      // Copy to clipboard
      await copyToClipboard(answerUrl);

      this.setConnectionPhase(ConnectionPhase.ANSWER_CREATED);
      this.callbacks.onUrlGenerated?.(answerUrl);

      log.info("[ConnectionManager] Answer URL created and copied to clipboard");
      return answerUrl;
    } catch (error) {
      this.handleError("Failed to join session", error);
      return null;
    } finally {
      this.releaseOperationLock();
    }
  }

  // ============== CURSOR CONTROL ==============

  /**
   * Checks if cursor positions channel is ready
   */
  public isCursorPositionsChannelReady(): boolean {
    return this.webrtcService?.isCursorPositionsChannelReady() ?? false;
  }

  /**
   * Checks if cursor ping channel is ready
   * 
   * OPTIONAL FEATURE: Related to cursor keep-alive mechanism.
   * Currently not used in frontend - kept for future enhancements.
   */
  public isCursorPingChannelReady(): boolean {
    return this.webrtcService?.isCursorPingChannelReady() ?? false;
  }

  /**
   * Registers callback for data channel open events
   */
  public onChannelOpen(callback: (channelName: string) => void): void {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot register channel open callback: not initialized");
      return;
    }
    this.webrtcService.onChannelOpen(callback);
  }

  /**
   * Registers callback for data channel close events
   */
  public onChannelClose(callback: (channelName: string) => void): void {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot register channel close callback: not initialized");
      return;
    }
    this.webrtcService.onChannelClose(callback);
  }

  /**
   * Updates remote cursor position (called by watcher)
   */
  public updateRemoteCursor(cursorData: RemoteCursorState): boolean {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot update cursor: not connected");
      return false;
    }
    return this.webrtcService.updateRemoteCursor(cursorData);
  }

  /**
   * Registers callback for receiving cursor updates (for sharer)
   */
  public onCursorUpdate(callback: (data: RemoteCursorState) => void): void {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot register cursor callback: not initialized");
      return;
    }
    this.webrtcService.onCursorUpdate(callback);
  }

  /**
   * Toggles cursor synchronization
   */
  public toggleRemoteCursors(enabled: boolean): boolean {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot toggle cursors: not connected");
      return false;
    }
    return this.webrtcService.toggleRemoteCursors(enabled);
  }

  /**
   * Checks if cursor synchronization is enabled
   */
  public isCursorsEnabled(): boolean {
    return this.webrtcService?.isCursorsEnabled() ?? false;
  }

  /**
   * Checks if data channels are ready for cursor sync
   */
  public areCursorChannelsReady(): boolean {
    return this.webrtcService?.areDataChannelsReady() ?? false;
  }

  // ============== MEDIA CONTROL ==============

  /**
   * Toggles microphone state
   * @returns Current microphone enabled state
   */
  public toggleMicrophone(): boolean {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot toggle microphone: not connected");
      return false;
    }
    return this.webrtcService.toggleMicrophone();
  }

  /**
   * Sets microphone enabled state
   * @param enabled - Whether to enable microphone
   */
  public setMicrophoneEnabled(enabled: boolean): void {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot set microphone state: not connected");
      return;
    }
    this.webrtcService.setMicrophoneEnabled(enabled);
  }

  /**
   * Toggles display stream state
   * @returns Current display stream enabled state
   */
  public toggleDisplayStream(): boolean {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot toggle display stream: not connected");
      return false;
    }
    return this.webrtcService.toggleDisplayStream();
  }

  /**
   * Sets display stream enabled state
   * @param enabled - Whether to enable display stream
   */
  public setDisplayStreamEnabled(enabled: boolean): void {
    if (!this.webrtcService) {
      log.warn("[ConnectionManager] Cannot set display stream state: not connected");
      return;
    }
    this.webrtcService.setDisplayStreamEnabled(enabled);
  }

  /**
   * Checks if microphone is active
   */
  public isMicrophoneActive(): boolean {
    return this.webrtcService?.isMicrophoneActive() ?? false;
  }

  /**
   * Checks if audio input is available
   */
  public hasAudioInput(): boolean {
    return this.webrtcService?.hasAudioInput() ?? false;
  }

  /**
   * Gets audio stream
   */
  public getAudioStream(): MediaStream | null {
    return this.webrtcService?.getAudioStream() ?? null;
  }

  /**
   * Gets display stream
   */
  public getDisplayStream(): MediaStream | null {
    return this.webrtcService?.getDisplayStream() ?? null;
  }

  /**
   * Checks if display stream is active (tracks enabled)
   */
  public isDisplayStreamActive(): boolean {
    return this.webrtcService?.isDisplayStreamActive() ?? false;
  }

  /**
   * Checks if display is actively capturing
   */
  public isDisplayActive(): boolean {
    return this.webrtcService?.isDisplayActive() ?? false;
  }

  // ============== CONNECTION STATE ==============

  /**
   * Gets the current peer connection state
   */
  public getConnectionState(): RTCPeerConnectionState | null {
    return this.webrtcService?.getConnectionState() ?? null;
  }

  /**
   * Gets the current ICE connection state
   */
  public getIceConnectionState(): RTCIceConnectionState | null {
    return this.webrtcService?.getIceConnectionState() ?? null;
  }

  /**
   * Checks if WebRTC service is initialized
   */
  public isServiceInitialized(): boolean {
    return this.webrtcService?.isServiceInitialized() ?? false;
  }

  /**
   * Checks if current role is screen sharer
   */
  public isScreenSharer(): boolean {
    return this.webrtcService?.isScreenSharer() ?? false;
  }

  /**
   * Checks if current role is screen watcher
   */
  public isScreenWatcher(): boolean {
    return this.webrtcService?.isScreenWatcher() ?? false;
  }

  // ============== COMMON METHODS ==============

  /**
   * Gets the current connection phase
   */
  public getCurrentPhase(): ConnectionPhase {
    return this.currentPhase;
  }

  /**
   * Gets the current role
   */
  public getRole(): PeerRole | null {
    return this.role;
  }

  /**
   * Gets the WebRTC service (for advanced usage)
   */
  public getWebRTCService(): WebRTCService | null {
    return this.webrtcService;
  }

  /**
   * Checks if connected
   */
  public isConnected(): boolean {
    return this.webrtcService?.isConnected() ?? false;
  }

  /**
   * Disconnects and cleans up
   */
  public async disconnect(): Promise<void> {
    log.info("[ConnectionManager] Disconnecting...");

    if (this.webrtcService) {
      await this.webrtcService.disconnect();
      this.webrtcService = null;
    }

    this.role = null;
    this.username = "";
    
    // Avoid to duplicate settings
    if (this.currentPhase !== ConnectionPhase.DISCONNECTED) {
      this.setConnectionPhase(ConnectionPhase.DISCONNECTED);
    }

    log.info("[ConnectionManager] Disconnected");
  }

  /**
   * Resets to initial state
   */
  public async reset(): Promise<void> {
    await this.disconnect();
    this.setConnectionPhase(ConnectionPhase.IDLE);
    this.callbacks = {};
    this.isOperationInProgress = false;
  }
}


