<script lang="ts">
    import { fetchAwesomeList } from './lib/how-awesome';

    let repoUrl: string | null = $state(null);
    let repoPath: string | null = $derived.by(() => {
        if (!repoUrl) return null;
        try {
            return new URL(repoUrl).pathname;
        } catch (e) {
            // TODO: Parse properly
            return `/${repoUrl}`;
        }
    });
    let repoMd: Promise<string> | null = $state(new Promise(() => {}));
</script>

<main>
    <!-- Repo URL input -->
    <div>
        <input type="url" bind:value={repoUrl} />
        <input
            type="button"
            value="How awesome?"
            onclick={() => (repoMd = fetchAwesomeList(repoPath))}
        />
    </div>
    <!-- Rendered list -->
    <div>
        {#await repoMd then rawMarkdownText}
            <textarea>
                {rawMarkdownText}
            </textarea>
        {:catch err}
            {#if err.repoPath}
                Unable to fetch readme of project <a href={err.repoUrl}>
                    {err.repoPath}
                </a>
            {:else}
                {err}
            {/if}
        {/await}
    </div>
</main>

<style>
</style>
