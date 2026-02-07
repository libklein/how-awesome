import { parseMarkdown, annotateAwesomeAST } from '$lib/how-awesome';
import { expect, test } from 'vitest';

test('Annotates awesome AST', async () => {
    const repoUrl = 'https://github.com/Strift/awesome-esports';
    const awesomeList = await (
        await fetch(`${repoUrl}/raw/refs/heads/main/README.md`)
    ).text();

    annotateAwesomeAST(awesomeList, repoUrl);
});

// TODO:
// * Links to self should not be annotated
// * Only first link in list should be annotated
// * Links outside lists should not be annotated
