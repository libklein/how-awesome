export let apiState = $state({
    token: null,
    hasHitRateLimit: false,
    isAuthenticated: false,
});

export async function queryGithubApi(apiURL) {
    console.log(`Querying GitHub API: ${apiURL}`);
    const headers = {
        Accept: 'application/vnd.github+json',
    };
    if (apiState.token) {
        headers.Authorization = `Bearer ${apiState.token}`;
    }
    const response = await fetch(apiURL, { headers });
    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    if (response.status === 403 && rateLimitRemaining === '0') {
        apiState.hasHitRateLimit = true;
    }
    return {
        ok: response.ok,
        status: response.status,
        data,
        headers: response.headers,
    };
}

export async function authenticate() {}
