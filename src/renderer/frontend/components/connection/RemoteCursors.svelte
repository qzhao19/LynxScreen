<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { remoteCursors, removeRemoteCursor } from "../../stores/index";
  import type { RemoteCursorState } from "../../../shared/types/index";

  // Props
  export let containerWidth = 0;
  export let containerHeight = 0;
  export let cursorTimeout = 5000;

  // Track cursor timestamps
  let cursorTimestamps = new SvelteMap<string, number>();
  let previousCursorPositions = new SvelteMap<string, string>();
  let cleanupInterval: ReturnType<typeof setInterval>;

  $: cursorsArray = Array.from($remoteCursors.values());

  // Update timestamp only when cursor is new or position changed
  $: {
    const currentKeys = new SvelteSet<string>();
    
    cursorsArray.forEach((cursor) => {
      currentKeys.add(cursor.id);

      const posKey = `${cursor.x.toFixed(4)},${cursor.y.toFixed(4)}`;
      const prevPosKey = previousCursorPositions.get(cursor.id);

      if (posKey !== prevPosKey) {
        cursorTimestamps.set(cursor.id, Date.now());
        previousCursorPositions.set(cursor.id, posKey);
      }
    });

    // Cleanup entries for removed cursors
    cursorTimestamps.forEach((_, id) => {
      if (!currentKeys.has(id)) {
        cursorTimestamps.delete(id);
        previousCursorPositions.delete(id);
      }
    });
  }

  // Cleanup stale cursors
  function cleanupStaleCursors() {
    const now = Date.now();
    cursorTimestamps.forEach((timestamp, id) => {
      if (now - timestamp > cursorTimeout) {
        removeRemoteCursor(id);
        cursorTimestamps.delete(id);
        previousCursorPositions.delete(id);
      }
    });
  }

  // Start cleanup interval
  onMount(() => {
    cleanupInterval = setInterval(cleanupStaleCursors, 1000);
  });

  onDestroy(() => {
    clearInterval(cleanupInterval);
  });

  // Calculate pixel position
  function getPosition(cursor: RemoteCursorState) {
    return {
      x: cursor.x * containerWidth,
      y: cursor.y * containerHeight
    };
  }
</script>

<div class="remote-cursors">
  {#each cursorsArray as cursor (cursor.id)}
    {@const pos = getPosition(cursor)}
    <div 
      class="remote-cursor"
      style:left="{pos.x}px"
      style:top="{pos.y}px"
      style:--cursor-color={cursor.color}
      transition:fade={{ duration: 150 }}
    >
      <svg 
        class="cursor-pointer" 
        width="20" 
        height="20" 
        viewBox="0 0 24 24"
        fill={cursor.color}
      >
        <path d="M13.64 21.97C13.14 22.21 12.54 22 12.31 21.5L10.13 16.76L7.62 18.78C7.45 18.92 7.24 19 7.02 19C6.55 19 6.16 18.61 6.16 18.14V5.51C6.16 5.04 6.55 4.65 7.02 4.65C7.25 4.65 7.47 4.74 7.64 4.89L19.14 14.89C19.5 15.21 19.55 15.75 19.24 16.12C19.12 16.27 18.95 16.38 18.76 16.42L14.5 17.33L16.69 22.07C16.91 22.58 16.7 23.18 16.19 23.4C15.67 23.63 15.07 23.41 14.84 22.91L13.64 21.97Z"/>
      </svg>
      
      <span class="cursor-label" style:background={cursor.color}>
        {cursor.name}
      </span>
    </div>
  {/each}
</div>

<style>
  .remote-cursors {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .remote-cursor {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    transform: translate(-2px, -2px);
    z-index: 1000;
  }

  .cursor-pointer {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .cursor-label {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: white;
    white-space: nowrap;
    transform: translateX(12px);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
</style>