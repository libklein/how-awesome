import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit, EXIT, CONTINUE } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import { queryGithubApi } from './github.svelte.js';
import { toHtml } from 'hast-util-to-html';
import { toHast } from 'mdast-util-to-hast';

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

export function parseMarkdown(markdownText) {
    const mdast = fromMarkdown(markdownText, {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
    });
    return mdast;
}

async function fetchRepoInformation(repoPath) {
    return {
        stars: 0,
        created_at: new Date('2025-06-17T12:21:45Z'),
        archived: false,
        open_issues: 0,
        updated_at: new Date('2025-07-24T16:53:31Z'),
    };
    const response = queryGithubApi(`https://api.github.com/repos${repoPath}`);
    return {
        stars: response?.starquazers_count,
        created_at: response?.created_at,
        archived: response?.archived,
        open_issues: response?.open_issues_count,
        updated_at: response?.updated_at,
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

function parseAwesomeList(markdownAST) {
    const parsedAwesomeList = [];
    let currentSection = { repos: [] };
    let appendSection = () => {
        if (currentSection.repos.length > 0) {
            parsedAwesomeList.push(currentSection);
        }
    };
    visit(markdownAST, node => {
        if (node === undefined || node === null) {
            return;
        }
        if (node.type == 'heading') {
            appendSection();
            currentSection = {
                heading: toString(node),
                repos: [],
            };
        } else if (node.type == 'listItem') {
            let link = null;
            visit(node, child => {
                if (
                    child.type == 'link' &&
                    URL.parse(child.url)?.hostname == 'github.com' &&
                    link === null
                ) {
                    link = child;
                }
            });
            if (link !== null) {
                currentSection.repos.push(
                    {
                        url: link.url,
                        name: toString(link),
                        path: URL.parse(link.url).pathname,
                        description: toString(node).replace(toString(link), ''),
                    },
                    /*new Repository(
                        link.url,
                        toString(link),
                        URL.parse(link.url).pathname,
                    ),*/
                );
            }
        }
    });
    appendSection();
    return parsedAwesomeList;
}

export async function processAwesomeList(repoURL) {
    const repoReadme = await fetchAwesomeList(repoURL);
    console.log(`Fetched README from ${repoURL}`);
    console.log(repoReadme);
    const parsedAwesomeList = parseAwesomeList(parseMarkdown(repoReadme));
    console.log(parsedAwesomeList);
    return parsedAwesomeList;
}

export function transformLinkNode(linkNode) {
    const parsedRepoUrl = URL.parse(linkNode.url);
    parsedRepoUrl.hash = '';
    parsedRepoUrl.search = '';
    parsedRepoUrl.query = '';

    linkNode.repo = new Repository(parsedRepoUrl);
    linkNode.type = 'awesomeLink';
}

export function annotateAwesomeAST(markdownAST, repoURL) {
    // Transform the AST in-place
    // TODO: Replace with map?
    visit(markdownAST, node => {
        if (node === undefined || node === null) {
            return;
        }
        if (node.type == 'heading') {
            // Do nothing for now - keep track of these later and annotate with
            // buttons
        } else if (node.type == 'listItem') {
            // Discover link
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

    const hast = toHast(markdownAST, {
        handlers: {
            awesomeLink(h, node) {
                console.log('Transforming awesomeLink node:', node);
                return {
                    type: 'element',
                    tagName: 'a',
                    properties: {
                        href: node.url,
                        className: 'awesome-link',
                        // TODO: Transform to data properties
                        repo: JSON.stringify(node.repo),
                    },
                    children: h.all(node),
                };
            },
        },
    });

    const html = toHtml(hast);
    console.log('Generated HTML:', html);
}
