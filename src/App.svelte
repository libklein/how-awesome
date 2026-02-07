<script lang="ts">
    import { HowAwesomeError, processAwesomeList } from './lib/how-awesome';
    import { formatDistanceToNow } from 'date-fns';
    import 'github-markdown-css';

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

    function formatDate(date) {
        if (!date) {
            return '';
        }
        return formatDistanceToNow(date, { addSuffix: true });
    }
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
                    annotatedAwesomeList = processAwesomeList(repoPath);
                    pageState = 'listView';
                }}
            />
        </div>
        <!-- Rendered list -->
        <div>
            {#await annotatedAwesomeList then annotatedAwesomeList}
                <div class="markdown-body">
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
