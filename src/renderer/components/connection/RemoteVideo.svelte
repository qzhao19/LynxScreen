<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { 
    remoteStream, 
    isConnected,
    connectionPhase,
    sendCursorUpdate,
    setupCursorSync,
    cursorChannelsReady,
    appSettings,
    phaseDisplayText
  } from "../../stores/index";

  // Props
  export let enableCursorSync = true;
  export let showOverlay = true;
  export let aspectRatio = "16 / 9";

  // Callback props (replace createEventDispatcher)
  export let onReady: ((data: { videoElement: HTMLVideoElement }) => void) | undefined = undefined;
  export let onCursorMove: ((data: { x: number; y: number }) => void) | undefined = undefined;

  let videoElement: HTMLVideoElement;
  let containerElement: HTMLDivElement;
  let cursorSyncSetup = false;

  // Attach stream to video element
  $: if (videoElement) {
    if ($remoteStream) {
      videoElement.srcObject = $remoteStream;
      videoElement.play().catch(error => console.warn("Autoplay blocked:", error));
    } else {
      videoElement.srcObject = null;
    }
  }

  // Setup cursor sync when connected and channels ready
  $: if ($isConnected && $cursorChannelsReady && enableCursorSync && !cursorSyncSetup) {
    setupCursorSync();
    cursorSyncSetup = true;
  }

  $: if (!$isConnected) {
    cursorSyncSetup = false;
  }

  // Generate a fixed cursor ID
  const localCursorId = crypto.randomUUID();
  let lastCursorSendTime = 0;
  const CURSOR_THROTTLE_MS = 50;

  function getContainedVideoRect(video: HTMLVideoElement): {
    offsetX: number;
    offsetY: number;
    renderWidth: number;
    renderHeight: number;
  } | null {

    // Get actual video resolution for the visible area after cropping
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
    if (!$isConnected || !enableCursorSync || !$cursorChannelsReady) return;
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
    
    sendCursorUpdate(cursorData);
    onCursorMove?.({ x, y });
  }

  onMount(() => {
    onReady?.({ videoElement });
  });

  onDestroy(() => {
    cursorSyncSetup = false;
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

  {#if showOverlay && !$isConnected && !$remoteStream}
    <div class="video-overlay">
      <span class="spinner"></span>
      <p class="overlay-text">{overlayText}</p>
    </div>
  {/if}

  {#if enableCursorSync && $cursorChannelsReady}
    <div class="cursor-sync-indicator" title="Cursor sync enabled">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.64 21.97C13.14 22.21 12.54 22 12.31 21.5L10.13 16.76L7.62 18.78C7.45 18.92 7.24 19 7.02 19C6.55 19 6.16 18.61 6.16 18.14V5.51C6.16 5.04 6.55 4.65 7.02 4.65C7.25 4.65 7.47 4.74 7.64 4.89L19.14 14.89C19.5 15.21 19.55 15.75 19.24 16.12C19.12 16.27 18.95 16.38 18.76 16.42L14.5 17.33L16.69 22.07C16.91 22.58 16.7 23.18 16.19 23.4C15.67 23.63 15.07 23.41 14.84 22.91L13.64 21.97Z"/>
      </svg>
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

  .cursor-sync-indicator {
    position: absolute;
    bottom: var(--spacing-sm);
    left: var(--spacing-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: var(--radius-sm);
    color: var(--color-accent-green);
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