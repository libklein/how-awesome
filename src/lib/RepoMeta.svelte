<script lang="ts">
    import { formatDistanceToNow } from 'date-fns';
    import type { Readable } from 'svelte/store';

    type RepoInfo = {
        stars: number | null;
        updated_at: Date | null;
    };

    type RepoError = {
        message: string;
        status?: number;
        rateLimited: boolean;
    };

    type RepoState = {
        status: 'idle' | 'loading' | 'loaded' | 'error';
        info: RepoInfo | null;
        error: RepoError | null;
    };

    let {
        repoState,
        onFetch,
    }: {
        repoState: Readable<RepoState>;
        onFetch: () => void;
    } = $props();

    function formatDate(date: Date | null) {
        if (!date) {
            return '';
        }
        return formatDistanceToNow(date, { addSuffix: true });
    }

    function formatStars(stars: number | null) {
        if (stars === null || stars === undefined) {
            return '';
        }
        return Intl.NumberFormat('en', {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(stars);
    }

    function renderRepoMetaText(state: RepoState) {
        if (state.status === 'loading') {
            return ' (loading...)';
        }
        if (state.error) {
            if (state.error.rateLimited) {
                return ' (rate limited)';
            }
            return ' (fetch failed)';
        }
        if (!state.info) {
            return '';
        }
        const stars = formatStars(state.info.stars);
        const updated = formatDate(state.info.updated_at);
        if (stars && updated) {
            return ` (★ ${stars} · updated ${updated})`;
        }
        if (stars) {
            return ` (★ ${stars})`;
        }
        if (updated) {
            return ` (updated ${updated})`;
        }
        return '';
    }

    let metaText = $derived(renderRepoMetaText($repoState));
</script>

<span class="repo-meta">
    {#if $repoState.status !== 'loaded'}
        <button
            class="repo-fetch-action"
            type="button"
            disabled={$repoState.status === 'loading'}
            onclick={onFetch}
        >
            (fetch)
        </button>
    {:else}
        <span class="repo-meta-text">{metaText}</span>
    {/if}
</span>

<style>
    .repo-meta {
        font-size: 0.9em;
        opacity: 0.9;
        white-space: nowrap;
    }

    .repo-meta-text {
        margin-right: 0.4rem;
    }

    .repo-fetch-action {
        margin-left: 0.25rem;
        padding: 0;
        border: 0;
        background: transparent;
        font: inherit;
        font-size: 0.95em;
        line-height: inherit;
        color: currentColor;
        opacity: 0.7;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    .repo-fetch-action:hover:enabled {
        opacity: 1;
    }

    .repo-fetch-action:disabled {
        opacity: 0.5;
        cursor: default;
        text-decoration: none;
    }

    .repo-fetch-action:focus-visible {
        outline: 1px solid currentColor;
        outline-offset: 2px;
        border-radius: 2px;
    }
</style>
