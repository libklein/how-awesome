<script lang="ts">
    import type { Readable } from 'svelte/store';

    type SectionState = {
        hasError: boolean;
        hasRateLimit: boolean;
        allLoaded: boolean;
        fetchedCount: number;
        totalCount: number;
    };

    let {
        sectionState,
        onFetchAll,
    }: {
        sectionState: Readable<SectionState>;
        onFetchAll: () => void;
    } = $props();
</script>

{#if $sectionState.totalCount > 0 && !$sectionState.allLoaded}
    <a
        class="section-count section-count-link"
        href="#"
        onclick={event => {
            event.preventDefault();
            onFetchAll();
        }}
    >
        Fetch all ({$sectionState.fetchedCount}/{$sectionState.totalCount} fetched)
    </a>
{:else if $sectionState.totalCount > 0}
    <span class="section-count">
        {$sectionState.fetchedCount}/{$sectionState.totalCount} fetched
    </span>
{/if}

<span class="section-indicator" hidden={!$sectionState.hasError}>
    {$sectionState.hasRateLimit ? 'Rate limited' : 'Fetch failed'}
</span>

<style>
    .section-count {
        margin-left: 0.55rem;
        font-size: 0.78em;
        color: #59636e;
    }

    .section-count-link {
        color: #0969da;
        text-decoration: none;
    }

    .section-count-link:hover {
        text-decoration: underline;
    }

    .section-count-link:focus-visible {
        border-radius: 4px;
        outline: none;
        box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.25);
    }

    .section-indicator {
        margin-left: 0.5rem;
        font-size: 0.78em;
        color: #9a6700;
    }
</style>
