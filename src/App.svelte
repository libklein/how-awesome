<script lang="ts">
    import {
        HowAwesomeError,
        annotateAwesomeAST,
        fetchAwesomeList,
        fetchRateLimitInformation,
        fetchRepoInformation,
        renderReadmeHtml,
    } from './lib/how-awesome';
    import { apiState } from './lib/how-awesome/github.svelte.js';
    import RepoMeta from './lib/RepoMeta.svelte';
    import SectionMeta from './lib/SectionMeta.svelte';
    import { repoStateFor } from './lib/how-awesome/repo-cache.svelte.js';
    import 'github-markdown-css';
    import AwesomeLogo from './awesome-logo.svelte';
    import { mount, tick, unmount } from 'svelte';

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

    function parseRepoPath(value: string | null): string | null {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;

        try {
            const parsed = new URL(trimmed);
            if (parsed.hostname !== 'github.com') {
                return null;
            }
            const [owner, repo] = parsed.pathname
                .split('/')
                .filter(Boolean)
                .slice(0, 2);
            if (!owner || !repo) {
                return null;
            }
            return `/${owner}/${repo}`;
        } catch {
            const [owner, repo] = trimmed
                .replace(/^\/+|\/+$/g, '')
                .split('/')
                .filter(Boolean)
                .slice(0, 2);
            if (!owner || !repo) {
                return null;
            }
            return `/${owner}/${repo}`;
        }
    }

    function repoUrlFromPath(path: string): string {
        return `https://github.com${path}`;
    }

    function getQueryRepoPath(): string | null {
        if (typeof window === 'undefined') return null;
        const queryRepo = new URLSearchParams(window.location.search).get(
            'repo',
        );
        return parseRepoPath(queryRepo);
    }

    function syncRepoQueryParam(path: string | null) {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (path) {
            url.searchParams.set('repo', path.slice(1));
        } else {
            url.searchParams.delete('repo');
        }
        window.history.replaceState(
            null,
            '',
            `${url.pathname}${url.search}${url.hash}`,
        );
    }

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
    let hasLoadedInitialRateLimit: boolean = $state(false);
    let hasAppliedQueryRepo: boolean = $state(false);
    let activeTab: 'annotated' | 'original' = $state('annotated');

    let pageState: string = $state('repoSelectionView');
    let listContainer: HTMLElement | null = $state(null);
    let hasLoadedList: boolean = $state(false);

    let footerDimissed: boolean = $state(false);
    let showFooter: boolean = $derived.by(() => {
        return !footerDimissed && pageState === 'listView';
    });
    let footerVariant: 'hint' | 'usage' | 'attention' | 'hit' = $derived.by(
        () => {
            if (apiState.current.hasHitRateLimit) {
                return 'hit';
            }
            if (!apiState.current.ratelimit) {
                return 'hint';
            }
            if (
                typeof apiState.current.ratelimit.remaining === 'number' &&
                apiState.current.ratelimit.remaining < 10
            ) {
                return 'attention';
            }
            return 'usage';
        },
    );
    let rateLimitResetText: string = $derived.by(() => {
        const reset = apiState.current.ratelimit?.reset;
        if (!(reset instanceof Date) || Number.isNaN(reset.getTime())) {
            return 'an unknown time';
        }
        return new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(reset);
    });

    const repoMetaByHost = new Map<HTMLElement, MountedComponent>();
    const sectionMetaByHost = new Map<HTMLElement, MountedComponent>();

    async function fetchRepo(repoPath: string) {
        const repoState = repoStateFor(repoPath);
        if (repoState.status === 'loading' || repoState.status === 'loaded')
            return;

        repoState.status = 'loading';
        repoState.error = null;

        try {
            const info = await fetchRepoInformation(repoPath);
            repoState.state = {
                status: 'loaded',
                info,
                error: null,
            };
        } catch (error) {
            repoState.state = {
                ...repoState.state,
                status: 'error',
                error: {
                    message: error?.message ?? 'Fetch failed',
                    status: error?.status,
                    rateLimited:
                        error?.rateLimitRemaining === '0' ||
                        (error?.status === 403 &&
                            apiState.current.hasHitRateLimit),
                },
            };
        }
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

    function mountRepoMeta(link: HTMLAnchorElement, repoPath: string) {
        if (link.dataset.repoMetaMounted === 'true') return;

        const host = document.createElement('span');
        host.className = 'repo-meta-host';
        link.insertAdjacentElement('afterend', host);

        const component = mount(RepoMeta, {
            target: host,
            props: {
                repoState: repoStateFor(repoPath),
                onFetch: () => fetchRepo(repoPath),
            },
        });

        repoMetaByHost.set(host, component);
        link.dataset.repoMetaMounted = 'true';
    }

    function computeSectionState(repoPaths: string[]): SectionState {
        let hasError = false;
        let hasRateLimit = false;
        let allLoaded = repoPaths.length > 0;
        let fetchedCount = 0;

        for (const repoPath of repoPaths) {
            const state = repoStateFor(repoPath).state;
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
            totalCount: repoPaths.length,
        };
    }

    function buildSectionStateView(repoPaths: string[]) {
        return {
            get hasError() {
                return computeSectionState(repoPaths).hasError;
            },
            get hasRateLimit() {
                return computeSectionState(repoPaths).hasRateLimit;
            },
            get allLoaded() {
                return computeSectionState(repoPaths).allLoaded;
            },
            get fetchedCount() {
                return computeSectionState(repoPaths).fetchedCount;
            },
            get totalCount() {
                return computeSectionState(repoPaths).totalCount;
            },
        };
    }

    function mountSectionMeta(section: Element) {
        if ((section as HTMLElement).dataset.sectionMetaMounted === 'true')
            return;

        const repoPaths = getSectionRepoPaths(section);
        const host = document.createElement('span');
        host.className = 'section-meta-host';
        section.appendChild(host);

        const sectionState = buildSectionStateView(repoPaths);
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

    function submitRepoSelection(overrideRepoPath?: string) {
        const selectedRepoPath = overrideRepoPath ?? repoPath;
        if (!selectedRepoPath) {
            return;
        }

        clearMountedComponents();
        hasLoadedList = false;
        listContainer = null;
        activeTab = 'annotated';
        syncRepoQueryParam(selectedRepoPath);
        readmeViews = (async () => {
            const repoReadme = await fetchAwesomeList(selectedRepoPath);
            return {
                annotated: annotateAwesomeAST(repoReadme, selectedRepoPath),
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

    async function loadInitialRateLimit() {
        try {
            await fetchRateLimitInformation();
        } catch {
            // Continue without initial rate-limit data if request fails.
        }
    }

    function enhanceAwesomeList() {
        if (!listContainer) return;

        const links = listContainer.querySelectorAll('a.awesome-link');
        links.forEach(link => {
            const repoPath = link.getAttribute('data-repo-path');
            if (!repoPath) return;
            mountRepoMeta(link as HTMLAnchorElement, repoPath);
        });

        const sections = listContainer.querySelectorAll('.awesome-section');
        sections.forEach(section => mountSectionMeta(section));
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

    $effect(() => {
        if (hasLoadedInitialRateLimit) return;
        hasLoadedInitialRateLimit = true;
        void loadInitialRateLimit();
    });

    $effect(() => {
        if (hasAppliedQueryRepo) return;
        hasAppliedQueryRepo = true;
        const queryRepoPath = getQueryRepoPath();
        if (!queryRepoPath) return;
        repoUrl = repoUrlFromPath(queryRepoPath);
        submitRepoSelection(queryRepoPath);
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
            <header class="repo-selector-header">
                <span class="repo-selector-header-logo">
                    <AwesomeLogo />
                </span>
                <div class="repo-selector-header-body">
                    <span
                        ><a href="https://github.com/libklein">libklein</a>
                        published
                        <a href="https://github.com/libklein/how-awesome"
                            >How Awesome?</a
                        ></span
                    >
                    <span>just now</span>
                </div>
            </header>
            <section class="repo-help-container">
                <p class="repo-help">
                    How awesome automatically annotates GitHub awesome lists
                    with repository statistics like the number of stars, last
                    commit date, and more.
                </p>
                <p class="repo-help">
                    Getting started is as easy as entering the GitHub URL or
                    <code>owner/repo</code> path of any awesome list.
                </p>
            </section>
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
<footer
    class:hidden={!showFooter}
    class:footer-hint={footerVariant === 'hint'}
    class:footer-usage={footerVariant === 'usage'}
    class:footer-attention={footerVariant === 'attention'}
    class:footer-hit={footerVariant === 'hit'}
>
    <div class="footer-content">
        <span class="footer-message">
            {#if footerVariant === 'hit'}
                Rate limit hit. GitHub API requests reset at {rateLimitResetText}.
            {:else if footerVariant === 'usage' || footerVariant === 'attention'}
                GitHub API usage:
                {apiState.current.ratelimit?.used ?? 0}/{apiState.current
                    .ratelimit?.limit ?? 60}. Resets at {rateLimitResetText}.
            {:else}
                GitHub API requests are rate-limited to ~60 requests per day.
            {/if}
            <a
                href="https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28#primary-rate-limit-for-unauthenticated-users"
                >Learn more</a
            >.
        </span>
        <button
            class="footer-dismiss-button"
            aria-label="dismiss"
            onclick={() => {
                footerDimissed = true;
            }}
        >
            <svg
                aria-hidden="true"
                focusable="false"
                class="footer-dismiss-icon"
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="currentColor"
                display="inline-block"
                overflow="visible"
                style="vertical-align: text-bottom;"
                ><path
                    d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
                ></path></svg
            >
        </button>
    </div>
</footer>

<style>
</style>
