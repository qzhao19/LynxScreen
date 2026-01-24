import log from "electron-log";
import { WebRTCConnectionConfig } from "../../../../shared/types/index";
import { DataChannelService } from "../data/data-channel";

/**
 * Service for managing WebRTC peer connection lifecycle.
 * 
 * Handles RTCPeerConnection creation, offer/answer exchange, track management,
 * and connection state monitoring for peer-to-peer communication.
 */
export class PeerConnectionService {
  private pc: RTCPeerConnection | null = null;
  private config: WebRTCConnectionConfig;
  private dataChannelService: DataChannelService;

  private onIceConnectionStateChangeCallback?: (state: RTCIceConnectionState) => void;
  private onRemoteStreamCallback?: (stream: MediaStream) => void;

  /**
   * Creates a new PeerConnectionService instance.
   * 
   * @param config - Connection configuration including ICE servers.
   * @param dataChannelService - Service for managing data channels.
   */
  constructor(config: WebRTCConnectionConfig, dataChannelService: DataChannelService) {
    this.config = config;
    this.dataChannelService = dataChannelService;
  }

  /**
   * Ensures the peer connection is initialized.
   * @throws Error if peer connection is not initialized.
   */
  private ensureConnection(): void {
    if (!this.pc) {
      throw new Error("Peer connection not initialized. Call initialize() first.");
    }
  }

  /**
   * Sets up event handlers for the RTCPeerConnection.
   */
  private setupPeerConnectionHandlers(): void {
    if (!this.pc) return;

    // Handle incoming data channels from remote peer
    this.pc.ondatachannel = (event: RTCDataChannelEvent): void => {
      log.info(`Incoming data channel: ${event.channel.label}`);
      this.dataChannelService.handleIncomingChannel(event.channel);
    };

    // Handle incoming media tracks from remote peer
    this.pc.ontrack = (event: RTCTrackEvent): void => {
      log.info(`Received remote track: ${event.track.kind}`);
      if (event.streams && event.streams[0]) {
        this.onRemoteStreamCallback?.(event.streams[0]);
      }
    };

    // Handle ICE candidate gathering
    this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent): void => {
      if (!event.candidate) {
        log.info("ICE candidate gathering complete");
      } else {
        log.debug("New ICE candidate discovered");
      }
    };

    // Handle ICE connection state changes
    this.pc.oniceconnectionstatechange = (): void => {
      if (this.pc) {
        const state = this.pc.iceConnectionState;
        log.info(`ICE connection state changed: ${state}`);
        this.onIceConnectionStateChangeCallback?.(state);
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = (): void => {
      if (this.pc) {
        log.info(`Connection state changed: ${this.pc.connectionState}`);
      }
    };

    // Handle ICE gathering state changes
    this.pc.onicegatheringstatechange = (): void => {
      if (this.pc) {
        log.debug(`ICE gathering state: ${this.pc.iceGatheringState}`);
      }
    };
  }

/**
   * Waits for ICE candidate gathering to complete.
   * 
   * @param timeout - Maximum time to wait in milliseconds (default: 5000ms).
   * @returns Promise that resolves when gathering is complete.
   */
  private waitForIceGathering(timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.pc) {
        // If connection is closed, directly return 
        resolve();
        return;
      }

      // Already complete
      if (this.pc.iceGatheringState === "complete") {
        resolve();
        return;
      }

      // Records number of candidate
      let candidateCount = 0;

      const checkComplete = (): void => {
        if (!this.pc || this.pc.iceGatheringState === "complete") {
          cleanup();
          log.info(`ICE gathering complete with ${candidateCount} candidates`);
          resolve();
        }
      };

      const handleCandidate = (event: RTCPeerConnectionIceEvent): void => {
        if (event.candidate) {
          candidateCount += 1;
        }
      };

      const cleanup = (): void => {
        clearTimeout(timeoutId);
        this.pc?.removeEventListener("icegatheringstatechange", checkComplete);
        this.pc?.removeEventListener("icecandidate", handleCandidate);
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        if (candidateCount === 0) {
          log.error("ICE gathering timed out without candidates");
          reject(new Error("ICE gathering timed out without sufficient candidates"));
        } else {
          log.warn(`ICE gathering timed out after ${candidateCount} candidates`);
          resolve();
        }
      }, timeout);

