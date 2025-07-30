export let apiState = $state({
    token: null,
    hasHitRateLimit: false,
    isAuthenticated: false,
});

export async function queryGithubApi(apiURL) {
    console.log(`Querying GitHub API: ${apiURL}`);
    return await (await fetch(apiURL)).json();
}

export async function authenticate() {}
