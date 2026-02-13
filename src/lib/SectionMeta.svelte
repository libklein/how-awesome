<script lang="ts">
    import type { Readable } from 'svelte/store';

    type SectionState = {
        hasError: boolean;
        hasRateLimit: boolean;
        allLoaded: boolean;
    };

    let {
        sectionState,
        onFetchAll,
    }: {
        sectionState: Readable<SectionState>;
        onFetchAll: () => void;
    } = $props();
</script>

{#if !$sectionState.allLoaded}
    <button class="section-fetch-pill" type="button" onclick={onFetchAll}>
        Fetch all
    </button>
{/if}

<span class="section-indicator" hidden={!$sectionState.hasError}>
    {$sectionState.hasRateLimit ? ' rate limited' : ' fetch failed'}
</span>

<style>
    .section-fetch-pill {
        margin-left: 0.6rem;
        vertical-align: middle;
        font-size: 0.72em;
        line-height: 1;
        padding: 0.26em 0.58em;
        border: 1px solid currentColor;
        border-radius: 999px;
        background: transparent;
        color: currentColor;
        opacity: 0.75;
        cursor: pointer;
    }

    .section-fetch-pill:hover {
        opacity: 1;
    }

    .section-fetch-pill:focus-visible {
        outline: 1px solid currentColor;
        outline-offset: 2px;
    }

    .section-indicator {
        margin-left: 0.5rem;
        font-size: 0.85em;
        color: #ffb347;
    }
</style>
