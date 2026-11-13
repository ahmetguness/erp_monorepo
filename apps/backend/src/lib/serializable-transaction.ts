import { Prisma, type PrismaClient } from '@prisma/client';
import { ConflictError } from '../errors/index.js';

/** Callback must contain database work only: serialization may re-execute it. */
export async function serializableTransaction<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
      if (attempt === 2) throw new ConflictError('Concurrent modification; refresh and retry.');
      await new Promise<void>((resolve) => setTimeout(resolve, 10 * 2 ** attempt + Math.floor(Math.random() * 10)));
    }
  }
  throw new ConflictError('Transaction retry limit reached.');
}
