import { v2 as cloudinary } from 'cloudinary';
import { Readable, Transform } from 'node:stream';
import { StorageDriver, Visibility } from './storage.types';

export interface CloudinaryOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface CloudinaryClient {
  uploadStream(
    options: { public_id: string; resource_type: 'image'; overwrite: false; unique_filename: false; use_filename: false },
    callback: (error?: { message: string }, result?: { public_id: string }) => void,
  ): Transform;
  destroy(publicId: string, options: { resource_type: 'image'; type: 'upload'; invalidate: true }): Promise<{ result?: string }>;
  url(publicId: string, options: { secure: true; cloud_name: string; resource_type: 'image'; format: 'webp' }): string;
}

const defaultClient: CloudinaryClient = {
  uploadStream: (options, callback) => cloudinary.uploader.upload_stream(options, callback),
  destroy: (publicId, options) => cloudinary.uploader.destroy(publicId, options),
  url: (publicId, options) => cloudinary.url(publicId, options),
};

export class CloudinaryStorageDriver implements StorageDriver {
  constructor(private readonly opts: CloudinaryOptions, private readonly client: CloudinaryClient = defaultClient) {
    cloudinary.config({
      cloud_name: opts.cloudName,
      api_key: opts.apiKey,
      api_secret: opts.apiSecret,
      secure: true,
    });
  }

  async put(key: string, body: Buffer, _contentType: string, visibility: Visibility): Promise<void> {
    if (visibility !== 'public') throw new Error('Cloudinary storage is only configured for public images');
    const publicId = this.publicId(key);
    await new Promise<void>((resolve, reject) => {
      const upload = this.client.uploadStream(
        {
          public_id: publicId,
          resource_type: 'image',
          overwrite: false,
          unique_filename: false,
          use_filename: false,
        },
        (error, result) => {
          if (error) reject(new Error(error.message));
          else if (!result) reject(new Error('Cloudinary upload completed without a result'));
          else resolve();
        },
      );
      upload.on('error', reject);
      Readable.from([body]).pipe(upload);
    });
  }

  async delete(key: string, visibility: Visibility): Promise<void> {
    if (visibility !== 'public') throw new Error('Cloudinary storage is only configured for public images');
    const result = await this.client.destroy(this.publicId(key), {
      resource_type: 'image',
      type: 'upload',
      invalidate: true,
    });
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Cloudinary delete failed: ${String(result.result ?? 'unknown result')}`);
    }
  }

  publicUrl(key: string): string {
    return this.client.url(this.publicId(key), {
      secure: true,
      cloud_name: this.opts.cloudName,
      resource_type: 'image',
      format: 'webp',
    });
  }

  private publicId(key: string): string {
    if (!/^[a-zA-Z0-9/_-]+\.webp$/.test(key) || key.includes('..')) {
      throw new Error('Invalid Cloudinary storage key');
    }
    return key.slice(0, -'.webp'.length);
  }
}
