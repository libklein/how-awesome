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
        if (state.error) {
            if (state.error.rateLimited) {
                return 'rate limited';
            }
            return 'fetch failed';
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
    let actionLabel = $derived($repoState.error ? 'Retry' : 'Fetch');
</script>

<span class="repo-meta">
    {#if $repoState.status === 'loading'}
        <span class="repo-meta-status loading">
            <span class="loading-dot" aria-hidden="true"></span>
            Fetching...
        </span>
    {:else if $repoState.status === 'loaded'}
        <span class="repo-meta-text">{metaText}</span>
    {:else}
        {#if $repoState.status === 'error'}
            <span class="repo-meta-status error">{metaText}</span>
        {/if}
        <button
            class="repo-fetch-action"
            type="button"
            onclick={onFetch}
        >
            {actionLabel}
        </button>
    {/if}
</span>

<style>
    .repo-meta {
        margin-left: 0.35rem;
        font-size: 0.78rem;
        color: #59636e;
        white-space: nowrap;
        vertical-align: baseline;
    }

    .repo-meta-text {
        color: #59636e;
    }

    .repo-meta-status {
        color: #59636e;
    }

    .repo-meta-status.error {
        color: #9a6700;
        margin-right: 0.35rem;
    }

    .repo-meta-status.loading {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
    }

    .repo-fetch-action {
        margin-left: 0.35rem;
        padding: 0 0.5rem;
        height: 24px;
        border: 1px solid #d1d9e0;
        border-radius: 6px;
        background: linear-gradient(180deg, #f6f8fa, #f3f4f6);
        font: inherit;
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1;
        color: #24292f;
        cursor: pointer;
    }

    .repo-fetch-action:hover {
        background: #f3f4f6;
        border-color: #afb8c1;
    }

    .repo-fetch-action:active {
        background: #ebedf0;
    }

    .repo-fetch-action:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.25);
    }

    .loading-dot {
        width: 0.45rem;
        height: 0.45rem;
        border-radius: 50%;
        background: #57606a;
        animation: pulse 850ms ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 0.25;
        }
        50% {
            opacity: 1;
        }
    }
</style>
