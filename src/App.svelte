<script lang="ts">
    import { HowAwesomeError, processAwesomeList } from './lib/how-awesome';
    import AwesomeListSection from './lib/AwesomeListSection.svelte';
    import { formatDistanceToNow } from 'date-fns';

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
    let annotatedAwesomeList: Promise<object> | null = $state(
        new Promise(() => {}),
    );

    function formatDate(date) {
        if (!date) {
            return '';
        }
        return formatDistanceToNow(date, { addSuffix: true });
    }
</script>

<main>
    <!-- Repo URL input -->
    <div>
        <input
            type="url"
            bind:value={repoUrl}
            placeholder="sindresorhus/awesome"
        />
        <input
            type="button"
            value="How awesome?"
            onclick={() =>
                (annotatedAwesomeList = processAwesomeList(repoPath))}
        />
    </div>
    <!-- Rendered list -->
    <div>
        {#await annotatedAwesomeList then annotatedAwesomeList}
            <div>
                {#each annotatedAwesomeList as section}
                    <AwesomeListSection
                        heading={section.heading}
                        repos={section.repos}
                    />
                {/each}
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
</main>

<style>
</style>
