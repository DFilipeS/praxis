import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  hashContent,
  hashFile,
  readManifest,
  writeManifest,
  isLocallyModified,
} from '../src/manifest.js';

describe('hashContent', () => {
  it('returns a 64-char hex SHA-256 hash', () => {
    const hash = hashContent('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same hash for the same input', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashContent('hello')).not.toBe(hashContent('world'));
  });
});

describe('hashFile', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads a file and returns its SHA-256 hash', async () => {
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'file content');
    const hash = await hashFile(filePath);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches hashContent of the same content', async () => {
    const content = 'some content';
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, content);
    expect(await hashFile(filePath)).toBe(hashContent(content));
  });
});

describe('readManifest', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns parsed JSON when .praxis-manifest.json exists', async () => {
    const manifest = { version: 1, files: {} };
    await writeFile(
      join(tmpDir, '.praxis-manifest.json'),
      JSON.stringify(manifest),
    );
    expect(await readManifest(tmpDir)).toEqual(manifest);
  });

  it('returns null when file does not exist', async () => {
    expect(await readManifest(tmpDir)).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    await writeFile(join(tmpDir, '.praxis-manifest.json'), '{not valid json');
    expect(await readManifest(tmpDir)).toBeNull();
  });
});

describe('writeManifest', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes valid JSON with trailing newline', async () => {
    const manifest = { version: 1, files: {} };
    await writeManifest(tmpDir, manifest);
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(join(tmpDir, '.praxis-manifest.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw)).toEqual(manifest);
  });

  it('can be read back with readManifest', async () => {
    const manifest = { version: 1, files: { 'a.txt': { hash: 'abc' } } };
    await writeManifest(tmpDir, manifest);
    expect(await readManifest(tmpDir)).toEqual(manifest);
  });
});

describe('isLocallyModified', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns false when entry is not in manifest.files', async () => {
    const manifest = { files: {} };
    expect(await isLocallyModified(tmpDir, 'missing.txt', manifest)).toBe(
      false,
    );
  });

  it('returns false when file hash matches manifest', async () => {
    const content = 'original content';
    await writeFile(join(tmpDir, 'file.txt'), content);
    const hash = hashContent(content);
    const manifest = { files: { 'file.txt': { hash } } };
    expect(await isLocallyModified(tmpDir, 'file.txt', manifest)).toBe(false);
  });

  it('returns true when file hash differs from manifest', async () => {
    await writeFile(join(tmpDir, 'file.txt'), 'modified content');
    const manifest = { files: { 'file.txt': { hash: 'oldhash' } } };
    expect(await isLocallyModified(tmpDir, 'file.txt', manifest)).toBe(true);
  });

  it('returns true when file does not exist on disk (catch branch)', async () => {
    const manifest = { files: { 'gone.txt': { hash: 'somehash' } } };
    expect(await isLocallyModified(tmpDir, 'gone.txt', manifest)).toBe(true);
  });
});
