import log from "electron-log"

/**
 * Service for managing media streams (audio and display/screen capture).
 * Handles the acquisition, control, and lifecycle of user audio and display media streams
 * for screen sharing functionality.
 */
export class MediaStreamService {
  private audioStream: MediaStream | null = null;
  private displayStream: MediaStream | null = null;
  // Callback binding to the display stream
  private displayEndHandler?: () => void;


  /**
   * Stop any existing audio stram
   */
  private stopTracks(stream: MediaStream | null): void {
    if (!stream) return ;
    
    // If stop the current display stream, remove listener
    if (stream === this.displayStream && this.displayEndHandler) {
      stream.removeEventListener("inactive", this.displayEndHandler)
      stream.getTracks().forEach(track => {
        track.removeEventListener("ended", this.displayEndHandler!)
      })
      this.displayEndHandler = undefined
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
   * Requests user permission to access the microphone and retrieves the audio stream.
   * @returns Promise resolving to the audio MediaStream, or null if permission denied or error occurs.
   */
  public async getUserAudio(): Promise<MediaStream | null> {
    try {
      // Stops any existing audio stream before acquiring a new one
      this.stopTracks(this.audioStream);
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      return this.audioStream;
    } catch (error) {
      log.error('Failed to get user audio:', error)
      this.audioStream = null;
      return null;
    }
  }

  /**
   * Requests user permission to capture the screen/display.
   * @returns Promise resolving to the display MediaStream, or null if permission denied or error occurs.
   */
  public async getDisplayMedia(): Promise<MediaStream | null> {
    try {
      this.stopTracks(this.displayStream);
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true,
      })

      // Use the arrow function to handle stream end
      this.displayEndHandler = () => {
        if (this.displayStream) {
          this.stopTracks(this.displayStream)
          this.displayStream = null
        }
      }

      // When user stops sharing, clear the stored stream
      this.displayStream.addEventListener("inactive", this.displayEndHandler);
      this.displayStream.getTracks().forEach(track => { 
        track.addEventListener("ended", this.displayEndHandler!) 
      });

      return this.displayStream;
    } catch (error) {
      log.error('Failed to get display media:', error)
      this.displayStream = null;
      return null;
    }
  }

  /**
   * Gets the current audio stream.
   * @returns The audio MediaStream or null if not available.
   */
  public getAudioStream(): MediaStream | null {
    return this.audioStream;
  }

  /**
   * Gets the current display stream.
   * @returns The display MediaStream or null if not available.
   */
  public getDisplayStream(): MediaStream | null {
    return this.displayStream;
  }

  /**
   * Checks if audio input is available.
   * @returns True if audio stream exists, false otherwise.
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
      this.displayStream.getTracks().some(t => t.enabled && t.readyState === 'live')
    )
  }

  /**
   * Enables or disables all audio tracks.
   * @param enabled - True to enable, false to disable audio tracks.
   */
  public toggleAudioTrack(enabled: boolean): void {
    if (!this.audioStream) return ;
    this.audioStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  /**
   * Enables or disables all video tracks in the display stream.
   * @param enabled - True to enable, false to disable video tracks.
   */
  public toggleVideoTrack(enabled: boolean): void {
    if (!this.displayStream) return ;
    this.displayStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    })
  }

  /**
   * Checks if audio tracks are currently active.
   * @returns True if audio tracks are enabled, false otherwise.
   */
  public isAudioTrackActive(): boolean {
    if (!this.audioStream) return false;
    return this.audioStream.getAudioTracks().some(track => track.enabled);
  }

  /**
   * Checks if any video track is currently enabled.
   * @returns True if any video track is enabled, false otherwise.
   */
  public isVideoTrackActive(): boolean {
    if (!this.displayStream) return false
    return this.displayStream.getVideoTracks().some(track => track.enabled);
  }

  /**
   * Stops all media tracks and clears the streams.
   */
  public stopAllTracks(): void {
    this.stopTracks(this.audioStream)
    this.stopTracks(this.displayStream)
    this.audioStream = null
    this.displayStream = null
  }

  /**
   * Cleans up all resources by stopping all tracks.
   */
  public cleanup(): void {
    this.stopAllTracks();
  }
}