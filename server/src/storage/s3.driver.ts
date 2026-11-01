import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageDriver, Visibility } from './storage.types';

export interface S3Options {
  region: string; endpoint?: string; accessKeyId: string; secretAccessKey: string;
  publicBucket: string; privateBucket?: string;
}

/** Any S3-compatible service: AWS S3, Cloudflare R2, MinIO, etc. */
export class S3StorageDriver implements StorageDriver {
  constructor(private readonly opts: S3Options, private readonly client: Pick<S3Client, 'send'> = new S3Client({
    region: opts.region, endpoint: opts.endpoint || undefined, forcePathStyle: Boolean(opts.endpoint),
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
  })) {}

  private bucket(v: Visibility): string {
    const b = v === 'public' ? this.opts.publicBucket : this.opts.privateBucket;
    if (!b) throw new Error(`No ${v} bucket configured`);
    return b;
  }

  async put(key: string, body: Buffer, contentType: string, visibility: Visibility): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket(visibility), Key: key, Body: body, ContentType: contentType,
      CacheControl: visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      // Object keys contain a random UUID, so a collision is not expected; never overwrite regardless.
      IfNoneMatch: '*',
    }));
  }

  async delete(key: string, visibility: Visibility): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(visibility), Key: key }));
  }
}
