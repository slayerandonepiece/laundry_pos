export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export function isValidPhone(raw: string): boolean {
  return /^[0-9]{8,15}$/.test(normalizePhone(raw));
}

export function isValidNewPassword(value: string): boolean {
  return value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);
}
