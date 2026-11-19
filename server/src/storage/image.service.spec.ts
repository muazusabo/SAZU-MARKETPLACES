import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ImageService, sniffImage } from './image.service';

describe('ImageService advertisement banners', () => {
  const service = new ImageService();

  it('validates by image bytes and re-encodes supported banners as WebP', async () => {
    const png = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#254b3d' } }).png().toBuffer();
    const webp = await service.processAdvertisementBanner(png, ['png']);
    expect(sniffImage(png)).toBe('png');
    expect(webp.toString('ascii', 0, 4)).toBe('RIFF');
    expect(webp.toString('ascii', 8, 12)).toBe('WEBP');
  });

  it('rejects unsupported formats and image bytes that do not match an allowed format', async () => {
    await expect(service.processAdvertisementBanner(Buffer.from('<svg/>'))).rejects.toThrow(BadRequestException);
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#254b3d' } }).png().toBuffer();
    await expect(service.processAdvertisementBanner(png, ['jpeg'])).rejects.toThrow(BadRequestException);
  });
});
