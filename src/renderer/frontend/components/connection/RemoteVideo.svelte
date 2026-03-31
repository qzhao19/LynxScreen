<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { 
    remoteStream, 
    isConnected,
    connectionPhase,
    updateRemoteCursor,
    pingRemoteCursor,
    canSyncCursor,
    appSettings,
    phaseDisplayText
  } from "../../stores/index";
  import { ConnectionPhase } from "../../../../shared/types/index";

  // Props
  export let showOverlay = true;
  export let aspectRatio = "16 / 9";

  // Callback props
  export let onReady: ((data: { videoElement: HTMLVideoElement }) => void) | undefined = undefined;
  export let onCursorMove: ((data: { x: number; y: number }) => void) | undefined = undefined;

  let videoElement: HTMLVideoElement;
  let containerElement: HTMLDivElement;

  // Attach stream to video element
  $: if (videoElement) {
    if ($remoteStream) {
      videoElement.srcObject = $remoteStream;
      videoElement.play().catch(error => console.warn("Autoplay blocked:", error));
    } else {
      videoElement.srcObject = null;
    }
  }

  // Generate a fixed cursor ID
  const localCursorId = crypto.randomUUID();
  let lastCursorSendTime = 0;
  const CURSOR_THROTTLE_MS = 50;

  // Cursor ping heartbeat
  const CURSOR_PING_INTERVAL_MS = 1500;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  function startCursorPing() {
    stopCursorPing();
    pingInterval = setInterval(() => {
      pingRemoteCursor(localCursorId);
    }, CURSOR_PING_INTERVAL_MS);
  }

  function stopCursorPing() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  $: if ($canSyncCursor) {
    startCursorPing();
  } else {
    stopCursorPing();
  }

  function getContainedVideoRect(video: HTMLVideoElement): {
    offsetX: number;
    offsetY: number;
    renderWidth: number;
    renderHeight: number;
  } | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) return null;

    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    
    const videoRatio = vw / vh;
    const boxRatio = rect.width / rect.height;

    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (videoRatio > boxRatio) {
      renderHeight = rect.width / videoRatio;
      offsetY = (rect.height - renderHeight) / 2;
    } else {
      renderWidth = rect.height * videoRatio;
      offsetX = (rect.width - renderWidth) / 2;
    }
    return { offsetX, offsetY, renderWidth, renderHeight };
  }

  function handleMouseMove(event: MouseEvent) {
    if (!$canSyncCursor) return;
    if (!containerElement) return;

    const now = Date.now();
    if (now - lastCursorSendTime < CURSOR_THROTTLE_MS) return;
    lastCursorSendTime = now;

    const videoRect = getContainedVideoRect(videoElement);
    if (!videoRect) return;

    const { offsetX, offsetY, renderWidth, renderHeight } = videoRect;
    const rect = videoElement.getBoundingClientRect();

    const x = (event.clientX - rect.left - offsetX) / renderWidth;
    const y = (event.clientY - rect.top - offsetY) / renderHeight;

    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    
    const cursorData = {
      id: localCursorId,
      name: $appSettings.username || "Anonymous",
      color: "#3B82F6",
      x,
      y
    };
    
    updateRemoteCursor(cursorData);
    onCursorMove?.({ x, y });
  }

  onMount(() => {
    onReady?.({ videoElement });
  });

  onDestroy(() => {
    stopCursorPing();
  });
  
  $: overlayText = phaseDisplayText[$connectionPhase] || "Connecting...";
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div 
  class="remote-video-container"
  style:aspect-ratio={aspectRatio}
  bind:this={containerElement}
  on:mousemove={handleMouseMove}
>
  <video
    bind:this={videoElement}
    autoplay
    playsinline
    class="remote-video"
  ></video>

  {#if showOverlay && (!$isConnected || !$remoteStream)}
    <div class="video-overlay">
      {#if $connectionPhase !== ConnectionPhase.DISCONNECTED}
        <span class="spinner"></span>
      {/if}
      <p class="overlay-text">{overlayText}</p>
    </div>
  {/if}

  <slot name="controls"></slot>
</div>

<style>
  .remote-video-container {
    position: relative;
    width: 100%;
    background: #000;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .remote-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .video-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    background: rgba(0, 0, 0, 0.8);
  }

  .overlay-text {
    color: var(--color-text-secondary);
    font-size: 0.95rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--color-accent-blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>