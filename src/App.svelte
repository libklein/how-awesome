<script lang="ts">
    import {
        HowAwesomeError,
        fetchRepoInformation,
        processAwesomeList,
    } from './lib/how-awesome';
    import { apiState } from './lib/how-awesome/github.svelte.js';
    import { formatDistanceToNow } from 'date-fns';
    import 'github-markdown-css';
    import { tick } from 'svelte';

    let repoUrl: string | null = $state(
        'https://github.com/Strift/awesome-esports',
    );
    let repoPath: string | null = $derived.by(() => {
        if (!repoUrl) return null;
        try {
            return new URL(repoUrl).pathname;
        } catch (e) {
            // TODO: Parse properly
            return `/${repoUrl}`;
        }
    });
    let annotatedAwesomeList: Promise<String> | null = $state(
        new Promise(() => {}),
    );

    let pageState: String = $state('repoSelectionView');
    let listContainer: HTMLElement | null = $state(null);

    const repoStateByPath = new Map();

    function formatDate(date) {
        if (!date) {
            return '';
        }
        return formatDistanceToNow(date, { addSuffix: true });
    }

    function formatStars(stars) {
        if (stars === null || stars === undefined) {
            return '';
        }
        return Intl.NumberFormat('en', {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(stars);
    }

    function getRepoState(repoPath) {
        if (!repoStateByPath.has(repoPath)) {
            repoStateByPath.set(repoPath, {
                status: 'idle',
                info: null,
                error: null,
            });
        }
        return repoStateByPath.get(repoPath);
    }

    function renderRepoMetaText(state) {
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

    function escapeAttr(value) {
        if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(value);
        }
        return value.replace(/"/g, '\\"');
    }

    function updateRepoMeta(repoPath) {
        if (!listContainer) return;
        const state = getRepoState(repoPath);
        const metas = listContainer.querySelectorAll(
            `.repo-meta[data-repo-path="${escapeAttr(repoPath)}"]`,
        );
        metas.forEach(meta => {
            const text = meta.querySelector('.repo-meta-text');
            if (text) {
                text.textContent = renderRepoMetaText(state);
            }
            const button = meta.querySelector('.repo-fetch-button');
            if (button) {
                if (state.status === 'loaded') {
                    button.remove();
                } else {
                    button.disabled = state.status === 'loading';
                }
            }
        });
    }

    function updateGlobalStatus() {
        if (!listContainer) return;
        const banner = listContainer.querySelector('.fetch-status-banner');
        if (!banner) return;
        let hasError = false;
        let hasRateLimit = false;
        for (const state of repoStateByPath.values()) {
            if (state.error) {
                hasError = true;
                if (state.error.rateLimited) {
                    hasRateLimit = true;
                }
            }
        }
        if (hasError) {
            banner.hidden = false;
            banner.textContent = hasRateLimit
                ? 'Some repo lookups failed due to GitHub rate limits.'
                : 'Some repo lookups failed.';
        } else {
            banner.hidden = true;
            banner.textContent = '';
        }
    }

    function updateSectionIndicator(section) {
        if (!listContainer) return;
        let indicator = section.querySelector('.section-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'section-indicator';
            section.appendChild(indicator);
        }
        const links = getSectionLinks(section);
        let hasError = false;
        let hasRateLimit = false;
        let allLoaded = links.length > 0;
        links.forEach(link => {
            const repoPath = link.dataset.repoPath;
            if (!repoPath) return;
            const state = getRepoState(repoPath);
            if (state.error) {
                hasError = true;
                if (state.error.rateLimited) {
                    hasRateLimit = true;
                }
            }
            if (state.status !== 'loaded') {
                allLoaded = false;
            }
        });
        const sectionButton = section.querySelector('.section-fetch-button');
        if (sectionButton && allLoaded) {
            sectionButton.remove();
        }
        if (!hasError) {
            indicator.textContent = '';
            indicator.hidden = true;
            return;
        }
        indicator.hidden = false;
        indicator.textContent = hasRateLimit ? ' rate limited' : ' fetch failed';
    }

    async function fetchRepo(repoPath) {
        const state = getRepoState(repoPath);
        if (state.status === 'loading' || state.status === 'loaded') return;
        state.status = 'loading';
        state.error = null;
        updateRepoMeta(repoPath);
        updateGlobalStatus();
        try {
            const info = await fetchRepoInformation(repoPath);
            state.info = info;
            state.status = 'loaded';
        } catch (error) {
            state.status = 'error';
            state.error = {
                message: error?.message ?? 'Fetch failed',
                status: error?.status,
                rateLimited:
                    error?.rateLimitRemaining === '0' ||
                    (error?.status === 403 && apiState.hasHitRateLimit),
            };
        }
        updateRepoMeta(repoPath);
        updateGlobalStatus();
        if (listContainer) {
            listContainer
                .querySelectorAll('.awesome-section')
                .forEach(section => updateSectionIndicator(section));
        }
    }

    function getSectionLinks(section) {
        const headingLevel = Number(section.tagName.slice(1));
        const links = [];
        let node = section.nextElementSibling;
        while (node) {
            if (node.classList.contains('awesome-section')) {
                const nextLevel = Number(node.tagName.slice(1));
                if (nextLevel <= headingLevel) {
                    break;
                }
            }
            links.push(...node.querySelectorAll('a.awesome-link'));
            node = node.nextElementSibling;
        }
        return links;
    }

    function ensureStatusBanner(container) {
        if (container.querySelector('.fetch-status-banner')) return;
        const banner = document.createElement('div');
        banner.className = 'fetch-status-banner';
        banner.hidden = true;
        container.prepend(banner);
    }

    function enhanceAwesomeList() {
        if (!listContainer) return;
        ensureStatusBanner(listContainer);
        const links = listContainer.querySelectorAll('a.awesome-link');
        links.forEach(link => {
            const repoPath = link.dataset.repoPath;
            if (!repoPath) return;
            if (link.dataset.enhanced === 'true') {
                updateRepoMeta(repoPath);
                return;
            }
            link.dataset.enhanced = 'true';
            const meta = document.createElement('span');
            meta.className = 'repo-meta';
            meta.dataset.repoPath = repoPath;
            const text = document.createElement('span');
            text.className = 'repo-meta-text';
            meta.appendChild(text);
            const button = document.createElement('button');
            button.className = 'repo-fetch-button';
            button.type = 'button';
            button.textContent = 'Fetch';
            button.addEventListener('click', () => fetchRepo(repoPath));
            meta.appendChild(button);
            link.insertAdjacentElement('afterend', meta);
            updateRepoMeta(repoPath);
        });

        const sections = listContainer.querySelectorAll('.awesome-section');
        sections.forEach(section => {
            if (!section.querySelector('.section-fetch-button')) {
                const button = document.createElement('button');
                button.className = 'section-fetch-button';
                button.type = 'button';
                button.textContent = 'Fetch all';
                button.addEventListener('click', () => {
                    const sectionLinks = getSectionLinks(section);
                    sectionLinks.forEach(link => {
                        const repoPath = link.dataset.repoPath;
                        if (repoPath) {
                            fetchRepo(repoPath);
                        }
                    });
                });
                section.appendChild(button);
            }
            updateSectionIndicator(section);
        });
    }

    $effect(async () => {
        // Rerun when list content or container changes.
        annotatedAwesomeList;
        listContainer;
        await tick();
        enhanceAwesomeList();
    });
</script>

<main>
    <div
        id="page-container"
        class={{ 'repo-selection-view': pageState === 'repoSelectionView' }}
    >
        <!-- Repo URL input -->
        <div class="repo-selector">
            <input
                type="url"
                bind:value={repoUrl}
                placeholder="sindresorhus/awesome"
            />
            <input
                type="button"
                value="How awesome?"
                onclick={() => {
                    repoStateByPath.clear();
                    apiState.hasHitRateLimit = false;
                    annotatedAwesomeList = processAwesomeList(repoPath);
                    pageState = 'listView';
                }}
            />
        </div>
        <!-- Rendered list -->
        <div>
            {#await annotatedAwesomeList then annotatedAwesomeList}
                <div class="markdown-body" bind:this={listContainer}>
                    {@html annotatedAwesomeList}
                </div>
            {:catch err}
                <div class="card alert">
                    {#if err instanceof HowAwesomeError}
                        Unable to process
                        <a href={err.repoUrl}>
                            {err.repoPath}
                        </a>:
                        <br />
                        {err.message}
                    {:else}
                        {err}
                    {/if}
                </div>
            {/await}
        </div>
    </div>
</main>

<style>
</style>
