import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { rehype } from 'rehype';
import { queryGithubApi } from './github.svelte.js';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { visit, EXIT, CONTINUE } from 'unist-util-visit';

class Repository {
    constructor(url) {
        this.url = url;
        this.name = this.url.pathname.split('/')[2];
        this.author = this.url.pathname.split('/')[1];
        this.path = this.url.pathname.split('/').slice(0, 3).join('/');

        this.stars = null;
        this.createdAt = null;
        this.archived = null;
        this.openIssues = null;
        this.updatedAt = null;
    }

    get fetched() {
        return !!this.stars;
    }

    async fetch() {
        if (this.fetched) {
            return;
        }
        const repoInfo = await fetchRepoInformation(this.path);
        this.stars = repoInfo.stars;
        this.createdAt = repoInfo.created_at;
        this.archived = repoInfo.archived;
        this.openIssues = repoInfo.open_issues;
        this.updatedAt = repoInfo.updated_at;
    }
}

class Section {
    constructor(heading, repos) {
        this.heading = heading;
        this.repos = repos;
    }

    get fetched() {
        return this.repos.every(repo => repo.fetched);
    }

    async fetch() {
        await Promise.all(this.repos.map(repo => repo.fetch()));
    }
}

export class HowAwesomeError extends Error {
    constructor(message, repoPath) {
        super(message);
        this.repoPath = repoPath;
    }

    get repoUrl() {
        return `https://github.com${this.repoPath}`;
    }
}

export async function fetchRepoInformation(repoPath) {
    const response = await queryGithubApi(
        `https://api.github.com/repos${repoPath}`,
    );
    if (!response.ok) {
        const error = new Error(
            response?.data?.message ?? `GitHub API error (${response.status})`,
        );
        error.status = response.status;
        error.rateLimitRemaining = response.headers?.get?.(
            'x-ratelimit-remaining',
        );
        throw error;
    }
    return {
        stars: response?.data?.stargazers_count ?? null,
        created_at: response?.data?.created_at
            ? new Date(response.data.created_at)
            : null,
        archived: response?.data?.archived ?? null,
        open_issues: response?.data?.open_issues_count ?? null,
        updated_at: response?.data?.updated_at
            ? new Date(response.data.updated_at)
            : null,
    };
}

export async function fetchAwesomeList(repoPath) {
    for (const readmeFilename of ['README.md', 'readme.md']) {
        const url = `https://raw.githubusercontent.com${repoPath}/main/${readmeFilename}`;
        const response = await fetch(url);
        if (!response.ok) {
            continue;
        }
        return await response.text();
    }
    throw new HowAwesomeError(`Failed to fetch README.md`, repoPath);
}

export async function processAwesomeList(repoURL) {
    const repoReadme = await fetchAwesomeList(repoURL);
    const parsedAwesomeList = annotateAwesomeAST(repoReadme, repoURL);
    return parsedAwesomeList;
}

export function transformLinkNode(linkNode) {
    const parsedRepoUrl = URL.parse(linkNode.url);
    parsedRepoUrl.hash = '';
    parsedRepoUrl.search = '';
    parsedRepoUrl.query = '';

    linkNode.repoPath = parsedRepoUrl.pathname;
    linkNode.repoUrl = `https://github.com${parsedRepoUrl.pathname}`;
    linkNode.type = 'awesomeLink';
}

export function annotateAwesomeAST(markdownText, repoURL) {
    const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(() => tree => {
            visit(tree, node => {
                if (node === undefined || node === null) {
                    return;
                }
                if (node.type == 'heading') {
                    node.type = 'awesomeSection';
                } else if (node.type == 'listItem') {
                    let link = null;
                    visit(node, child => {
                        if (child.type !== 'link') {
                            return CONTINUE;
                        }
                        const parsedUrl = URL.parse(child.url);
                        if (
                            parsedUrl?.hostname == 'github.com' &&
                            !parsedUrl?.pathname?.startsWith(repoURL) &&
                            parsedUrl.pathname !== '/'
                        ) {
                            link = child;
                            return EXIT;
                        }
                    });
                    if (link !== null) {
                        transformLinkNode(link);
                    }
                }
            });
        })
        .use(remarkRehype, {
            handlers: {
                awesomeLink(state, node, parent) {
                    const hastNode = state.one(
                        Object.assign({}, node, {
                            type: 'link',
                        }),
                        parent,
                    );
                    hastNode.properties = hastNode.properties ?? {};
                    hastNode.properties.className = 'awesome-link';
                    hastNode.properties['data-repo-path'] = node.repoPath;
                    hastNode.properties['data-repo-url'] = node.repoUrl;
                    return hastNode;
                },
                awesomeSection(state, node, parent) {
                    const hastNode = state.one(
                        Object.assign({}, node, {
                            type: 'heading',
                        }),
                        parent,
                    );
                    hastNode.properties = hastNode.properties ?? {};
                    hastNode.properties.className = 'awesome-section';
                    return hastNode;
                },
            },
        })
        .use(rehypeSlug)
        .use(rehypeStringify);

    const result = processor.processSync(markdownText);

    return String(result);
}
