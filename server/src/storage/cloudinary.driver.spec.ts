import { PassThrough } from 'node:stream';
import { CloudinaryClient, CloudinaryStorageDriver } from './cloudinary.driver';

describe('CloudinaryStorageDriver', () => {
  const options = {
    cloudName: 'test-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
  };

  it('uploads public images without overwriting and creates a Cloudinary URL', async () => {
    const stream = new PassThrough();
    const uploadStream: CloudinaryClient['uploadStream'] = (_uploadOptions, callback) => {
      process.nextTick(() => callback(undefined, { public_id: 'products/item/image' }));
      return stream;
    };
    const upload = jest.fn(uploadStream);
    const client: CloudinaryClient = {
      uploadStream: upload,
      destroy: jest.fn(async () => ({ result: 'ok' })),
      url: jest.fn((publicId) => `https://res.cloudinary.com/test-cloud/image/upload/${publicId}.webp`),
    };
    const driver = new CloudinaryStorageDriver(options, client);

    await driver.put('products/item/image.webp', Buffer.from('webp'), 'image/webp', 'public');

    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        public_id: 'products/item/image',
        resource_type: 'image',
        overwrite: false,
        unique_filename: false,
      }),
      expect.any(Function),
    );
    expect(driver.publicUrl('products/item/image.webp')).toContain('res.cloudinary.com/test-cloud/image/upload');
    expect(driver.publicUrl('products/item/image.webp')).toContain('products/item/image.webp');
  });

  it('deletes Cloudinary images and rejects private writes or unsafe keys', async () => {
    const destroy = jest.fn(async () => ({ result: 'ok' }));
    const client: CloudinaryClient = {
      uploadStream: jest.fn(() => new PassThrough()),
      destroy,
      url: jest.fn((publicId) => `https://res.cloudinary.com/test-cloud/image/upload/${publicId}.webp`),
    };
    const driver = new CloudinaryStorageDriver(options, client);

    await driver.delete('avatars/users/user/image.webp', 'public');
    expect(destroy).toHaveBeenCalledWith('avatars/users/user/image', {
      resource_type: 'image',
      type: 'upload',
      invalidate: true,
    });
    await expect(driver.put('private/file.webp', Buffer.from('x'), 'image/webp', 'private')).rejects.toThrow(/only configured for public/);
    expect(() => driver.publicUrl('../image.webp')).toThrow(/Invalid Cloudinary storage key/);
  });
});
