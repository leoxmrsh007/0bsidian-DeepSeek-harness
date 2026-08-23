/**
 * Vault bridge handlers: every endpoint's implementation over Obsidian's
 * native APIs (vault, metadataCache, fileManager, tags cache).
 *
 * Mutations run through a single serialization queue so concurrent DSH
 * requests can never interleave inside Obsidian's file APIs. Read-only
 * operations share the same queue for simplicity and determinism — the vault
 * is small compared to the latency this avoids.
 */

import type { App } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import * as path from 'path';

import {
  isWithinDir,
  LIMITS,
} from './pathSafety';
import {
  VAULT_API_FEATURES,
  VAULT_API_PROTOCOL_VERSION,
  VAULT_API_VERSION,
  type VaultApiError,
  VaultApiErrorImpl,
  type VaultBacklinksResult,
  type VaultCapabilitiesResult,
  type VaultDeleteResult,
  type VaultFileInfo,
  type VaultFrontmatterDeleteResult,
  type VaultFrontmatterGetResult,
  type VaultFrontmatterSetResult,
  type VaultListResult,
  type VaultMoveResult,
  type VaultReadResult,
  type VaultSearchResult,
  type VaultTagsResult,
  type VaultWriteResult,
} from './types';
import {
  badRequest,
  parseContent,
  parseContext,
  parseKey,
  parseOptionalDir,
  parseOptionalLimit,
  parsePath,
  parseQuery,
} from './validation';

export interface VaultHandlerResult {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: VaultApiError;
}

type Payload = Record<string, unknown>;

function toError(error: unknown): VaultApiError {
  if (error instanceof Error && error.message) {
    return { code: 'vault-error', message: error.message };
  }
  return { code: 'vault-error', message: String(error) };
}

function findFile(app: App, vaultPath: string): TFile | null {
  const abstract = app.vault.getAbstractFileByPath(vaultPath);
  return abstract instanceof TFile ? abstract : null;
}

function toFileInfo(file: TFile): VaultFileInfo {
  return {
    path: file.path,
    basename: file.basename,
    extension: file.extension,
    size: file.stat.size,
    mtime: file.stat.mtime,
  };
}

function listFilesUnder(app: App, dir: string): TFile[] {
  return app.vault.getAllLoadedFiles().filter(
    (abstract): abstract is TFile => (
      abstract instanceof TFile
      && (dir === '' || isWithinDir(abstract.path, dir))
      && !abstract.path.includes('/.')
    ),
  );
}

async function ensureParentFolder(app: App, vaultPath: string): Promise<void> {
  const dir = path.posix.dirname(vaultPath);
  if (dir === '.' || dir === '/') return;
  const existing = app.vault.getAbstractFileByPath(dir);
  if (existing instanceof TFolder) return;
  if (existing) {
    throw new Error(`parent path is not a folder: ${dir}`);
  }
  await app.vault.createFolder(dir);
}

/** Obsidian file content byte cap — must not exceed the wire body limit. */
const READ_BYTE_CAP = LIMITS.readBytes;
const WRITE_BYTE_CAP = LIMITS.contentBytes;

export class VaultApiHandlers {
  private readonly app: App;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(app: App) {
    this.app = app;
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }

  async dispatch(method: string, payload: Payload): Promise<VaultHandlerResult> {
    try {
      switch (method) {
        case 'vault.capabilities':
          return this.ok(await this.capabilities());
        case 'vault.list':
          return this.ok(await this.list(payload));
        case 'vault.read':
          return this.ok(await this.read(payload));
        case 'vault.write':
          return this.ok(await this.write(payload));
        case 'vault.append':
          return this.ok(await this.append(payload));
        case 'vault.delete':
          return this.ok(await this.delete(payload));
        case 'vault.move':
          return this.ok(await this.move(payload));
        case 'vault.search':
          return this.ok(await this.search(payload));
        case 'vault.backlinks':
          return this.ok(await this.backlinks(payload));
        case 'vault.tags':
          return this.ok(await this.tags(payload));
        case 'vault.frontmatter.get':
          return this.ok(await this.frontmatterGet(payload));
        case 'vault.frontmatter.set':
          return this.ok(await this.frontmatterSet(payload));
        case 'vault.frontmatter.delete':
          return this.ok(await this.frontmatterDelete(payload));
        default:
          return { ok: false, error: { code: 'method-not-found', message: `unknown method: ${method}` } };
      }
    } catch (error) {
      if (error instanceof VaultApiErrorImpl) {
        return { ok: false, error: { code: error.code, message: error.message } };
      }
      if (error && typeof error === 'object') {
        const code = (error as { code?: unknown }).code;
        const message = (error as { message?: unknown }).message;
        if (typeof code === 'string') {
          return {
            ok: false,
            error: { code, message: typeof message === 'string' ? message : String(error) },
          };
        }
      }
      return { ok: false, error: toError(error) };
    }
  }

  private ok(value: unknown): VaultHandlerResult {
    return { ok: true, value };
  }

