<script>
    let { heading, repos } = $props();
</script>

<h3>{heading}</h3>

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Created</th>
            <th>Stars</th>
            <th>Updated</th>
        </tr>
    </thead>
    <tbody>
        {#each repos as repo}
            <tr>
                <td>
                    <a href={repo.url} target="_blank">{repo.name}</a>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
            </tr>
        {/each}
    </tbody>
</table>

<style>
</style>