      this.pc.addEventListener("icegatheringstatechange", checkComplete);
      this.pc.addEventListener("icecandidate", handleCandidate);
    });
  }

  /**
   * Initializes the RTCPeerConnection with configured ICE servers.
   */
  public async initialize(): Promise<void> {
    this.cleanup();

    log.info("Initializing peer connection...");

    this.pc = new RTCPeerConnection({
      iceServers: this.config.iceServers.map((server) => ({
        urls: server.urls,
        username: server.authUsername,
        credential: server.credential
      }))
    });

    this.setupPeerConnectionHandlers();

    log.info("Peer connection initialized successfully");
  }

  
  /**
   * Creates an SDP offer for initiating a connection.
   * Waits for ICE gathering to complete before returning.
   * 
   * @returns Promise resolving to the local session description.
   * @throws Error if peer connection is not initialized.
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.ensureConnection();

    log.info("Creating offer...");

    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering();

    const localDescription = this.pc!.localDescription;
    if (!localDescription) {
      throw new Error("Failed to create local description");
    }

    log.info("Offer created successfully");
    return localDescription;
  }

  /**
   * Creates an SDP answer in response to a received offer.
   * Waits for ICE gathering to complete before returning.
   * 
   * @param offer - The received SDP offer from the remote peer.
   * @returns Promise resolving to the local session description (answer).
   * @throws Error if peer connection is not initialized.
   */
  public async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.ensureConnection();

    log.info("Creating answer...");

    await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering();

    const localDescription = this.pc!.localDescription;
    if (!localDescription) {
      throw new Error("Failed to create local description");
    }

    log.info("Answer created successfully");
    return localDescription;
  }
  
  /**
   * Sets the remote session description to complete the connection.
   * Used by the offer creator to accept the remote peer"s answer.
   * 
   * @param answer - The received SDP answer from the remote peer.
   * @throws Error if peer connection is not initialized.
   */
  public async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.ensureConnection();

    log.info("Accepting remote answer...");

    await this.pc!.setRemoteDescription(new RTCSessionDescription(answer));

    log.info("Remote answer accepted successfully");
  }

  /**
   * Adds a media track to the peer connection.
   * 
   * @param track - The media track to add.
   * @param stream - The media stream containing the track.
   * @returns The RTCRtpSender for the added track.
   * @throws Error if peer connection is not initialized.
   */
  public addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    this.ensureConnection();

    log.info(`Adding ${track.kind} track to peer connection`);
    return this.pc!.addTrack(track, stream);
  }

  /**
   * Removes a media track from the peer connection.
   * 
   * @param sender - The RTCRtpSender to remove.
   */
  public removeTrack(sender: RTCRtpSender): void {
    this.ensureConnection();

    log.info("Removing track from peer connection");
    this.pc!.removeTrack(sender);
  }

  /**
   * Creates data channels for cursor synchronization.
   * 
   * @throws Error if peer connection is not initialized.
   */
  public createDataChannels(): void {
    this.ensureConnection();

    log.info("Creating data channels");
    this.dataChannelService.createChannels(this.pc!);
  }

  /**
   * Registers a callback for connection state changes.
   * 
   * @param callback - Function to call when connection state changes.
   */
  public onIceConnectionStateChange(callback: (state: RTCIceConnectionState) => void): void {
    this.onIceConnectionStateChangeCallback = callback;
  }

  /**
   * Registers a callback for receiving remote media tracks.
   * 
   * @param callback - Function to call when a remote track is received.
   */
  public onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  /**
   * Checks if the peer connection is currently connected.
   * 
   * @returns True if connection state is "connected".
   */
  public isConnected(): boolean {
    return this.pc?.connectionState === "connected";
  }

  /**
   * Gets the current connection state.
   * 
   * @returns The connection state or null if not initialized.
   */
  public getConnectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState ?? null;
  }

  /**
   * Gets the current ICE connection state.
   * 
   * @returns The ICE connection state or null if not initialized.
   */
  public getIceConnectionState(): RTCIceConnectionState | null {
    return this.pc?.iceConnectionState ?? null;
  }

  /**
   * Gets the underlying RTCPeerConnection instance.
   * Use with caution - prefer using service methods when possible.
   * 
   * @returns The RTCPeerConnection or null if not initialized.
   */
  public getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  /**
   * Closes the peer connection and cleans up handlers.
   */
  public close(): void {
    if (this.pc) {
      log.info("Closing peer connection");

      // Clear event handlers
      this.pc.ondatachannel = null;
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;

      // Close the connection
      this.pc.close();
      this.pc = null;
    }
  }

  /**
   * Cleans up all resources including data channels and callbacks.
   */
  public cleanup(): void {
    this.close();
    this.dataChannelService.cleanup();
    this.onIceConnectionStateChangeCallback = undefined;
    this.onRemoteStreamCallback = undefined;

    log.info("Connection service cleaned up");
  }
  
}