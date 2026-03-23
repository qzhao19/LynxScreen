import log from "electron-log/renderer";

/**
 * Service for managing media streams (audio and display/screen capture).
 * Handles the acquisition, control, and lifecycle of user audio and display media streams
 * for screen sharing functionality.
 */
export class MediaStreamService {
  private audioStream: MediaStream | null = null;
  private displayStream: MediaStream | null = null;
  // Callback binding to the display stream
  private displayEndEventListener?: () => void;
  private onDisplayEndCallback?: () => void;
  // Guard flag to prevent re-entrant calls from overlapping events
  private isHandlingDisplayEnd: boolean = false;

  /**
   * Stop any existing audio stram
   */
  private stopTracks(stream: MediaStream | null): void {
    if (!stream) return;
    
    // If stop the current display stream, remove all registered listener
    if (stream === this.displayStream && this.displayEndEventListener) {
      stream.removeEventListener("inactive", this.displayEndEventListener);
      stream.getTracks().forEach(track => {
        track.removeEventListener("ended", this.displayEndEventListener!);
      });
      this.displayEndEventListener = undefined;
    }

    stream.getTracks().forEach(track => {
      // Cleanup property-binding listeners
      track.onended = null;
      track.onmute = null;
      track.onunmute = null;

      // Stop all track
      track.stop();

      // Remove from the stream to avoid the rest of ref
      stream.removeTrack(track);
    });
  }

  /**
   * Handles display stream ending from any source (track ended, stream inactive, etc).
   */
  private handleDisplayEnd(): void {
    // Prevent re-entrant calls:
    // Both "ended" (per-track) and "inactive" (stream-level) may fire
    // for the same user action. Only process the first one.
    if (this.isHandlingDisplayEnd) return;
    this.isHandlingDisplayEnd = true;

    try {
      if (this.displayStream) {
        this.stopTracks(this.displayStream);
        this.displayStream = null;
      }
      this.onDisplayEndCallback?.();
    } finally {
      this.isHandlingDisplayEnd = false;
    }
  }

  /**
   * Requests user permission to access the microphone and retrieves the audio stream.
   */
  public async getUserAudio(): Promise<MediaStream | null> {
    try {
      // Stops any existing audio stream before acquiring a new one
      this.stopTracks(this.audioStream);
      this.audioStream = null;

      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      log.info("Audio stream acquired successfully");
      return this.audioStream;
    } catch (error) {
      log.warn("Failed to get user audio:", error);
      this.audioStream = null;
      return null;
    }
  }

  /**
   * Requests user permission to capture the screen/display.
   */
  public async getDisplayMedia(): Promise<MediaStream | null> {
    try {
      // Clean up any existing display stream before acquiring new one
      this.stopTracks(this.displayStream);
      this.displayStream = null;
      this.isHandlingDisplayEnd = false;

      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true,
      });

      // Bind the end handler via arrow function to preserve `this` context
      this.displayEndEventListener = () => this.handleDisplayEnd();

      // Listen for both stream-level and track-level end events:
      // - inactive: stream has no more active tracks
      // - ended: individual track stopped (e.g. user clicked "Stop sharing")
      this.displayStream.addEventListener("inactive", this.displayEndEventListener);
      this.displayStream.getTracks().forEach(track => {
        track.addEventListener("ended", this.displayEndEventListener!);
      });

      return this.displayStream;
    } catch (error) {
      log.error("Failed to get display media:", error);
      this.displayStream = null;
      return null;
    }
  }

  /**
   * Registers a callback function to be invoked when the display media stream ends.
   */
  public onDisplayEnd(callback: () => void): void {
    this.onDisplayEndCallback = callback;
  }

  /**
   * Gets the current audio stream.
   */
  public getAudioStream(): MediaStream | null {
    return this.audioStream;
  }

  /**
   * Gets the current display stream.
   */
  public getDisplayStream(): MediaStream | null {
    return this.displayStream;
  }

  /**
   * Checks if audio input is available.
   */
  public hasAudioInput(): boolean {
    return this.audioStream !== null;
  }

  /**
   * Checks if display sharing is currently active.
   */
  public isDisplayActive(): boolean {
    return !!(
      this.displayStream &&
      this.displayStream.active &&
      this.displayStream.getTracks().some(track => track.enabled && track.readyState === "live")
    );
  }

  /**
   * Enables or disables all audio tracks.
   */
  public toggleAudioTrack(enabled: boolean): void {
    if (!this.audioStream) return;
    this.audioStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  /**
   * Enables or disables all video tracks in the display stream.
   */
  public toggleVideoTrack(enabled: boolean): void {
    if (!this.displayStream) return;
    this.displayStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  /**
   * Checks if audio tracks are currently active.
   */
  public isAudioTrackActive(): boolean {
    if (!this.audioStream) return false;
    return this.audioStream.getAudioTracks().some(track => track.enabled);
  }

  /**
   * Checks if any video track is currently enabled.
   */
  public isDisplayStreamActive(): boolean {
    if (!this.displayStream) return false;
    return this.displayStream.getVideoTracks().some(track => track.enabled);
  }

  /**
   * Stops all media tracks and clears the streams.
   */
  public stopAllTracks(): void {
    this.stopTracks(this.audioStream);
    this.stopTracks(this.displayStream);
    this.audioStream = null;
    this.displayStream = null;
  }

  /**
   * Cleans up all resources by stopping all tracks.
   */
  public cleanup(): void {
    this.stopAllTracks();
    this.onDisplayEndCallback = undefined;
    this.displayEndEventListener = undefined;
    this.isHandlingDisplayEnd = false;
  }
}