<script lang="ts">
    import {
        HowAwesomeError,
        fetchRepoInformation,
        processAwesomeList,
    } from './lib/how-awesome';
    import { apiState } from './lib/how-awesome/github.svelte.js';
    import RepoMeta from './lib/RepoMeta.svelte';
    import SectionMeta from './lib/SectionMeta.svelte';
    import 'github-markdown-css';
    import { mount, tick, unmount } from 'svelte';
    import {
        derived,
        get,
        readable,
        type Readable,
        type Writable,
        writable,
    } from 'svelte/store';

    type RepoInfo = Awaited<ReturnType<typeof fetchRepoInformation>>;

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

    type SectionState = {
        hasError: boolean;
        hasRateLimit: boolean;
        allLoaded: boolean;
    };

    type MountedComponent = ReturnType<typeof mount>;

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
    let annotatedAwesomeList: Promise<string> | null = $state(
        new Promise(() => {}),
    );

    let pageState: string = $state('repoSelectionView');
    let listContainer: HTMLElement | null = $state(null);

    const repoStoreByPath = new Map<string, Writable<RepoState>>();
    const repoMetaByHost = new Map<HTMLElement, MountedComponent>();
    const sectionMetaByHost = new Map<HTMLElement, MountedComponent>();

    function createInitialRepoState(): RepoState {
        return {
            status: 'idle',
            info: null,
            error: null,
        };
    }

    function getRepoStore(repoPath: string): Writable<RepoState> {
        if (!repoStoreByPath.has(repoPath)) {
            repoStoreByPath.set(repoPath, writable(createInitialRepoState()));
        }
        return repoStoreByPath.get(repoPath)!;
    }

    function updateGlobalStatus() {
        if (!listContainer) return;
        const banner = listContainer.querySelector('.fetch-status-banner');
        if (!banner) return;
        let hasError = false;
        let hasRateLimit = false;

        for (const repoStore of repoStoreByPath.values()) {
            const state = get(repoStore);
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

    async function fetchRepo(repoPath: string) {
        const repoStore = getRepoStore(repoPath);
        const state = get(repoStore);
        if (state.status === 'loading' || state.status === 'loaded') return;

        repoStore.set({
            ...state,
            status: 'loading',
            error: null,
        });
        updateGlobalStatus();

        try {
            const info = await fetchRepoInformation(repoPath);
            repoStore.set({
                status: 'loaded',
                info,
                error: null,
            });
        } catch (error) {
            repoStore.set({
                ...get(repoStore),
                status: 'error',
                error: {
                    message: error?.message ?? 'Fetch failed',
                    status: error?.status,
                    rateLimited:
                        error?.rateLimitRemaining === '0' ||
                        (error?.status === 403 && apiState.hasHitRateLimit),
                },
            });
        }

        updateGlobalStatus();
    }

    function getSectionRepoPaths(section: Element): string[] {
        const headingLevel = Number(section.tagName.slice(1));
        const repoPaths: string[] = [];
        let node = section.nextElementSibling;

        while (node) {
            if (node.classList.contains('awesome-section')) {
                const nextLevel = Number(node.tagName.slice(1));
                if (nextLevel <= headingLevel) {
                    break;
                }
            }

            node.querySelectorAll('a.awesome-link').forEach(link => {
                const repoPath = link.getAttribute('data-repo-path');
                if (repoPath) {
                    repoPaths.push(repoPath);
                }
            });
            node = node.nextElementSibling;
        }

        return repoPaths;
    }

    function ensureStatusBanner(container: HTMLElement) {
        if (container.querySelector('.fetch-status-banner')) return;
        const banner = document.createElement('div');
        banner.className = 'fetch-status-banner';
        banner.hidden = true;
        container.prepend(banner);
    }

    function mountRepoMeta(link: HTMLAnchorElement, repoPath: string) {
        if (link.dataset.repoMetaMounted === 'true') return;

        const host = document.createElement('span');
        host.className = 'repo-meta-host';
        link.insertAdjacentElement('afterend', host);

        const component = mount(RepoMeta, {
            target: host,
            props: {
                repoState: getRepoStore(repoPath),
                onFetch: () => fetchRepo(repoPath),
            },
        });

        repoMetaByHost.set(host, component);
        link.dataset.repoMetaMounted = 'true';
    }

    function buildSectionStateStore(
        repoPaths: string[],
    ): Readable<SectionState> {
        const repoStores = repoPaths.map(repoPath => getRepoStore(repoPath));
        if (repoStores.length === 0) {
            return readable({
                hasError: false,
                hasRateLimit: false,
                allLoaded: false,
            });
        }

        return derived(repoStores, states => {
            let hasError = false;
            let hasRateLimit = false;
            let allLoaded = true;

            for (const state of states) {
                if (state.error) {
                    hasError = true;
                    if (state.error.rateLimited) {
                        hasRateLimit = true;
                    }
                }
                if (state.status !== 'loaded') {
                    allLoaded = false;
                }
            }

            return {
                hasError,
                hasRateLimit,
                allLoaded,
            };
        });
    }

    function mountSectionMeta(section: Element) {
        if ((section as HTMLElement).dataset.sectionMetaMounted === 'true')
            return;

        const repoPaths = getSectionRepoPaths(section);
        const host = document.createElement('span');
        host.className = 'section-meta-host';
        section.appendChild(host);

        const sectionState = buildSectionStateStore(repoPaths);
        const component = mount(SectionMeta, {
            target: host,
            props: {
                sectionState,
                onFetchAll: () => {
                    repoPaths.forEach(repoPath => fetchRepo(repoPath));
                },
            },
        });

        sectionMetaByHost.set(host, component);
        (section as HTMLElement).dataset.sectionMetaMounted = 'true';
    }

    function clearMountedComponents() {
        for (const component of repoMetaByHost.values()) {
            unmount(component);
        }
        for (const component of sectionMetaByHost.values()) {
            unmount(component);
        }

        repoMetaByHost.clear();
        sectionMetaByHost.clear();
    }

    function enhanceAwesomeList() {
        if (!listContainer) return;

        ensureStatusBanner(listContainer);

        const links = listContainer.querySelectorAll('a.awesome-link');
        links.forEach(link => {
            const repoPath = link.getAttribute('data-repo-path');
            if (!repoPath) return;
            mountRepoMeta(link as HTMLAnchorElement, repoPath);
        });

        const sections = listContainer.querySelectorAll('.awesome-section');
        sections.forEach(section => mountSectionMeta(section));

        updateGlobalStatus();
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
                    clearMountedComponents();
                    repoStoreByPath.clear();
                    apiState.hasHitRateLimit = false;
                    annotatedAwesomeList = processAwesomeList(repoPath);
                    pageState = 'listView';
                }}
            />
        </div>

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
