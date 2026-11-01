export type Visibility = 'public' | 'private';

export interface StorageDriver {
  /** Must never overwrite an existing object. */
  put(key: string, body: Buffer, contentType: string, visibility: Visibility): Promise<void>;
  delete(key: string, visibility: Visibility): Promise<void>;
}
