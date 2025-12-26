/**
 * Service for managing media streams (audio and display/screen capture).
 * Handles the acquisition, control, and lifecycle of user audio and display media streams
 * for screen sharing functionality.
 */
export class MediaStreamService {
  private audioStream: MediaStream | null = null
  private displayStream: MediaStream | null = null

  /**
   * Requests user permission to access the microphone and retrieves the audio stream.
   * @returns Promise resolving to the audio MediaStream, or null if permission denied or error occurs.
   */
  public async getUserAudio(): Promise<MediaStream | null> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      return this.audioStream;
    } catch (error) {
      console.error('Failed to get user audio:', error)
      return null
    }
  }

  /**
   * Requests user permission to capture the screen/display.
   * @returns Promise resolving to the display MediaStream, or null if permission denied or error occurs.
   */
  public async getDisplayMedia(): Promise<MediaStream | null> {
    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      })
      return this.displayStream
    } catch (error) {
      console.error('Failed to get display media:', error)
      return null
    }
  }

  /**
   * Gets the current audio stream.
   * @returns The audio MediaStream or null if not available.
   */
  public getAudioStream(): MediaStream | null {
    return this.audioStream
  }

  /**
   * Gets the current display stream.
   * @returns The display MediaStream or null if not available.
   */
  public getDisplayStream(): MediaStream | null {
    return this.displayStream
  }

  /**
   * Checks if audio input is available.
   * @returns True if audio stream exists, false otherwise.
   */
  public hasAudioInput(): boolean {
    return this.audioStream !== null
  }

  /**
   * Enables or disables all audio tracks.
   * @param enabled - True to enable, false to disable audio tracks.
   */
  public toggleAudioTrack(enabled: boolean): void {
    if (!this.audioStream) return
    
    for (const track of this.audioStream.getAudioTracks()) {
      track.enabled = enabled
    }
  }

  /**
   * Enables or disables all video tracks in the display stream.
   * @param enabled - True to enable, false to disable video tracks.
   */
  public toggleVideoTrack(enabled: boolean): void {
    if (!this.displayStream) return
    
    for (const track of this.displayStream.getVideoTracks()) {
      track.enabled = enabled
    }
  }

  /**
   * Checks if audio tracks are currently active.
   * @returns True if audio tracks are enabled, false otherwise.
   */
  public isAudioTrackActive(): boolean {
    if (!this.audioStream) return false
    
    for (const track of this.audioStream.getAudioTracks()) {
      return track.enabled
    }
    return false
  }

  /**
   * Stops all media tracks and clears the streams.
   */
  public stopAllTracks(): void {
    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) {
        track.stop()
      }
      this.audioStream = null
    }

    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        track.stop()
      }
      this.displayStream = null
    }
  }

  public cleanup(): void {
    this.stopAllTracks()
  }
}