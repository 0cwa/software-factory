export function requireText(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

export function createProtocolToolId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
