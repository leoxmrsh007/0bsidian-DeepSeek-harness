/**
 * Auto-link note titles, aliases, and paths inside assistant markdown.
 *
 * Ported from the DeepHarness plugin (`src/linkify.ts`, MIT) and adapted to
 * this codebase. It is Obsidian-free: callers pass in a flat list of notes and
 * receive a list of title entries, then feed those entries to
 * {@link linkifyNoteTitles} before rendering markdown.
 *
 * Protected regions are never touched: fenced/inline code, existing
 * `[[wikilinks]]`, `[markdown](links)`, images, HTML tags, and bare URLs.
 */

export interface NoteInfo {
  /** File basename without extension. */
  name: string;
  /** Vault-relative path WITHOUT the `.md` extension. */
  path: string;
  /** Frontmatter aliases (optional). */
  aliases?: string[];
}

export interface NoteTitleEntry {
  /** Exact substring to match (longest entries win). */
  match: string;
  /** Replacement wikilink body, e.g. `[[note]]` or `[[folder/note|note]]`. */
  link: string;
}

/** Titles shorter than this are too noisy to auto-link. */
export const MIN_TITLE_LENGTH = 2;
/** Hard cap so the match regex stays sane. */
export const MAX_TITLE_LENGTH = 120;
/** Upper bound on entries fed into the alternation regex, to avoid a regex that is too large. */
const MAX_ENTRIES = 2000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build deduped, longest-first title entries from vault notes.
 *
 * Each note contributes its basename, its vault-relative path (with and
 * without the `.md` extension), and its aliases. When several notes share the
 * same match string (duplicate basenames), the entry links through the
 * explicit path so Obsidian resolves deterministically.
 */
export function buildTitleEntries(notes: NoteInfo[]): NoteTitleEntry[] {
  const counts = new Map<string, number>();
  const raw: Array<{ match: string; name: string; path: string; target: string }> = [];

  for (const note of notes) {
    const push = (match: string): void => {
      const trimmed = match.trim();
      if (!trimmed || trimmed.length < MIN_TITLE_LENGTH || trimmed.length > MAX_TITLE_LENGTH) {
        return;
      }
      raw.push({
        match: trimmed,
        name: note.name,
        path: note.path,
        target: trimmed === note.path || trimmed === `${note.path}.md`
          ? note.path
          : trimmed,
      });
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    };

    push(note.name);
    push(note.path);
    push(`${note.path}.md`);
    for (const alias of note.aliases ?? []) {
      push(alias);
    }
  }

  const entries: NoteTitleEntry[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (seen.has(entry.match)) {
      continue;
    }
    seen.add(entry.match);
    const duplicate = (counts.get(entry.match) ?? 0) > 1;
    entries.push({
      match: entry.match,
      link: duplicate ? `[[${entry.path}|${entry.name}]]` : `[[${entry.target}]]`,
    });
  }

  return entries.sort((a, b) => b.match.length - a.match.length);
}

/** Regions inside a line that must never be linkified. */
const PROTECTED =
  /(`[^`\n]*`)|(\[\[[^\]\n]*\]\])|(!?\[[^\]\n]*\]\([^)\n]*\))|(<[^>\n]*>)|(https?:\/\/[^\s)\]}>]+)/g;

/**
 * Wrap title matches in `text` with wikilinks.
 * Returns the input unchanged when there is nothing to link.
 */
export function linkifyNoteTitles(text: string, entries: NoteTitleEntry[]): string {
  if (!text || entries.length === 0) {
    return text;
  }

  const sorted = [...entries]
    .sort((a, b) => b.match.length - a.match.length)
    .slice(0, MAX_ENTRIES);
  const linkByMatch = new Map(sorted.map((entry) => [entry.match, entry.link]));
  // Longest-first alternation: at any position the longest matching title wins.
  const regex = new RegExp(sorted.map((entry) => escapeRegExp(entry.match)).join('|'), 'g');

  const lines = text.split('\n');
  const output: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }
    output.push(inFence ? line : linkifyLine(line, regex, linkByMatch));
  }
  return output.join('\n');
}

function linkifyLine(
  line: string,
  regex: RegExp,
  linkByMatch: Map<string, string>,
): string {
  let result = '';
  let last = 0;
  PROTECTED.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROTECTED.exec(line)) !== null) {
    result += linkifyPlain(line.slice(last, match.index), regex, linkByMatch);
    result += match[0];
    last = match.index + match[0].length;
  }
  result += linkifyPlain(line.slice(last), regex, linkByMatch);
  return result;
}

function linkifyPlain(
  plain: string,
  regex: RegExp,
  linkByMatch: Map<string, string>,
): string {
  if (!plain) {
    return '';
  }
  return plain.replace(regex, (matched) => linkByMatch.get(matched) ?? matched);
}
