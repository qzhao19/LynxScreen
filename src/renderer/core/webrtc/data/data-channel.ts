import log from "electron-log";
import { DataChannelName } from "../../../shared/types/index";
import { RemoteCursorState } from "../../../../shared/types/index";

/**
 * Service for managing WebRTC data channels used for cursor synchronization.
 * Handles cursor position updates and ping messages between screen sharer and watcher.
 */
export class DataChannelService {
  private cursorPositionsChannel: RTCDataChannel | null = null;
  private cursorPingChannel: RTCDataChannel | null = null;
  private cursorsEnabled: boolean = false;
  private isScreenSharer: boolean = false;

  private onCursorUpdateCallback?: (data: RemoteCursorState) => void;
  private onCursorPingCallback?: (cursorId: string) => void;
  private onChannelOpenCallback?: (channelName: string) => void;
  private onChannelCloseCallback?: (channelName: string) => void;

  constructor(isScreenSharer: boolean = false) {
    this.isScreenSharer = isScreenSharer;
  }

  /**
   * Checks if a data channel is ready for communication.
   * @param channel - The RTCDataChannel to check
   * @returns True if channel exists and is open
   */
  private isChannelReady(channel: RTCDataChannel | null): boolean {
    return channel !== null && channel.readyState === "open";
  }

  /**
   * Safely closes a data channel and removes all event handlers.
   * @param channel - The RTCDataChannel to close
   */
  private closeChannelSilently(channel: RTCDataChannel | null): void {
    if (!channel) return;
    channel.onopen = null;
    channel.onclose = null;
    channel.onerror = null;
    channel.onmessage = null;
    try {
      channel.close();
    } catch (error) {
      log.warn("Failed to close data channel:", error);
    }
  }

