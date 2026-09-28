import { createHash } from 'node:crypto';

// Stable, distinct, digits-only identifiers for disposable database fixtures.
export function testPhone(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 12);
  return '9' + (BigInt('0x' + hash) % BigInt('10000000000000')).toString().padStart(13, '0');
}
