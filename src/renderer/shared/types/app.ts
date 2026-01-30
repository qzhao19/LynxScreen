// Page type definition - Update page names
export type PageType = "home" | "watch" | "share" | "active-sharing" | "settings";

// Session state interface
export interface SessionState {
  isActive: boolean;
  sessionUrl: string;
  participantUrl: string;
  duration: number;
  status: "idle" | "waiting" | "connected" | "error";
}

// Toast message interface
export interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}