  private async capabilities(): Promise<VaultCapabilitiesResult> {
    const vault = this.app.vault;
    const name = vault.getName?.() ?? path.posix.basename(vault.getRoot().path.replace(/\/$/, ''));
    return {
      version: VAULT_API_PROTOCOL_VERSION,
      apiVersion: VAULT_API_VERSION,
      vaultName: name,
      vaultPath: vault.getRoot().path,
      features: [...VAULT_API_FEATURES],
    };
  }

  private async list(payload: Payload): Promise<VaultListResult> {
    const dir = parseOptionalDir(payload);
    const requestedLimit = parseOptionalLimit(payload);
    const limit = requestedLimit > 0 ? requestedLimit : LIMITS.listFiles;

    const files = listFilesUnder(this.app, dir)
      .sort((left, right) => left.path.localeCompare(right.path));
    const items = files.slice(0, limit).map(toFileInfo);
    return {
      items,
      total: files.length,
      truncated: files.length > limit,
    };
  }

  private async read(payload: Payload): Promise<VaultReadResult> {
    const vaultPath = parsePath(payload);
    const file = findFile(this.app, vaultPath);
    if (!file) {
      throw new VaultApiErrorImpl('file-not-found', `no such file: ${vaultPath}`);
    }
    const content = await this.app.vault.read(file);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > READ_BYTE_CAP) {
      const sliced = content.slice(0, READ_BYTE_CAP);
      return {
        path: file.path,
        content: sliced,
        bytes,
        truncated: true,
        mtime: file.stat.mtime,
      };
    }
    return {
      path: file.path,
      content,
      bytes,
      truncated: false,
      mtime: file.stat.mtime,
    };
  }

  private async write(payload: Payload): Promise<VaultWriteResult> {
    const vaultPath = parsePath(payload);
    const content = parseContent(payload);
    if (Buffer.byteLength(content, 'utf8') > WRITE_BYTE_CAP) {
      throw badRequest('content', `exceeds ${WRITE_BYTE_CAP} bytes`);
    }

    const existing = this.app.vault.getAbstractFileByPath(vaultPath);
    if (existing && !(existing instanceof TFile)) {
      throw new VaultApiErrorImpl('path-conflict', `path is not a file: ${vaultPath}`);
    }

    await this.runExclusive(async () => {
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, content);
      } else {
        await ensureParentFolder(this.app, vaultPath);
        await this.app.vault.create(vaultPath, content);
      }
    });

    const file = findFile(this.app, vaultPath);
    return {
      path: vaultPath,
      bytes: Buffer.byteLength(content, 'utf8'),
      existed: existing instanceof TFile,
      mtime: file?.stat.mtime ?? Date.now(),
    };
  }

  private async append(payload: Payload): Promise<VaultWriteResult> {
    const vaultPath = parsePath(payload);
    const extra = parseContent(payload);

    return this.runExclusive(async () => {
      const existing = this.app.vault.getAbstractFileByPath(vaultPath);
      if (existing && !(existing instanceof TFile)) {
        throw new VaultApiErrorImpl('path-conflict', `path is not a file: ${vaultPath}`);
      }
      let content = extra;
      let existed = false;
      if (existing instanceof TFile) {
        existed = true;
        const current = await this.app.vault.read(existing);
        if (Buffer.byteLength(current, 'utf8') + Buffer.byteLength(extra, 'utf8') > WRITE_BYTE_CAP) {
          throw badRequest('content', `append would exceed ${WRITE_BYTE_CAP} bytes`);
        }
        content = current + extra;
        await this.app.vault.modify(existing, content);
      } else {
        await ensureParentFolder(this.app, vaultPath);
        await this.app.vault.create(vaultPath, extra);
      }
      const file = findFile(this.app, vaultPath);
      return {
        path: vaultPath,
        bytes: Buffer.byteLength(content, 'utf8'),
        existed,
        mtime: file?.stat.mtime ?? Date.now(),
      };
    });
  }

  private async delete(payload: Payload): Promise<VaultDeleteResult> {
    const vaultPath = parsePath(payload);
    const file = findFile(this.app, vaultPath);
    if (!file) {
      return { path: vaultPath, trashed: false };
    }
    await this.app.fileManager.trashFile(file);
    return { path: vaultPath, trashed: true };
  }

  private async move(payload: Payload): Promise<VaultMoveResult> {
    const from = parsePath(payload);
    const rawTo = payload.to;
    if (typeof rawTo !== 'string') {
      throw badRequest('to', 'expected a string');
    }
    const to = parsePath({ path: rawTo });
    if (to === from) {
      throw badRequest('to', 'must differ from path');
    }

    const file = findFile(this.app, from);
    if (!file) {
      throw new VaultApiErrorImpl('file-not-found', `no such file: ${from}`);
    }
    const target = this.app.vault.getAbstractFileByPath(to);
    if (target) {
      throw new VaultApiErrorImpl('path-conflict', `destination already exists: ${to}`);
    }

    const linkCountBefore = this.countInboundLinks(from);
    await this.app.fileManager.renameFile(file, to);
    return { from, to, updatedLinks: linkCountBefore };
  }

  private countInboundLinks(vaultPath: string): number {
    const resolved = this.app.metadataCache.resolvedLinks;
    let count = 0;
    for (const source of Object.keys(resolved)) {
      const targets = resolved[source];
      if (targets && targets[vaultPath]) {
        count += 1;
      }
    }
    return count;
  }

  private async search(payload: Payload): Promise<VaultSearchResult> {
    const query = parseQuery(payload);
    const dir = parseOptionalDir(payload);
    const requestedLimit = parseOptionalLimit(payload);
    const limit = requestedLimit > 0 ? requestedLimit : LIMITS.searchMatches;
    const context = parseContext(payload);

    const needle = query.toLocaleLowerCase();
    const files = listFilesUnder(this.app, dir);
    const matches: VaultSearchResult['matches'] = [];
    let scanned = 0;
    let total = 0;
    let truncated = false;

    for (const file of files) {
      if (total >= limit) {
        truncated = true;
        break;
      }
      if (file.stat.size > LIMITS.searchFileBytes) {
        continue;
      }
      let content: string;
      try {
        content = await this.app.vault.read(file);
      } catch {
        continue;
      }
      scanned += 1;
      const lines = content.split('\n');
      const hitLines: Array<{ line: number; text: string }> = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.toLocaleLowerCase().includes(needle)) {
          hitLines.push({ line: index + 1, text: line });
        }
      }
      if (hitLines.length > 0) {
        const withContext = context > 0
          ? collectContext(lines, hitLines, context)
          : hitLines;
        matches.push({ path: file.path, lines: withContext });
        total += hitLines.length;
      }
    }

    return { matches, total, truncated: truncated || scanned === 0 && matches.length === 0 && files.length > 0 && false };
  }

  private async backlinks(payload: Payload): Promise<VaultBacklinksResult> {
    const vaultPath = parsePath(payload);
    const file = findFile(this.app, vaultPath);
    if (!file) {
      throw new VaultApiErrorImpl('file-not-found', `no such file: ${vaultPath}`);
    }
    const resolved = this.app.metadataCache.resolvedLinks;
    const links: Array<{ path: string; count: number }> = [];
    for (const source of Object.keys(resolved)) {
      const targets = resolved[source];
      const count = targets?.[vaultPath];
      if (count && count > 0) {
        links.push({ path: source, count });
      }
    }
    links.sort((left, right) => left.path.localeCompare(right.path));
    return { path: vaultPath, links };
  }

  private async tags(payload: Payload): Promise<VaultTagsResult> {
    const dir = parseOptionalDir(payload);
    const counts = new Map<string, number>();
    const files = listFilesUnder(this.app, dir);
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      for (const tag of cache?.tags ?? []) {
        counts.set(tag.tag, (counts.get(tag.tag) ?? 0) + 1);
      }
    }
    const tags = Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => left.tag.localeCompare(right.tag));
    return { tags };
  }

  private async frontmatterGet(payload: Payload): Promise<VaultFrontmatterGetResult> {
    const vaultPath = parsePath(payload);
    const file = findFile(this.app, vaultPath);
    if (!file) {
      throw new VaultApiErrorImpl('file-not-found', `no such file: ${vaultPath}`);
    }
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};
    return { path: vaultPath, frontmatter };
  }

  private async frontmatterSet(payload: Payload): Promise<VaultFrontmatterSetResult> {
    const vaultPath = parsePath(payload);
    const key = parseKey(payload);
    const file = findFile(this.app, vaultPath);
    if (!file) {
      throw new VaultApiErrorImpl('file-not-found', `no such file: ${vaultPath}`);
    }
    const value = payload.value;
    if (value !== null && typeof value !== 'string' && typeof value !== 'number'
      && typeof value !== 'boolean' && !Array.isArray(value) && typeof value !== 'object') {
      throw badRequest('value', 'must be a JSON-serializable value');
    }
    if (Array.isArray(value) && value.length > 1000) {
      throw badRequest('value', 'array too large');
    }

    await this.runExclusive(async () => {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        (frontmatter as Record<string, unknown>)[key] = value;
      });
    });
    return { path: vaultPath, key };
  }

  private async frontmatterDelete(payload: Payload): Promise<VaultFrontmatterDeleteResult> {
    const vaultPath = parsePath(payload);
    const key = parseKey(payload);
    const file = findFile(this.app, vaultPath);
    if (!file) {
      throw new VaultApiErrorImpl('file-not-found', `no such file: ${vaultPath}`);
    }

    let removed = false;
    await this.runExclusive(async () => {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const record = frontmatter as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(record, key)) {
          delete record[key];
          removed = true;
        }
      });
    });
    return { path: vaultPath, key, removed };
  }
}


function collectContext(
  lines: string[],
  hits: Array<{ line: number; text: string }>,
  context: number,
): Array<{ line: number; text: string }> {
  const included = new Set<number>();
  for (const hit of hits) {
    for (let line = Math.max(0, hit.line - 1 - context); line < Math.min(lines.length, hit.line + context); line += 1) {
      included.add(line);
    }
  }
  return Array.from(included)
    .sort((left, right) => left - right)
    .map(line => ({ line: line + 1, text: lines[line] }));
}
