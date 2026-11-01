export function fileUrl(base: string, path: string | null | undefined): string | null {
  return path ? `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : null;
}
