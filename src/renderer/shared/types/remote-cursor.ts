/**
 * Represents the state information of a remote cursor in the screen sharing session.
 *
 * This type captures the real-time state of a remote user's cursor, including their identity,
 * visual representation, and current position on the shared screen.
 *
 * @interface {Object} RemoteCursorState
 * @property {string} id - Unique identifier for the remote user/cursor.
 * @property {string} name - Display name of the remote user whose cursor is being tracked.
 * @property {string} color - Visual color representation of the remote cursor (e.g., "#FF5733", "blue").
 *                            Used to distinguish between multiple remote cursors on the shared screen.
 * @property {number} x - The X-coordinate (horizontal position) of the remote cursor on the screen.
 * @property {number} y - The Y-coordinate (vertical position) of the remote cursor on the screen.
 */
export interface RemoteCursorState {
  id: string
  name: string
  color: string
  x: number
  y: number
}