import * as devalue from 'devalue';
import { persistedState } from 'svelte-persisted-state';

function createInitialRepoState() {
    return {
        status: 'idle',
        info: null,
        error: null,
    };
}

const repoCache = persistedState('repo-cache-v1', {}, {
    storage: 'session',
    serializer: {
        stringify: devalue.stringify,
        parse: devalue.parse,
    },
});

function getRepoState(repoPath) {
    return repoCache.current[repoPath] ?? createInitialRepoState();
}

function setRepoState(repoPath, nextState) {
    repoCache.current = {
        ...repoCache.current,
        [repoPath]: nextState,
    };
}

function updateRepoState(repoPath, updater) {
    setRepoState(repoPath, updater(getRepoState(repoPath)));
}

function clearRepoState(repoPath) {
    if (!(repoPath in repoCache.current)) return;
    const { [repoPath]: _removed, ...nextState } = repoCache.current;
    repoCache.current = nextState;
}

const repoStateViewByPath = new Map();

export function repoStateFor(repoPath) {
    if (repoStateViewByPath.has(repoPath)) {
        return repoStateViewByPath.get(repoPath);
    }

    const repoStateView = {
        get state() {
            return getRepoState(repoPath);
        },
        set state(nextState) {
            setRepoState(repoPath, nextState);
        },
        get status() {
            return getRepoState(repoPath).status;
        },
        set status(status) {
            updateRepoState(repoPath, state => ({ ...state, status }));
        },
        get info() {
            return getRepoState(repoPath).info;
        },
        set info(info) {
            updateRepoState(repoPath, state => ({ ...state, info }));
        },
        get error() {
            return getRepoState(repoPath).error;
        },
        set error(error) {
            updateRepoState(repoPath, state => ({ ...state, error }));
        },
        reset() {
            clearRepoState(repoPath);
        },
    };

    repoStateViewByPath.set(repoPath, repoStateView);
    return repoStateView;
}
