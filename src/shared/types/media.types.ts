/**
 * Interface defining the media stream configuration for screen sharing.
 * @interface MediaStreamConfig
 * @property {boolean} video - Enable or disable video stream capture
 * @property {boolean} audio - Enable or disable audio stream capture
 */
export interface MediaStreamConfig {
  video: boolean
  audio: boolean
}