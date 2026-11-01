import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ImageKind = 'jpeg' | 'png' | 'webp';

/** Identify an image by its bytes, never by file name or the client-declared MIME type. */
export function sniffImage(b: Buffer): ImageKind | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export interface ProcessedImage { main: Buffer; thumb: Buffer; width: number; height: number }

@Injectable()
export class ImageService {
  /**
   * Validates and re-encodes. Re-encoding decodes the pixels and writes a fresh file, which strips
   * EXIF/GPS metadata, discards any hidden payloads, and proves the file is a real image.
   */
  async processListingImage(input: Buffer, allowed?: string[]): Promise<ProcessedImage> {
    this.assertImage(input, allowed);
    try {
      const base = () => sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate();
      const main = await base().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
      const thumb = await base().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
      return { main: main.data, thumb, width: main.info.width, height: main.info.height };
    } catch {
      throw new BadRequestException('That file could not be read as a valid image.');
    }
  }

  async processAvatar(input: Buffer, allowed?: string[]): Promise<Buffer> {
    this.assertImage(input, allowed);
    try {
      return await sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate()
        .resize({ width: 400, height: 400, fit: 'cover' }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('That file could not be read as a valid image.');
    }
  }

  async processBrandLogo(input: Buffer, allowed?: string[]): Promise<Buffer> {
    this.assertImage(input, allowed);
    try {
      return await sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate()
        .resize({ width: 800, height: 300, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch {
      throw new BadRequestException('That file could not be read as a valid image.');
    }
  }

  private assertImage(input: Buffer, allowed?: string[]) {
    const kind = sniffImage(input);
    if (!kind) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed.');
    if (allowed && !allowed.includes(kind)) {
      throw new BadRequestException(`${kind.toUpperCase()} images are not accepted right now. Accepted formats: ${allowed.map((a) => a.toUpperCase()).join(', ')}.`);
    }
  }
}