  /**
   * Sets up event handlers for a data channel.
   * @param channel - The RTCDataChannel to setup
   */
  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      log.info(`Data channel opened: ${channel.label}`);
      this.onChannelOpenCallback?.(channel.label);
    };

    channel.onclose = () => {
      log.info(`Data channel closed: ${channel.label}`);

      // Reset channels and cursor state when closed
      if (
        channel.label === DataChannelName.CURSOR_POSITIONS && 
        this.cursorPositionsChannel === channel
      ) {
        this.cursorPositionsChannel = null;
      }
      if (
        channel.label === DataChannelName.CURSOR_PING && 
        this.cursorPingChannel === channel
      ) {
        this.cursorPingChannel = null;
      } 

      this.onChannelCloseCallback?.(channel.label);
    };

    channel.onerror = (error) => {
      log.error(`Data channel error (${channel.label}):`, error);
    };

    if (channel.label === DataChannelName.CURSOR_POSITIONS) {
      this.cursorPositionsChannel = channel;
      channel.onmessage = (msg: MessageEvent): void => {
        if (!this.cursorsEnabled) return;

        // P2P cursor flow:
        // Watcher sends cursor positions → Sharer receives and renders
        // Therefore only Sharer (isScreenSharer=true) should process incoming cursor data
        if (!this.isScreenSharer) return;
        if (!this.onCursorUpdateCallback) return;

        try {
          const data = JSON.parse(msg.data) as RemoteCursorState;
          this.onCursorUpdateCallback(data);
        } catch (error) {
          log.error("Failed to parse cursor data: ", error);
        }
      };
    }

    if (channel.label === DataChannelName.CURSOR_PING) {
      this.cursorPingChannel = channel;
      channel.onmessage = (msg: MessageEvent): void => {
        if (!this.cursorsEnabled) return;
        // Ping is bidirectional
        this.onCursorPingCallback?.(msg.data);
      };
    }
  }

  /**
   * Creates data channels on the given RTCPeerConnection.
   * @param pc - The RTCPeerConnection to create channels on
   */
  public createChannels(pc: RTCPeerConnection): void {
    this.closeChannelSilently(this.cursorPositionsChannel);
    this.closeChannelSilently(this.cursorPingChannel);
    this.cursorPositionsChannel = null;
    this.cursorPingChannel = null;

    this.cursorPositionsChannel = pc.createDataChannel(DataChannelName.CURSOR_POSITIONS);
    this.cursorPingChannel = pc.createDataChannel(DataChannelName.CURSOR_PING);

    this.setupDataChannel(this.cursorPositionsChannel);
    this.setupDataChannel(this.cursorPingChannel);
  }

  /**
   * Handles an incoming data channel from the remote peer.
   * @param channel - The incoming RTCDataChannel
   */
  public handleIncomingChannel(channel: RTCDataChannel): void {
    if (
      channel.label === DataChannelName.CURSOR_POSITIONS ||
      channel.label === DataChannelName.CURSOR_PING
    ) {
      // Clean up old channel with same label if it exists
      if (channel.label === DataChannelName.CURSOR_POSITIONS) {
        this.closeChannelSilently(this.cursorPositionsChannel);
      } else {
        this.closeChannelSilently(this.cursorPingChannel);
      }

      this.setupDataChannel(channel);
    }
  }

  /**
   * Registers a callback for cursor position updates.
   * @param callback - Function to call when cursor update is received
   */
  public onCursorUpdate(callback: (data: RemoteCursorState) => void): void {
    this.onCursorUpdateCallback = callback;
  }

  /**
   * Registers a callback for cursor ping messages.
   * @param callback - Function to call when cursor ping is received
   */
  public onCursorPing(callback: (cursorId: string) => void): void {
    this.onCursorPingCallback = callback;
  }

  /**
   * Registers a callback for when a channel opens.
   * @param callback - Function to call when channel opens
   */
  public onChannelOpen(callback: (channelName: string) => void): void {
    this.onChannelOpenCallback = callback;
  }

  /**
   * Registers a callback for when a channel closes.
   * @param callback - Function to call when channel closes
   */
  public onChannelClose(callback: (channelName: string) => void): void {
    this.onChannelCloseCallback = callback;
  }

  /**
   * Sends cursor position update to the remote peer.
   * @param data - The cursor state to send
   * @returns True if sent successfully, false otherwise
   */
  public sendCursorUpdate(data: RemoteCursorState): boolean {
    if (!this.cursorsEnabled) return false;

    if (!this.isChannelReady(this.cursorPositionsChannel)) {
      log.warn("Cursor positions channel not ready");
      return false;
    }

    try {
      this.cursorPositionsChannel!.send(JSON.stringify(data));
      return true;
    } catch (error) {
      log.error("Failed to send cursor update:", error);
      return false;
    }
  }

  /**
   * Sends cursor ping to the remote peer.
   * @param cursorId - The cursor ID to ping
   */
  public sendCursorPing(cursorId: string): boolean {
    if (!this.cursorsEnabled) return false;

    if (!this.isChannelReady(this.cursorPingChannel)) {
      log.warn("Cursor ping channel not ready");
      return false;
    }

    try {
      this.cursorPingChannel!.send(cursorId);
      return true;
    } catch (error) {
      log.error("Failed to send cursor ping:", error);
      return false;
    }
  }

  /**
   * Enables or disables cursor synchronization.
   */
  public toggleCursors(enabled: boolean): boolean {
    this.cursorsEnabled = enabled;
    return enabled;
  }

  /**
   * Checks if cursors are currently enabled.
   */
  public isCursorsEnabled(): boolean {
    return this.cursorsEnabled;
  }

  /**
   * Checks if the cursor positions channel is ready.
   */
  public isCursorPositionsChannelReady(): boolean {
    return this.isChannelReady(this.cursorPositionsChannel);
  }

  /**
   * Checks if the cursor ping channel is ready.
   * 
   * OPTIONAL FEATURE: Related to cursor keep-alive mechanism.
   * Currently not used in frontend - kept for future enhancements.
   */
  public isCursorPingChannelReady(): boolean {
    return this.isChannelReady(this.cursorPingChannel);
  }

  /**
   * Checks if all channels are ready.
   */
  public areAllChannelsReady(): boolean {
    return this.isCursorPositionsChannelReady() && this.isCursorPingChannelReady();
  }

  /**
   * Closes all data channels and cleans up resources.
   */
  public cleanup(): void {
    this.closeChannelSilently(this.cursorPositionsChannel);
    this.closeChannelSilently(this.cursorPingChannel);
    
    this.cursorPositionsChannel = null;
    this.cursorPingChannel = null;
    this.cursorsEnabled = false;

    this.onCursorUpdateCallback = undefined;
    this.onCursorPingCallback = undefined;
    this.onChannelOpenCallback = undefined;
    this.onChannelCloseCallback = undefined;
  }

}