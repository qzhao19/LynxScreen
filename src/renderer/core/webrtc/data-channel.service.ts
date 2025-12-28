import log from "electron-log"
import { RemoteCursorState, DataChannelName } from "../../../shared/types/index"

export class DataChannelService {
  private cursorPositionsChannel: RTCDataChannel | null = null;
  private cursorPingChannel: RTCDataChannel | null = null;
  private cursorsEnabled: boolean = false;
  private isScreenSharer: boolean = false;

  private onCursorUpdateCallback?: (data: RemoteCursorState) => void;
  private onCursorPingCallback?: (cursorId: string) => void;

  constructor(isScreenSharer: boolean = false) {
    this.isScreenSharer = isScreenSharer;
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    if (channel.label === DataChannelName.CURSOR_POSITIONS) {
      this.cursorPositionsChannel = channel;
      channel.onmessage = (msg: MessageEvent): void => {
        if (!this.cursorsEnabled) return ;
        if (!this.isScreenSharer) return ;
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
        if (!this.cursorsEnabled) return ;
        if (!this.isScreenSharer) return ;
        this.onCursorPingCallback?.(msg.data);
      };
    }
  }

  public createChannels(pc: RTCPeerConnection): void {
    this.cursorPositionsChannel = pc.createDataChannel(DataChannelName.CURSOR_POSITIONS);
    this.cursorPingChannel = pc.createDataChannel(DataChannelName.CURSOR_PING);

    this.setupDataChannel(this.cursorPositionsChannel);
    this.setupDataChannel(this.cursorPingChannel);
  }

  public onCursorUpdate(callback: (data: RemoteCursorState) => void): void {
    this.onCursorUpdateCallback = callback
  }

  public onCursorPing(callback: (cursorId: string) => void): void {
    this.onCursorPingCallback = callback
  }

  public handleIncomingChannel(channel: RTCDataChannel): void {
    if (
      channel.label === DataChannelName.CURSOR_POSITIONS ||
      channel.label === DataChannelName.CURSOR_PING
    ) {
      this.setupDataChannel(channel)
    }
  }


}