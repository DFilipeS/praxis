import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { create as createTar } from 'tar';

function mockResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  return {
    ok: init.status ? init.status >= 200 && init.status < 300 : true,
    status: init.status || 200,
    headers,
    arrayBuffer: async () =>
      body instanceof Buffer
        ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
        : body,
  };
}

describe('fetchTemplates', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns a Map of .agents/ files from a valid tarball', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'test-tarball-'));
    try {
      const prefixDir = join(tmpDir, 'DFilipeS-praxis-abc123');
      await mkdir(join(prefixDir, '.agents'), { recursive: true });
      await writeFile(join(prefixDir, '.agents', 'test.md'), '# Test');
      await writeFile(join(prefixDir, 'README.md'), '# Readme');

      await createTar(
        { gzip: true, file: join(tmpDir, 'test.tar.gz'), cwd: tmpDir },
        ['DFilipeS-praxis-abc123'],
      );
      const tarBuffer = await readFile(join(tmpDir, 'test.tar.gz'));

      globalThis.fetch.mockResolvedValue(mockResponse(tarBuffer));

      const { fetchTemplates } = await import('../src/templates.js');
      const files = await fetchTemplates();

      expect(files).toBeInstanceOf(Map);
      expect(files.has('.agents/test.md')).toBe(true);
      expect(files.get('.agents/test.md')).toBe('# Test');
      expect(files.has('README.md')).toBe(false);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws on HTTP error (non-403)', async () => {
    globalThis.fetch.mockResolvedValue(
      mockResponse(Buffer.alloc(0), { status: 500 }),
    );

    const { fetchTemplates } = await import('../src/templates.js');
    await expect(fetchTemplates()).rejects.toThrow('status 500');
  });

  it('throws with rate-limited hint on 403', async () => {
    globalThis.fetch.mockResolvedValue(
      mockResponse(Buffer.alloc(0), { status: 403 }),
    );

    const { fetchTemplates } = await import('../src/templates.js');
    await expect(fetchTemplates()).rejects.toThrow('rate-limited');
  });

  it('throws when content-length exceeds 10MB', async () => {
    globalThis.fetch.mockResolvedValue(
      mockResponse(Buffer.alloc(0), {
        headers: { 'content-length': String(11 * 1024 * 1024) },
      }),
    );

    const { fetchTemplates } = await import('../src/templates.js');
    await expect(fetchTemplates()).rejects.toThrow('too large');
  });

  it('throws when buffer exceeds 10MB despite acceptable content-length', async () => {
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    globalThis.fetch.mockResolvedValue(mockResponse(bigBuffer));

    const { fetchTemplates } = await import('../src/templates.js');
    await expect(fetchTemplates()).rejects.toThrow('too large');
  });

  it('filters out non-.agents/ files from the tarball', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'test-tarball-'));
    try {
      const prefixDir = join(tmpDir, 'DFilipeS-praxis-abc123');
      await mkdir(join(prefixDir, '.agents', 'sub'), { recursive: true });
      await writeFile(join(prefixDir, '.agents', 'skill.md'), '# Skill');
      await writeFile(join(prefixDir, '.agents', 'sub', 'nested.md'), '# Nested');
      await writeFile(join(prefixDir, 'README.md'), '# Readme');

      await createTar(
        { gzip: true, file: join(tmpDir, 'test.tar.gz'), cwd: tmpDir },
        ['DFilipeS-praxis-abc123'],
      );
      const tarBuffer = await readFile(join(tmpDir, 'test.tar.gz'));

      globalThis.fetch.mockResolvedValue(mockResponse(tarBuffer));

      const { fetchTemplates } = await import('../src/templates.js');
      const files = await fetchTemplates();

      for (const key of files.keys()) {
        expect(key.startsWith('.agents/')).toBe(true);
      }
      expect(files.has('.agents/skill.md')).toBe(true);
      expect(files.has('.agents/sub/nested.md')).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
