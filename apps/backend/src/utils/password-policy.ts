import { ValidationError } from '../errors/index.js';

const MIN_LENGTH = 10;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;

export function validatePasswordStrength(password: string): void {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) errors.push(`En az ${MIN_LENGTH} karakter`);
  if (!HAS_UPPER.test(password)) errors.push('En az 1 buyuk harf');
  if (!HAS_LOWER.test(password)) errors.push('En az 1 kucuk harf');
  if (!HAS_DIGIT.test(password)) errors.push('En az 1 rakam');

  if (errors.length > 0) {
    throw new ValidationError(`Sifre gereksinimleri: ${errors.join(', ')}.`);
  }
}
