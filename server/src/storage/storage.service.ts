import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { fileUrl } from '../common/file-url';
import { Env } from '../config/env';
import { CloudinaryStorageDriver } from './cloudinary.driver';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';
import { StorageDriver } from './storage.types';

const CLOUDINARY_KEY_PREFIX = 'cloudinary:';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly driver: StorageDriver;
  readonly localPublicDir?: string;
  private readonly baseUrl: string;
  private readonly legacyDriver: StorageDriver;
  private readonly cloudinaryDriver?: CloudinaryStorageDriver;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('PUBLIC_FILES_BASE_URL', { infer: true });
    const local = () => new LocalStorageDriver(resolve(config.get('STORAGE_LOCAL_DIR', { infer: true })));
    const s3 = () => new S3StorageDriver({
      region: config.get('S3_REGION', { infer: true })!, endpoint: config.get('S3_ENDPOINT', { infer: true }),
      accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true })!, secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true })!,
      publicBucket: config.get('S3_BUCKET_PUBLIC', { infer: true })!, privateBucket: config.get('S3_BUCKET_PRIVATE', { infer: true }),
    });
    const driverType = config.get('STORAGE_DRIVER', { infer: true });

    if (driverType === 'cloudinary') {
      this.cloudinaryDriver = new CloudinaryStorageDriver({
        cloudName: config.get('CLOUDINARY_CLOUD_NAME', { infer: true })!,
        apiKey: config.get('CLOUDINARY_API_KEY', { infer: true })!,
        apiSecret: config.get('CLOUDINARY_API_SECRET', { infer: true })!,
      });
      this.driver = this.cloudinaryDriver;
      this.legacyDriver = config.get('STORAGE_LEGACY_DRIVER', { infer: true }) === 's3' ? s3() : local();
      if (this.legacyDriver instanceof LocalStorageDriver) this.localPublicDir = this.legacyDriver.publicDir();
    } else if (driverType === 's3') {
      this.driver = s3();
      this.legacyDriver = this.driver;
    } else {
      const localDriver = local();
      this.driver = localDriver;
      this.legacyDriver = localDriver;
      this.localPublicDir = localDriver.publicDir();
    }
  }

  async putPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.driver.put(key, body, contentType, 'public');
    return this.cloudinaryDriver ? `${CLOUDINARY_KEY_PREFIX}${key}` : key;
  }

  publicUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    if (key.startsWith(CLOUDINARY_KEY_PREFIX)) {
      return this.cloudinaryDriver?.publicUrl(key.slice(CLOUDINARY_KEY_PREFIX.length)) ?? null;
    }
    return fileUrl(this.baseUrl, key);
  }

  /** Best-effort cleanup: a failed delete must not fail the user's request, but it is logged. */
  async deletePublic(...keys: (string | null | undefined)[]): Promise<void> {
    await Promise.all(keys.filter((k): k is string => !!k).map((key) => {
      const cloudinaryKey = key.startsWith(CLOUDINARY_KEY_PREFIX);
      const driver = cloudinaryKey ? this.cloudinaryDriver : this.legacyDriver;
      const storageKey = cloudinaryKey ? key.slice(CLOUDINARY_KEY_PREFIX.length) : key;
      if (!driver) throw new Error('Cloudinary storage is not configured for this image');
      return driver.delete(storageKey, 'public')
        .catch((e: Error) => this.logger.warn(`Could not delete ${key}: ${e.message}`));
    }));
  }

  /** Reserved for verification documents (never served publicly). */
  putPrivate(key: string, body: Buffer, contentType: string) {
    return this.legacyDriver.put(key, body, contentType, 'private');
  }
}
