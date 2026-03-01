import log from "electron-log";
import { WebRTCConnectionConfig } from "../../../../shared/types/index";
import { DataChannelService } from "../data/index";

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

  // Track pending ICE gathering so we can abort on cleanup
  private iceGatheringAbortController: AbortController | null = null;

  constructor(config: WebRTCConnectionConfig, dataChannelService: DataChannelService) {
    this.config = config;
    this.dataChannelService = dataChannelService;
  }

  private ensureConnection(): void {
    if (!this.pc) {
      throw new Error("Peer connection not initialized. Call initialize() first.");
    }
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.pc) return;

    this.pc.ondatachannel = (event: RTCDataChannelEvent): void => {
      log.info(`Incoming data channel: ${event.channel.label}`);
      this.dataChannelService.handleIncomingChannel(event.channel);
    };

    this.pc.ontrack = (event: RTCTrackEvent): void => {
      log.info(`Received remote track: ${event.track.kind}`);
      if (event.streams && event.streams[0]) {
        this.onRemoteStreamCallback?.(event.streams[0]);
      } else {
        // Handle track without associated stream (possible during renegotiation)
        log.warn("Received track without associated stream, wrapping in new MediaStream");
        const stream = new MediaStream([event.track]);
        this.onRemoteStreamCallback?.(stream);
      }
    };

    this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent): void => {
      if (!event.candidate) {
        log.info("ICE candidate gathering complete");
      } else {
        log.debug("New ICE candidate discovered");
      }
    };

    this.pc.oniceconnectionstatechange = (): void => {
      if (this.pc) {
        const state = this.pc.iceConnectionState;
        log.info(`ICE connection state changed: ${state}`);
        this.onIceConnectionStateChangeCallback?.(state);
      }
    };

    this.pc.onconnectionstatechange = (): void => {
      if (this.pc) {
        log.info(`Connection state changed: ${this.pc.connectionState}`);
      }
    };

    this.pc.onicegatheringstatechange = (): void => {
      if (this.pc) {
        log.debug(`ICE gathering state: ${this.pc.iceGatheringState}`);
      }
    };
  }

  /**
   * Waits for ICE candidate gathering to complete.
   * Uses an AbortController so cleanup/close can cancel a pending wait.
   */
  private waitForIceGathering(timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const pc = this.pc;
      if (!pc || pc.iceGatheringState === "complete") {
        resolve();
        return;
      }

      let settled = false;
      let candidateCount = 0;

      const controller = new AbortController();
      this.iceGatheringAbortController = controller;
      const { signal } = controller;

      const settle = (fn: typeof resolve | typeof reject, arg?: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (fn === reject) {
          (reject as (reason?: unknown) => void)(arg);
        } else {
          resolve();
        }
      };

      const checkComplete = (): void => {
        if (pc.iceGatheringState === "complete") {
          log.info(`ICE gathering complete with ${candidateCount} candidates`);
          settle(resolve);
        }
      };

      const handleCandidate = (event: RTCPeerConnectionIceEvent): void => {
        if (event.candidate) {
          candidateCount += 1;
        } else {
          log.info(`ICE gathering done (null candidate) with ${candidateCount} candidates`);
          settle(resolve);
        }
      };

      const handleAbort = (): void => {
        log.warn("ICE gathering aborted externally");
        settle(resolve);
      };

      const timeoutId = setTimeout(() => {
        if (candidateCount === 0) {
          log.error("ICE gathering timed out without candidates");
          settle(reject, new Error("ICE gathering timed out without sufficient candidates"));
        } else {
          log.warn(`ICE gathering timed out after ${candidateCount} candidates, proceeding`);
          settle(resolve);
        }
      }, timeout);

      const cleanup = (): void => {
        clearTimeout(timeoutId);
        signal.removeEventListener("abort", handleAbort);
        pc.removeEventListener("icegatheringstatechange", checkComplete);
        pc.removeEventListener("icecandidate", handleCandidate);

        if (this.iceGatheringAbortController === controller) {
          this.iceGatheringAbortController = null;
        }
      };

      signal.addEventListener("abort", handleAbort);
      pc.addEventListener("icegatheringstatechange", checkComplete);
      pc.addEventListener("icecandidate", handleCandidate);
    });
  }

  /**
   * Initializes the RTCPeerConnection with configured ICE servers.
   */
  public initialize(): void {
    this.close();

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
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.ensureConnection();

    log.info("Creating offer...");

    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);

    await this.waitForIceGathering();

    // Re-check after async wait — connection might have been closed
    if (!this.pc || !this.pc.localDescription) {
      throw new Error("Failed to create local description: connection was closed during ICE gathering");
    }

    log.info("Offer created successfully");
    return this.pc.localDescription;
  }

  /**
   * Creates an SDP answer in response to a received offer.
   * Waits for ICE gathering to complete before returning.
   */
  public async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.ensureConnection();

    log.info("Creating answer...");

    await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);

    await this.waitForIceGathering();

    // Re-check after async wait
    if (!this.pc || !this.pc.localDescription) {
      throw new Error("Failed to create local description: connection was closed during ICE gathering");
    }

    log.info("Answer created successfully");
    return this.pc.localDescription;
  }

  /**
   * Sets the remote session description to complete the connection.
   */
  public async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.ensureConnection();

    log.info("Accepting remote answer...");

    await this.pc!.setRemoteDescription(new RTCSessionDescription(answer));

    log.info("Remote answer accepted successfully");
  }

  /**
   * Adds a media track to the peer connection.
   */
  public addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    this.ensureConnection();

    log.info(`Adding ${track.kind} track to peer connection`);
    return this.pc!.addTrack(track, stream);
  }

  /**
   * Removes a media track from the peer connection.
   */
  public removeTrack(sender: RTCRtpSender): void {
    this.ensureConnection();

    log.info("Removing track from peer connection");
    this.pc!.removeTrack(sender);
  }

  /**
   * Creates data channels for cursor synchronization.
   */
  public createDataChannels(): void {
    this.ensureConnection();

    log.info("Creating data channels");
    this.dataChannelService.createChannels(this.pc!);
  }

  public onIceConnectionStateChange(callback: (state: RTCIceConnectionState) => void): void {
    this.onIceConnectionStateChangeCallback = callback;
  }

  public onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  public isConnected(): boolean {
    return this.pc?.connectionState === "connected";
  }

  public getConnectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState ?? null;
  }

  public getIceConnectionState(): RTCIceConnectionState | null {
    return this.pc?.iceConnectionState ?? null;
  }

  public getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  /**
   * Closes the peer connection and cleans up handlers.
   */
  public close(): void {
    const controller = this.iceGatheringAbortController;
    if (controller) {
      controller.abort();
      if (this.iceGatheringAbortController === controller) {
        this.iceGatheringAbortController = null;
      }
    }

    if (this.pc) {
      log.info("Closing peer connection");

      this.pc.ondatachannel = null;
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;

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