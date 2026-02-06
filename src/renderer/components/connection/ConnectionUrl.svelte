<script lang="ts">
  import { onDestroy } from "svelte";
  import { generatedUrl } from "../../stores/connection";
  import { copyToClipboard } from "../../../shared/utils/clipboard";
  import { showToast } from "../../stores/app";

  // Props
  export let url: string = "";
  export let label = "Connection URL";
  export let hint = "Share this link with the participant";
  export let showCopyButton = true;
  export let readonly = true;
  
  // Callback props (replace createEventDispatcher)
  export let onCopy: ((data: { url: string }) => void) | undefined = undefined;
  export let onChange: ((data: { url: string }) => void) | undefined = undefined;

  // Use prop or store
  $: displayUrl = url || $generatedUrl;

  let isCopied = false;
  let copyTimeout: ReturnType<typeof setTimeout>;
  
  onDestroy(() => {
    clearTimeout(copyTimeout);
  });
  
  async function handleCopy() {
    if (!displayUrl) return;

    try {
      await copyToClipboard(displayUrl);
      isCopied = true;
      showToast("Copied to clipboard", "success");
      onCopy?.({ url: displayUrl });

      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        isCopied = false;
      }, 2000);
    } catch {
      showToast("Failed to copy", "error");
    }
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    onChange?.({ url: target.value });
  }
</script>

<div class="connection-url">
  {#if label}
    <div class="url-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <span>{label}</span>
    </div>
  {/if}

  <div class="url-container">
    {#if readonly}
      <code class="url-text" title={displayUrl}>{displayUrl || "No URL generated"}</code>
    {:else}
      <input
        type="text"
        class="url-input"
        value={displayUrl}
        on:input={handleInput}
        placeholder="Paste URL here..."
      />
    {/if}

    {#if showCopyButton && displayUrl}
      <button 
        class="copy-button" 
        class:copied={isCopied}
        on:click={handleCopy}
        disabled={!displayUrl}
      >
        {#if isCopied}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        {/if}
      </button>
    {/if}
  </div>

  {#if hint}
    <p class="url-hint">{hint}</p>
  {/if}
</div>

<style>
  .connection-url {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .url-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .url-container {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-bg-input);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .url-text {
    flex: 1;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "SF Mono", "Monaco", monospace;
  }

  .url-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    font-size: 0.9rem;
    outline: none;
  }

  .url-input::placeholder {
    color: var(--color-text-muted);
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-accent-blue);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .copy-button:hover:not(:disabled) {
    background: var(--color-accent-blue-hover);
  }

  .copy-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .copy-button.copied {
    background: var(--color-accent-green);
  }

  .url-hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }
</style>