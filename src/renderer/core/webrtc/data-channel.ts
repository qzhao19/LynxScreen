import log from "electron-log";
import { DataChannelName } from "../../shared/types/index";
import { RemoteCursorState } from "../../../shared/types/index";

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
      if (channel.label === DataChannelName.CURSOR_POSITIONS) {
        this.cursorPositionsChannel = null;
        this.cursorsEnabled = false;
      }
      if (channel.label === DataChannelName.CURSOR_PING) {
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
        // Server should receive, parse, and trigger a callback.
        if (this.isScreenSharer) return;
        try {
          const data = JSON.parse(msg.data) as RemoteCursorState;
          this.onCursorUpdateCallback!(data);
        } catch (error) {
          log.error("Failed to parse cursor data: ", error);
        }
      };
    }

    if (channel.label === DataChannelName.CURSOR_PING) {
      this.cursorPingChannel = channel;
      channel.onmessage = (msg: MessageEvent): void => {
        if (!this.cursorsEnabled) return;
        if (!this.isScreenSharer) return;
        this.onCursorPingCallback?.(msg.data);
      };
    }
  }

  /**
   * Creates data channels on the given RTCPeerConnection.
   * @param pc - The RTCPeerConnection to create channels on
   */
  public createChannels(pc: RTCPeerConnection): void {
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
    if (!this.isChannelReady(this.cursorPositionsChannel)) {
      log.error("Cursor positions channel not ready");
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
   * @returns True if sent successfully, false otherwise
   */
  public sendCursorPing(cursorId: string): boolean {
    if (!this.isChannelReady(this.cursorPingChannel)) {
      log.error("Cursor ping channel not ready");
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
   * @param enabled - Whether cursors should be enabled
   * @returns The new enabled state, or false if channel not ready
   */
  public toggleCursors(enabled: boolean): boolean {
    if (!this.isChannelReady(this.cursorPositionsChannel)) {
      return false;
    }

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
    if (this.cursorPositionsChannel) {
      this.cursorPositionsChannel.onopen = null;
      this.cursorPositionsChannel.onclose = null;
      this.cursorPositionsChannel.onerror = null;
      this.cursorPositionsChannel.onmessage = null;
      this.cursorPositionsChannel.close();
      this.cursorPositionsChannel = null;
    }

    if (this.cursorPingChannel) {
      this.cursorPingChannel.onopen = null;
      this.cursorPingChannel.onclose = null;
      this.cursorPingChannel.onerror = null;
      this.cursorPingChannel.onmessage = null;
      this.cursorPingChannel.close();
      this.cursorPingChannel = null;
    }

    this.cursorsEnabled = false;
    this.onCursorUpdateCallback = undefined;
    this.onCursorPingCallback = undefined;
    this.onChannelOpenCallback = undefined;
    this.onChannelCloseCallback = undefined;
  }

}