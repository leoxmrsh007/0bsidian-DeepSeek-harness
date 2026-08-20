import {
  buildTitleEntries,
  linkifyNoteTitles,
  type NoteInfo,
} from '../../../src/utils/noteLinkify';

describe('buildTitleEntries', () => {
  it('adds basename, path, path.md, and aliases for each note', () => {
    const notes: NoteInfo[] = [
      { name: 'Project', path: 'Projects/Project', aliases: ['Prj'] },
    ];

    const entries = buildTitleEntries(notes);
    const links = new Map(entries.map((entry) => [entry.match, entry.link]));

    expect(links.get('Project')).toBe('[[Project]]');
    expect(links.get('Projects/Project')).toBe('[[Projects/Project]]');
    expect(links.get('Projects/Project.md')).toBe('[[Projects/Project]]');
    expect(links.get('Prj')).toBe('[[Prj]]');
  });

  it('sorts longest-first and disambiguates duplicate basenames via path', () => {
    const notes: NoteInfo[] = [
      { name: 'Note', path: 'A/Note' },
      { name: 'Note', path: 'B/Note' },
      { name: 'Unique Long Title', path: 'Unique Long Title' },
    ];

    const entries = buildTitleEntries(notes);
    const matches = entries.map((entry) => entry.match);
    const sortedByLength = [...matches].sort((a, b) => b.length - a.length);
    expect(matches).toEqual(sortedByLength);

    const noteEntry = entries.find((entry) => entry.match === 'Note');
    expect(noteEntry?.link).toBe('[[A/Note|Note]]');
  });

  it('drops titles that are too short or too long', () => {
    const notes: NoteInfo[] = [
      { name: 'x', path: 'x' },
      { name: 'a'.repeat(200), path: 'a'.repeat(200) },
      { name: 'Valid', path: 'Valid' },
    ];

    const entries = buildTitleEntries(notes);
    expect(entries.some((entry) => entry.match === 'Valid')).toBe(true);
    expect(entries.some((entry) => entry.match === 'x')).toBe(false);
    expect(entries.some((entry) => entry.match === 'a'.repeat(200))).toBe(false);
  });
});

describe('linkifyNoteTitles', () => {
  const entries = buildTitleEntries([
    { name: 'Project', path: 'Projects/Project', aliases: ['Prj'] },
    { name: 'Project Alpha', path: 'Projects/Project Alpha' },
  ]);

  it('wraps plain-text title mentions in wikilinks', () => {
    expect(linkifyNoteTitles('See Project and Prj today.', entries))
      .toBe('See [[Project]] and [[Prj]] today.');
  });

  it('lets the longest match win', () => {
    expect(linkifyNoteTitles('Project Alpha is here.', entries))
      .toBe('[[Project Alpha]] is here.');
  });

  it('never touches code, existing links, images, or URLs', () => {
    const input = [
      '`Project` inline code',
      '[[Project]] existing wikilink',
      '[Project](https://example.com) markdown link',
      '![Project](img.png) image',
      'https://example.com/Project url',
      'Project plain',
    ].join('\n');

    const output = linkifyNoteTitles(input, entries);
    expect(output).toContain('`Project` inline code');
    expect(output).toContain('[[Project]] existing wikilink');
    expect(output).toContain('[Project](https://example.com) markdown link');
    expect(output).toContain('![Project](img.png) image');
    expect(output).toContain('https://example.com/Project url');
    expect(output).toContain('[[Project]] plain');
  });

  it('preserves HTML tag markup while linkifying inner text', () => {
    expect(linkifyNoteTitles('<span>Project</span>', entries))
      .toBe('<span>[[Project]]</span>');
  });

  it('skips fenced code blocks entirely', () => {
    const input = '```\nProject inside a fence\n```\nProject outside';
    expect(linkifyNoteTitles(input, entries))
      .toBe('```\nProject inside a fence\n```\n[[Project]] outside');
  });

  it('returns input unchanged when there are no entries', () => {
    expect(linkifyNoteTitles('Project', [])).toBe('Project');
  });
});
