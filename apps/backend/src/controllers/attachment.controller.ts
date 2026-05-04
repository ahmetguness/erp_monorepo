import { Context } from 'hono';
import { EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../errors';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { requireTenantId } from '../utils/context.js';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ─────────────────────────────────────────────
// Attachment Controller
// Basit dosya yükleme — local disk storage
// ─────────────────────────────────────────────

export const AttachmentController = {

  async listByEntity(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const entityType = c.req.query('entityType') as EntityType | undefined;
    const entityId = c.req.query('entityId');

    if (!entityType || !entityId) {
      return c.json(new ValidationError('entityType ve entityId zorunludur.').toJSON(), 400);
    }

    const attachments = await prisma.attachment.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: attachments });
  },

  async upload(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const entityType = formData.get('entityType') as string | null;
    const entityId = formData.get('entityId') as string | null;

    if (!file || !entityType || !entityId) {
      return c.json(new ValidationError('file, entityType ve entityId zorunludur.').toJSON(), 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json(new ValidationError('Dosya boyutu 10MB\'ı aşamaz.').toJSON(), 400);
    }

    // Ensure upload directory exists
    const tenantDir = join(UPLOAD_DIR, tenantId);
    await mkdir(tenantDir, { recursive: true });

    // Save file
    const ext = file.name.split('.').pop() ?? 'bin';
    const storageName = `${randomUUID()}.${ext}`;
    const storagePath = join(tenantDir, storageName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        entityType: entityType as EntityType,
        entityId,
        fileName: file.name,
        storagePath: `uploads/${tenantId}/${storageName}`,
        mimeType: file.type || null,
        fileSize: file.size,
      },
    });

    return c.json({ data: attachment }, 201);
  },

  async download(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);

    const filePath = join(process.cwd(), attachment.storagePath);

    try {
      const { readFile } = await import('fs/promises');
      const buffer = await readFile(filePath);
      return new Response(buffer, {
        headers: {
          'Content-Type': attachment.mimeType ?? 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${attachment.fileName}"`,
          'Content-Length': String(buffer.length),
        },
      });
    } catch {
      return c.json({ error: 'Dosya bulunamadı.' }, 404);
    }
  },

  async rename(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);

    const body = await c.req.json<{ fileName: string }>();
    if (!body.fileName?.trim()) {
      return c.json(new ValidationError('fileName zorunludur.').toJSON(), 400);
    }

    const updated = await prisma.attachment.update({
      where: { id },
      data: { fileName: body.fileName.trim() },
    });

    return c.json({ data: updated });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);

    // Delete file from disk
    try {
      await unlink(join(process.cwd(), attachment.storagePath));
    } catch { /* file may already be deleted */ }

    await prisma.attachment.delete({ where: { id } });

    return c.json({ data: { success: true } });
  },
};
