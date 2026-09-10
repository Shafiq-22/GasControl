export const IMPORT_BUCKET = 'gas-control-imports';
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

export function isOwnedImportPath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string') return false;
  return path.startsWith(`${userId}/`) && /^[a-f0-9-]+\/[a-f0-9-]+\.xlsx$/.test(path);
}
