import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { StorageDriver, Visibility } from './storage.types';

/** Disk storage for development or a single server with a persistent volume. */
export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  /** Public files are served at /files; the private directory is never served by the API. */
  publicDir(): string { return resolve(this.root, 'public'); }

  private resolveSafe(key: string, visibility: Visibility): string {
    const base = resolve(this.root, visibility);
    const full = resolve(join(base, key));
    if (!full.startsWith(base + sep) || key.includes('\0')) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer, _contentType: string, visibility: Visibility): Promise<void> {
    const full = this.resolveSafe(key, visibility);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body, { flag: 'wx' }); // 'wx': fail instead of overwriting
  }

  async delete(key: string, visibility: Visibility): Promise<void> {
    await rm(this.resolveSafe(key, visibility), { force: true });
  }
}
