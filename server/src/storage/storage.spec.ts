import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ImageService, sniffImage } from './image.service';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';

const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } }).png().toBuffer();

describe('sniffImage', () => {
  it('identifies by bytes and rejects everything else', async () => {
    expect(sniffImage(await png())).toBe('png');
    expect(sniffImage(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImage(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).webp().toBuffer())).toBe('webp');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a......................'))).toBeNull();
    expect(sniffImage(Buffer.from('MZ\x90\x00 this is an exe pretending to be a .jpg'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('ImageService', () => {
  const svc = new ImageService();
  it('re-encodes to WebP, bounds size, makes a thumbnail, and strips EXIF metadata', async () => {
    const withExif = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#aa5500' } })
      .jpeg().withExif({ IFD0: { Copyright: 'secret-gps-owner' } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await svc.processListingImage(withExif);
    const meta = await sharp(out.main).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.exif).toBeUndefined();
    expect(out.main.toString('latin1')).not.toContain('secret-gps-owner');
    expect((await sharp(out.thumb).metadata()).width).toBe(480);
    expect(out.width).toBe(1600);
  });
  it('rejects a file with an image header but corrupt content', async () => {
    const bad = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage garbage garbage')]);
    await expect(svc.processListingImage(bad)).rejects.toThrow(/valid image/);
  });
  it('rejects non-images', async () => {
    await expect(svc.processListingImage(Buffer.from('hello world, definitely text'))).rejects.toThrow(/JPEG, PNG or WebP/);
  });
  it('makes square avatars', async () => {
    const m = await sharp(await svc.processAvatar(await png())).metadata();
    expect([m.width, m.height]).toEqual([400, 400]);
  });
  it('preserves a brand logo aspect ratio and outputs a bounded WebP', async () => {
    const input = await sharp({ create: { width: 1200, height: 300, channels: 4, background: { r: 30, g: 90, b: 55, alpha: 0.8 } } }).png().toBuffer();
    const out = await sharp(await svc.processBrandLogo(input)).metadata();
    expect(out.format).toBe('webp');
    expect(out.width).toBe(800);
    expect(out.height).toBe(200);
  });
});

describe('LocalStorageDriver', () => {
  it('writes, refuses to overwrite, deletes, and blocks path traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sazu-'));
    const d = new LocalStorageDriver(root);
    await d.put('products/a/b.webp', Buffer.from('one'), 'image/webp', 'public');
    expect((await readFile(join(root, 'public/products/a/b.webp'))).toString()).toBe('one');
    await expect(d.put('products/a/b.webp', Buffer.from('two'), 'image/webp', 'public')).rejects.toThrow();
    expect((await readFile(join(root, 'public/products/a/b.webp'))).toString()).toBe('one');
    await expect(d.put('../escape.txt', Buffer.from('x'), 'text/plain', 'public')).rejects.toThrow(/Invalid storage key/);
    await expect(d.put('a/../../escape.txt', Buffer.from('x'), 'text/plain', 'public')).rejects.toThrow(/Invalid/);
    await expect(stat(join(root, 'escape.txt'))).rejects.toThrow();
    await d.delete('products/a/b.webp', 'public');
    await expect(stat(join(root, 'public/products/a/b.webp'))).rejects.toThrow();
    await d.put('verification/x.pdf', Buffer.from('p'), 'application/pdf', 'private');
    await expect(stat(join(root, 'public/verification/x.pdf'))).rejects.toThrow(); // private is a separate tree
  });
});

describe('S3StorageDriver (mocked client: not verified against a real bucket)', () => {
  it('sends correct put/delete commands with immutable caching and no-overwrite', async () => {
    const send = jest.fn().mockResolvedValue({});
    const d = new S3StorageDriver({ region: 'auto', accessKeyId: 'k', secretAccessKey: 's', publicBucket: 'pub', privateBucket: 'priv' }, { send });
    await d.put('p/1.webp', Buffer.from('x'), 'image/webp', 'public');
    await d.delete('p/1.webp', 'public');
    await d.put('v/1.pdf', Buffer.from('x'), 'application/pdf', 'private');
    const [put, del, priv] = send.mock.calls.map((c) => c[0].input);
    expect(put).toMatchObject({ Bucket: 'pub', Key: 'p/1.webp', ContentType: 'image/webp', IfNoneMatch: '*' });
    expect(put.CacheControl).toMatch(/immutable/);
    expect(del).toEqual({ Bucket: 'pub', Key: 'p/1.webp' });
    expect(priv).toMatchObject({ Bucket: 'priv', CacheControl: 'private, no-store' });
  });
  it('refuses private writes when no private bucket is configured', async () => {
    const d = new S3StorageDriver({ region: 'r', accessKeyId: 'k', secretAccessKey: 's', publicBucket: 'pub' }, { send: jest.fn() });
    await expect(d.put('v', Buffer.from('x'), 'a/b', 'private')).rejects.toThrow(/private bucket/);
  });
});
