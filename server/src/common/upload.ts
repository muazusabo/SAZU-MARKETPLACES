import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

export const MULTER_HARD_LIMIT = 10 * 1024 * 1024; // absolute ceiling at the transport layer

/** Validates presence and size. Content type is verified later from the bytes, never from the client's claim. */
export function assertUpload(file: Express.Multer.File | undefined, maxBytes: number): Buffer {
  if (!file?.buffer?.length) throw new BadRequestException('Choose an image file to upload.');
  if (file.size > maxBytes) {
    throw new PayloadTooLargeException(`Images can be at most ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`);
  }
  return file.buffer;
}
