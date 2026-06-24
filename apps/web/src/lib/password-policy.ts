const MIN_PASSWORD_LENGTH = 10;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;

export const PASSWORD_POLICY_MESSAGE =
  'Şifre en az 10 karakter, 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.';

export function getPasswordPolicyError(password: string): string | null {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    !HAS_UPPER.test(password) ||
    !HAS_LOWER.test(password) ||
    !HAS_DIGIT.test(password)
  ) {
    return PASSWORD_POLICY_MESSAGE;
  }

  return null;
}

export function isPasswordStrong(password: string): boolean {
  return getPasswordPolicyError(password) === null;
}
