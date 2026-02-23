import { persistedState } from 'svelte-persisted-state';

export let apiState = persistedState(
    'apiState',
    {
        token: null,
        hasHitRateLimit: false,
        isAuthenticated: false,
        ratelimit: null,
    },
    {
        storage: 'session',
    },
);

function parseOptionalInt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value !== '') {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}

function toDateFromEpochSeconds(value) {
    const seconds = parseOptionalInt(value);
    return seconds ? new Date(seconds * 1000) : null;
}

function dateToMillis(value) {
    if (!(value instanceof Date)) {
        return null;
    }
    const millis = value.getTime();
    return Number.isNaN(millis) ? null : millis;
}

function extractRateLimitSnapshot(data, headers) {
    const coreRateLimit = data?.resources?.core ?? data?.rate ?? null;
    const limit = parseOptionalInt(
        coreRateLimit?.limit ?? headers.get('x-ratelimit-limit'),
    );
    const remaining = parseOptionalInt(
        coreRateLimit?.remaining ?? headers.get('x-ratelimit-remaining'),
    );
    const used = parseOptionalInt(
        coreRateLimit?.used ?? headers.get('x-ratelimit-used'),
    );
    const reset =
        toDateFromEpochSeconds(
            coreRateLimit?.reset ?? headers.get('x-ratelimit-reset'),
        ) ?? null;
    const resource =
        coreRateLimit?.resource ?? headers.get('x-ratelimit-resource') ?? null;

    if (
        limit === null &&
        remaining === null &&
        used === null &&
        reset === null &&
        resource === null
    ) {
        return null;
    }

    return {
        limit,
        remaining,
        used,
        reset,
        resource,
    };
}

function mergeRateLimitSnapshot(current, next) {
    if (!next) {
        return current;
    }
    if (!current) {
        return next;
    }

    const currentResetMillis = dateToMillis(current.reset);
    const nextResetMillis = dateToMillis(next.reset);
    if (
        currentResetMillis !== null &&
        nextResetMillis !== null &&
        nextResetMillis > currentResetMillis
    ) {
        return next;
    }
    if (
        currentResetMillis !== null &&
        nextResetMillis !== null &&
        nextResetMillis < currentResetMillis
    ) {
        return current;
    }

    return {
        limit: next.limit ?? current.limit,
        remaining:
            typeof next.remaining === 'number' &&
            typeof current.remaining === 'number'
                ? Math.min(current.remaining, next.remaining)
                : (next.remaining ?? current.remaining),
        used:
            typeof next.used === 'number' && typeof current.used === 'number'
                ? Math.max(current.used, next.used)
                : (next.used ?? current.used),
        reset: next.reset ?? current.reset,
        resource: next.resource ?? current.resource,
    };
}

function updateRateLimitState(nextSnapshot, responseStatus) {
    const previousSnapshot = apiState.current.ratelimit;
    const mergedSnapshot = mergeRateLimitSnapshot(
        previousSnapshot,
        nextSnapshot,
    );

    if (mergedSnapshot) {
        apiState.current.ratelimit = mergedSnapshot;
    }

    const previousResetMillis = dateToMillis(previousSnapshot?.reset);
    const mergedResetMillis = dateToMillis(mergedSnapshot?.reset);
    const movedToNewWindow =
        previousResetMillis !== null &&
        mergedResetMillis !== null &&
        mergedResetMillis > previousResetMillis;

    const isExplicitHit =
        responseStatus === 403 && nextSnapshot?.remaining === 0;
    const isMergedHit = mergedSnapshot?.remaining === 0;

    if (apiState.current.hasHitRateLimit && movedToNewWindow && !isMergedHit) {
        apiState.current.hasHitRateLimit = false;
    }
    if (isExplicitHit || isMergedHit) {
        apiState.current.hasHitRateLimit = true;
    }
}

export async function queryGithubApi(apiURL) {
    console.log(`Querying GitHub API: ${apiURL}`);
    const headers = {
        Accept: 'application/vnd.github+json',
    };
    if (apiState.current.token) {
        headers.Authorization = `Bearer ${apiState.current.token}`;
    }
    const response = await fetch(apiURL, { headers });
    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }
    const rateLimitSnapshot = extractRateLimitSnapshot(data, response.headers);
    updateRateLimitState(rateLimitSnapshot, response.status);
    return {
        ok: response.ok,
        status: response.status,
        data,
        headers: response.headers,
    };
}

export async function authenticate() {}
