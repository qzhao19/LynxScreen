<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { isConnected, formatDuration } from "../../stores/index";

  // Props
  export let startTime: Date | null = null;
  export let autoStart = true;

  let duration = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let internalStartTime: Date | null = null;

  // Sync when startTime prop changes
  $: if (startTime && startTime !== internalStartTime) {
    internalStartTime = startTime;
    // If timer running, update displayed duration immediately
    if (interval) {
      duration = Math.floor((Date.now() - internalStartTime.getTime()) / 1000);
    }
  }

  function startTimer() {
    if (interval) return;
    
    if (!internalStartTime) {
        internalStartTime = startTime || new Date();
    }
    
    interval = setInterval(() => {
      if (internalStartTime) {
        duration = Math.floor((Date.now() - internalStartTime.getTime()) / 1000);
      }
    }, 1000);
  }

  function stopTimer() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  function resetTimer() {
    stopTimer();
    duration = 0;
    internalStartTime = null;
  }

  // Auto-start when connected
  $: if (autoStart && $isConnected && !interval) {
    startTimer();
  }

  // Stop when disconnected
  $: if (autoStart && !$isConnected && interval) {
    stopTimer();
  }

  onMount(() => {
    if (startTime) {
      startTimer();
    }
  });

  onDestroy(() => {
    stopTimer();
  });

  // Expose methods
  export { startTimer, stopTimer, resetTimer };
</script>

<div class="session-timer">
  <span class="timer-label">
    <slot name="label">Session Duration</slot>
  </span>
  <span class="timer-value">{formatDuration(duration)}</span>
</div>

<style>
  .session-timer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-md);
  }

  .timer-label {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
  }

  .timer-value {
    font-family: "SF Mono", "Monaco", monospace;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    min-width: 60px;
    text-align: right;
  }
</style>