import { writable } from "svelte/store";
import type { 
  PageType, 
  SessionState, 
  ToastMessage, 
} from "../shared/types/app";
import type { AppSettings } from "../../shared/types/index";
import { DEFAULT_APP_SETTINGS } from "../../shared/constants/index";

// Current page store
export const currentPage = writable<PageType>("home");

// Session state store
export const sessionState = writable<SessionState>({
  isActive: false,
  sessionUrl: "",
  watcherUrl: "",
  duration: 0,
  status: "idle"
});

// Toast messages store
export const toasts = writable<ToastMessage[]>([]);

// App settings store
export const appSettings = writable<AppSettings>(loadSettings());

// Load settings from localStorage
function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem("lynxscreen-settings");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Deep merge for nested objects like iceServers
      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed,
        // Ensure iceServers array items have all required fields
        iceServers: Array.isArray(parsed.iceServers) && parsed.iceServers.length > 0
          ? parsed.iceServers.map((server: Partial<typeof DEFAULT_APP_SETTINGS.iceServers[0]>) => ({
              urls: server.urls || "",
              authUsername: server.authUsername || undefined,
              credential: server.credential || undefined
            }))
          : DEFAULT_APP_SETTINGS.iceServers
      };
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
  return DEFAULT_APP_SETTINGS;
}

// Save settings to localStorage
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem("lynxscreen-settings", JSON.stringify(settings));
    appSettings.set(settings);
    showToast("Settings saved successfully", "success");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showToast("Failed to save settings", "error");
  }
}

// Reset settings to default
export function resetSettings(): void {
  localStorage.removeItem("lynxscreen-settings");
  appSettings.set(DEFAULT_APP_SETTINGS);
  showToast("Settings reset to default", "info");
}

const MAX_TOASTS = 5;
// Show toast notification
export function showToast(message: string, type: ToastMessage["type"] = "info") {
  const id = crypto.randomUUID();
  // toasts.update(t => [...t, { id, message, type }]);
  toasts.update(t => {
    const updated = [...t, {id, message, type}];
    if (updated.length > MAX_TOASTS) {
      return updated.slice(updated.length - MAX_TOASTS);
    }
    return updated;
  });
  
  setTimeout(() => {
    toasts.update(t => t.filter(toast => toast.id !== id));
  }, 3000);
}

// Navigation function
export function navigateTo(page: PageType) {
  currentPage.set(page);
}

// Go back to home
export function goBack() {
  currentPage.set("home");
}

// Session timer
let timerInterval: ReturnType<typeof setInterval> | null = null;

// Start session timer
export function startSessionTimer() {
  // Always clear any existing interval to prevent memory leaks
  stopSessionTimer();
  
  sessionState.update(s => ({ ...s, duration: 0 }));
  
  timerInterval = setInterval(() => {
    sessionState.update(s => ({ ...s, duration: s.duration + 1 }));
  }, 1000);
}

// Stop session timer
export function stopSessionTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Format duration to HH:MM:SS
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}