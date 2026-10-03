import 'server-only';
import { ZodError } from 'zod';
import { ValidationError } from '@/server/errors';

// Plain `Error` messages that are written for end users and safe to return.
// Anything else (Prisma, driver, programming errors) must never reach a client.
const KNOWN_SAFE_MESSAGES = [
  'Order not found.',
  'A selected service is no longer available.',
  'Enter a whole number of pieces.',
  'Combine repeated services into one line.',
  'Payment must be between zero and the order total.',
  'That payment method is no longer available.',
  'Invalid outlet.',
  'Payment must be a positive amount.',
  'Payment must be no more than the outstanding balance.',
  'Invalid status.',
  'Product not found.',
  'Expense not found.',
  'Employee not found.',
  'User not found.',
  "You don't have access to this order's outlet.",
  'That payment was already recorded on another order.',
];

export function isKnownSafeMessage(message: string): boolean {
  return KNOWN_SAFE_MESSAGES.includes(message) || message.startsWith('Payment must') || message.endsWith('not found.') || message.startsWith('Invalid calendar date:');
}

/** A message safe to show a client, or null when the error must stay server-side. */
export function publicErrorMessage(error: unknown): string | null {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof ZodError) return error.issues.map(i => i.message).join(', ') || 'Validation error';
  if (error instanceof Error && error.name === 'Error' && isKnownSafeMessage(error.message)) return error.message;
  return null;
}
