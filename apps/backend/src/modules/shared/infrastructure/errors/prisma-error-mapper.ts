import { Prisma } from '@prisma/client';
import { ApplicationError, ConflictError } from '../../domain/errors/application-error.js';

const UNIQUE_FIELD_LABELS: Readonly<Record<string, string>> = {
  taxNumber: 'Vergi numarası', email: 'E-posta', code: 'Kod', slug: 'Slug', iban: 'IBAN', number: 'Numara',
};

export function mapPrismaError(error: unknown): ApplicationError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.filter((field): field is string => typeof field === 'string')
      : [];
    const fields = Object.fromEntries(target.map((field) => [field, `${UNIQUE_FIELD_LABELS[field] ?? field} zaten kullanımda.`]));
    const message = target.length === 1
      ? `${UNIQUE_FIELD_LABELS[target[0]] ?? target[0]} zaten kullanımda.`
      : 'Benzersiz olması gereken bir alan zaten kullanımda.';
    return new ApplicationError(message, 'validation', 'VALIDATION_ERROR', undefined, fields);
  }
  if (error.code === 'P2003') return new ConflictError('Kayıt ilişkili veriler nedeniyle değiştirilemiyor.');
  if (error.code === 'P2025') return new ApplicationError('Kayıt bulunamadı.', 'not-found', 'NOT_FOUND');
  return null;
}
