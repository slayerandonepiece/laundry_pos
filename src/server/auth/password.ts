import 'server-only';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Valid bcrypt hash (cost 12) of a throwaway string. Compared against when a
// login names no usable account so that path costs the same as a real check.
const DUMMY_HASH = '$2b$12$ZvNaJx3U6.3vBK9gEHM2deJP1xCe8yYxvxuzuOGRwjLDe90JkaiP2';

export async function verifyPasswordAgainstDummy(password: string): Promise<false> {
  await bcrypt.compare(password, DUMMY_HASH);
  return false;
}
