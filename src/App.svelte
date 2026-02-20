<script lang="ts">
    import {
        HowAwesomeError,
        annotateAwesomeAST,
        fetchAwesomeList,
        fetchRepoInformation,
        renderReadmeHtml,
    } from './lib/how-awesome';
    import { apiState } from './lib/how-awesome/github.svelte.js';
    import RepoMeta from './lib/RepoMeta.svelte';
    import SectionMeta from './lib/SectionMeta.svelte';
    import 'github-markdown-css';
    import AwesomeLogo from './awesome-logo.svelte';
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
        fetchedCount: number;
        totalCount: number;
    };

    type MountedComponent = ReturnType<typeof mount>;
    type ReadmeViews = {
        annotated: string;
        original: string;
    };

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
    let readmeViews: Promise<ReadmeViews> | null = $state(
        new Promise(() => {}),
    );
    let activeTab: 'annotated' | 'original' = $state('annotated');

    let pageState: string = $state('repoSelectionView');
    let pageError: string | null = $state(null);
    let listContainer: HTMLElement | null = $state(null);
    let hasLoadedList: boolean = $state(false);

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

        return [...new Set(repoPaths)];
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
                fetchedCount: 0,
                totalCount: 0,
            });
        }

        return derived(repoStores, states => {
            let hasError = false;
            let hasRateLimit = false;
            let allLoaded = true;
            let fetchedCount = 0;

            for (const state of states) {
                if (state.error) {
                    hasError = true;
                    if (state.error.rateLimited) {
                        hasRateLimit = true;
                    }
                }
                if (state.status !== 'loaded') {
                    allLoaded = false;
                } else {
                    fetchedCount += 1;
                }
            }

            return {
                hasError,
                hasRateLimit,
                allLoaded,
                fetchedCount,
                totalCount: states.length,
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

    function submitRepoSelection() {
        clearMountedComponents();
        repoStoreByPath.clear();
        apiState.hasHitRateLimit = false;
        hasLoadedList = false;
        listContainer = null;
        activeTab = 'annotated';
        readmeViews = (async () => {
            const repoReadme = await fetchAwesomeList(repoPath);
            return {
                annotated: annotateAwesomeAST(repoReadme, repoPath),
                original: renderReadmeHtml(repoReadme),
            };
        })()
            .then(result => {
                hasLoadedList = true;
                return result;
            })
            .catch(error => {
                hasLoadedList = false;
                throw error;
            });
        pageState = 'listView';
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
        readmeViews;
        listContainer;
        activeTab;
        await tick();
        if (activeTab !== 'annotated') return;
        enhanceAwesomeList();
    });
</script>

<header class="top-header">
    <div class="header-content">
        <span class="header-logo" aria-hidden="true">
            <AwesomeLogo />
        </span>
        <span class="header-text">
            <span class="header-title">How Awesome?</span>
            <span class="header-description"
                >Annotate awesome lists with repository statistics</span
            >
        </span>
    </div>
</header>
<main>
    <div id="page-container">
        <section class="repo-selector-box" hidden={hasLoadedList}>
            <label class="repo-label" for="awesome-repo-input">
                <svg
                    aria-hidden="true"
                    height="16"
                    viewBox="0 0 16 16"
                    version="1.1"
                    width="16"
                    data-view-component="true"
                    class="repo-label-icon"
                >
                    <path
                        d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"
                    ></path>
                </svg>
                <span class="repo-label-body"> Repository </span>
            </label>
            <p class="repo-help">
                Enter a GitHub awesome list repository URL or owner/repo path.
            </p>
            <form
                class="repo-selector"
                onsubmit={event => {
                    event.preventDefault();
                    submitRepoSelection();
                }}
            >
                <div class="repo-input-wrap">
                    <svg
                        class="repo-input-icon"
                        aria-hidden="true"
                        height="16"
                        viewBox="0 0 16 16"
                        version="1.1"
                        width="16"
                        data-view-component="true"
                    >
                        <path
                            d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"
                        ></path>
                    </svg>
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                        id="awesome-repo-input"
                        class="repo-input"
                        type="url"
                        autofocus
                        bind:value={repoUrl}
                        placeholder="How awesome?"
                    />
                </div>
                <button class="primary-action" type="submit">
                    Analyze list
                </button>
            </form>
        </section>

        <div class="content-panel" hidden={pageState !== 'listView'}>
            <div class="readme-tabs" role="tablist" aria-label="README view">
                <button
                    type="button"
                    role="tab"
                    class="readme-tab"
                    class:active={activeTab === 'annotated'}
                    aria-selected={activeTab === 'annotated'}
                    onclick={() => {
                        activeTab = 'annotated';
                    }}
                >
                    Annotated README
                </button>
                <button
                    type="button"
                    role="tab"
                    class="readme-tab"
                    class:active={activeTab === 'original'}
                    aria-selected={activeTab === 'original'}
                    onclick={() => {
                        activeTab = 'original';
                    }}
                >
                    Original README
                </button>
            </div>
            <div class="content-panel-body">
                {#await readmeViews}
                    <div class="loading-state">Loading README...</div>
                {:then readmeViews}
                    {#if activeTab === 'annotated'}
                        <div class="markdown-body" bind:this={listContainer}>
                            {@html readmeViews.annotated}
                        </div>
                    {:else}
                        <div class="markdown-body">
                            {@html readmeViews.original}
                        </div>
                    {/if}
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
    </div>
</main>

<style>
</style>
