import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit, EXIT } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import { formatDistanceToNow } from 'date-fns';

class Repository {
    constructor(url, name, path) {
        this.url = url;
        this.name = name;
        this.path = path;

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

        this.fetched = true;
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

function formatDate(date) {
    if (!date) {
        return '';
    }
    return formatDistanceToNow(date, { addSuffix: true });
}

function parseMarkdown(markdownText) {
    const mdast = fromMarkdown(markdownText, {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
    });
    return mdast;
}

async function queryGithubApi(apiURL) {
    console.log(`Querying GitHub API: ${apiURL}`);
    return await (await fetch(apiURL)).json();
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
    console.log(`Fetching awesome list from: ${repoPath}`);
    const response = await fetch(
        `https://raw.githubusercontent.com${repoPath}/main/README.md`,
    );
    if (!response.ok) {
        throw {
            repoUrl: `https://github.com${repoPath}`,
            repoPath,
        };
    }
    return await response.text();
}

function parseAwesomeList(markdownAST) {
    const parsedAwesomeList = [];
    let currentSection = { repos: [] };
    let appendSection = () => {
        if (currentSection.repos.length > 0) {
            parseAwesomeList.push(currentSection);
        }
        currentSection = {
            heading: toString(node),
            repos: [],
        };
    };
    visit(markdownAST, node => {
        if (node.type == 'heading') {
            appendSection();
        } else if (node.type == 'listItem') {
            let link = null;
            visit(node, child => {
                if (
                    child.type == 'link' &&
                    URL.parse(child.url)?.hostname == 'github.com'
                ) {
                    link = child;
                    return EXIT;
                }
            });
            if (link !== null) {
                currentSection.repos.push(
                    {
                        url: link.url,
                        name: toString(link),
                        path: URL.parse(link.url).pathname,
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
