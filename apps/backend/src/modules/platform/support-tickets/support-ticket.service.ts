import type {
  CreateSupportTicketInput,
  AddTicketMessageInput,
  UpdateTicketAdminInput,
  PlatformSupportTicketSummaryDto,
  PlatformSupportTicketDetailDto,
  PlatformTicketMessageDto,
  PlatformTicketStatus,
  PlatformTicketPriority,
  PlatformTicketCategory,
} from '@repo/types';
import { prisma } from '../../../lib/prisma.js';
import { runWithTenantIsolationBypass } from '../../../lib/tenant-isolation-context.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../errors/index.js';

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TCK-${year}-${timestamp}-${randomSuffix}`;
}

export async function createTenantTicket(
  tenantId: string,
  userId: string,
  input: CreateSupportTicketInput,
): Promise<PlatformSupportTicketDetailDto> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, companyName: true, slug: true, deletedAt: true },
  });
  if (!tenant || tenant.deletedAt) {
    throw new NotFoundError('Tenant');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    throw new NotFoundError('Kullanıcı');
  }

  const ticketNumber = await generateTicketNumber();

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.platformSupportTicket.create({
      data: {
        ticketNumber,
        tenantId,
        createdById: userId,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category ?? 'TECHNICAL',
        priority: input.priority ?? 'MEDIUM',
        status: 'OPEN',
      },
      include: {
        tenant: { select: { companyName: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
      },
    });

    const firstMessage = await tx.platformTicketMessage.create({
      data: {
        ticketId: created.id,
        senderType: 'TENANT_USER',
        authorUserId: userId,
        message: input.description.trim(),
        isInternal: false,
      },
      include: {
        authorUser: { select: { id: true, name: true, email: true } },
        authorAdmin: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      ...created,
      messages: [firstMessage],
    };
  });

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    tenantId: ticket.tenantId,
    tenantName: ticket.tenant.companyName,
    tenantSlug: ticket.tenant.slug,
    createdById: ticket.createdById,
    createdByUser: ticket.createdBy,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    assignedAdminId: ticket.assignedAdminId,
    assignedAdmin: ticket.assignedAdmin,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messageCount: 1,
    lastMessageAt: ticket.createdAt.toISOString(),
    messages: ticket.messages.map((msg) => ({
      id: msg.id,
      ticketId: msg.ticketId,
      senderType: msg.senderType,
      authorUserId: msg.authorUserId,
      authorAdminId: msg.authorAdminId,
      authorUser: msg.authorUser,
      authorAdmin: msg.authorAdmin,
      message: msg.message,
      isInternal: msg.isInternal,
      createdAt: msg.createdAt.toISOString(),
    })),
  };
}

export async function listTenantTickets(
  tenantId: string,
  filter?: {
    status?: PlatformTicketStatus;
    category?: PlatformTicketCategory;
    search?: string;
  },
): Promise<PlatformSupportTicketSummaryDto[]> {
  const where = {
    tenantId,
    ...(filter?.status ? { status: filter.status } : {}),
    ...(filter?.category ? { category: filter.category } : {}),
    ...(filter?.search
      ? {
        OR: [
          { ticketNumber: { contains: filter.search, mode: 'insensitive' as const } },
          { title: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }
      : {}),
  };

  const tickets = await prisma.platformSupportTicket.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      assignedAdmin: { select: { id: true, name: true, email: true } },
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
      _count: {
        select: {
          messages: { where: { isInternal: false } },
        },
      },
    },
  });

  return tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    tenantId: ticket.tenantId,
    createdById: ticket.createdById,
    createdByUser: ticket.createdBy,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    assignedAdminId: ticket.assignedAdminId,
    assignedAdmin: ticket.assignedAdmin,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messageCount: ticket._count.messages,
    lastMessageAt: ticket.messages[0]?.createdAt.toISOString() ?? ticket.createdAt.toISOString(),
  }));
}

export async function getTenantTicket(
  tenantId: string,
  ticketId: string,
): Promise<PlatformSupportTicketDetailDto> {
  const ticket = await prisma.platformSupportTicket.findFirst({
    where: { id: ticketId, tenantId },
    include: {
      tenant: { select: { companyName: true, slug: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      assignedAdmin: { select: { id: true, name: true, email: true } },
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: 'asc' },
        include: {
          authorUser: { select: { id: true, name: true, email: true } },
          authorAdmin: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new NotFoundError('Destek bileti bulunamadı.');
  }

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    tenantId: ticket.tenantId,
    tenantName: ticket.tenant.companyName,
    tenantSlug: ticket.tenant.slug,
    createdById: ticket.createdById,
    createdByUser: ticket.createdBy,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    assignedAdminId: ticket.assignedAdminId,
    assignedAdmin: ticket.assignedAdmin,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messageCount: ticket.messages.length,
    lastMessageAt: ticket.messages[ticket.messages.length - 1]?.createdAt.toISOString() ?? ticket.createdAt.toISOString(),
    messages: ticket.messages.map((msg) => ({
      id: msg.id,
      ticketId: msg.ticketId,
      senderType: msg.senderType,
      authorUserId: msg.authorUserId,
      authorAdminId: msg.authorAdminId,
      authorUser: msg.authorUser,
      authorAdmin: msg.authorAdmin,
      message: msg.message,
      isInternal: msg.isInternal,
      createdAt: msg.createdAt.toISOString(),
    })),
  };
}

export async function addTenantTicketMessage(
  tenantId: string,
  ticketId: string,
  userId: string,
  input: AddTicketMessageInput,
): Promise<PlatformTicketMessageDto> {
  const ticket = await prisma.platformSupportTicket.findFirst({
    where: { id: ticketId, tenantId },
  });
  if (!ticket) {
    throw new NotFoundError('Destek bileti');
  }

  if (ticket.status === 'CLOSED') {
    throw new ValidationError('Kapatılmış bir destek biletine yeni mesaj eklenemez. Lütfen yeni bir bilet oluşturun.');
  }

  if (ticket.status === 'RESOLVED') {
    throw new ValidationError('Bu bilet çözümlendi olarak işaretlenmiştir. Lütfen önce "Çözüme Ulaşmadı" seçeneğiyle talebi yeniden açın.');
  }

  return await prisma.$transaction(async (tx) => {
    const createdMessage = await tx.platformTicketMessage.create({
      data: {
        ticketId,
        senderType: 'TENANT_USER',
        authorUserId: userId,
        message: input.message.trim(),
        isInternal: false,
      },
      include: {
        authorUser: { select: { id: true, name: true, email: true } },
      },
    });

    const nextStatus =
      ticket.status === 'WAITING_TENANT'
        ? 'IN_PROGRESS'
        : ticket.status;

    await tx.platformSupportTicket.update({
      where: { id: ticketId, tenantId },
      data: {
        status: nextStatus,
        updatedAt: new Date(),
      },
    });

    return {
      id: createdMessage.id,
      ticketId: createdMessage.ticketId,
      senderType: createdMessage.senderType,
      authorUserId: createdMessage.authorUserId,
      authorAdminId: null,
      authorUser: createdMessage.authorUser,
      authorAdmin: null,
      message: createdMessage.message,
      isInternal: false,
      createdAt: createdMessage.createdAt.toISOString(),
    };
  });
}

export async function closeTenantTicket(
  tenantId: string,
  ticketId: string,
  userId: string,
): Promise<void> {
  const ticket = await prisma.platformSupportTicket.findFirst({
    where: { id: ticketId, tenantId },
  });
  if (!ticket) {
    throw new NotFoundError('Destek bileti');
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformSupportTicket.update({
      where: { id: ticketId, tenantId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await tx.platformTicketMessage.create({
      data: {
        ticketId,
        senderType: 'TENANT_USER',
        authorUserId: userId,
        message: 'Kullanıcı sorunun çözüme ulaştığını onaylayarak talebi kapattı.',
        isInternal: false,
      },
    });
  });
}

export async function reopenTenantTicket(
  tenantId: string,
  ticketId: string,
  userId: string,
  reason?: string,
): Promise<PlatformSupportTicketDetailDto> {
  const ticket = await prisma.platformSupportTicket.findFirst({
    where: { id: ticketId, tenantId },
  });
  if (!ticket) {
    throw new NotFoundError('Destek bileti');
  }

  if (ticket.status === 'CLOSED') {
    throw new ValidationError('Kapatılmış bir destek bileti yeniden açılamaz. Lütfen yeni bir destek bileti oluşturun.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformSupportTicket.update({
      where: { id: ticketId, tenantId },
      data: {
        status: 'IN_PROGRESS',
        resolvedAt: null,
        updatedAt: new Date(),
      },
    });

    const msgContent = reason?.trim()
      ? `Kullanıcı sorunun henüz çözülmediğini bildirdi: ${reason.trim()}`
      : 'Kullanıcı sorunun çözüme ulaşmadığını belirterek talebi tekrar incelemeye aldı.';

    await tx.platformTicketMessage.create({
      data: {
        ticketId,
        senderType: 'TENANT_USER',
        authorUserId: userId,
        message: msgContent,
        isInternal: false,
      },
    });
  });

  return getTenantTicket(tenantId, ticketId);
}

// ─────────────────────────────────────────────
// Admin Functions
// ─────────────────────────────────────────────

export async function listAdminTickets(filter?: {
  status?: PlatformTicketStatus;
  priority?: PlatformTicketPriority;
  category?: PlatformTicketCategory;
  tenantId?: string;
  assignedAdminId?: string;
  search?: string;
}): Promise<PlatformSupportTicketSummaryDto[]> {
  return runWithTenantIsolationBypass('admin-console', async () => {
    const where = {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.priority ? { priority: filter.priority } : {}),
      ...(filter?.category ? { category: filter.category } : {}),
      ...(filter?.tenantId ? { tenantId: filter.tenantId } : {}),
      ...(filter?.assignedAdminId !== undefined
        ? filter.assignedAdminId === 'UNASSIGNED'
          ? { assignedAdminId: null }
          : { assignedAdminId: filter.assignedAdminId }
        : {}),
      ...(filter?.search
        ? {
          OR: [
            { ticketNumber: { contains: filter.search, mode: 'insensitive' as const } },
            { title: { contains: filter.search, mode: 'insensitive' as const } },
            { tenant: { companyName: { contains: filter.search, mode: 'insensitive' as const } } },
          ],
        }
        : {}),
    };

    const tickets = await prisma.platformSupportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        tenant: { select: { companyName: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      tenantId: ticket.tenantId,
      tenantName: ticket.tenant.companyName,
      tenantSlug: ticket.tenant.slug,
      createdById: ticket.createdById,
      createdByUser: ticket.createdBy,
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedAdminId: ticket.assignedAdminId,
      assignedAdmin: ticket.assignedAdmin,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messageCount: ticket._count.messages,
      lastMessageAt: ticket.messages[0]?.createdAt.toISOString() ?? ticket.createdAt.toISOString(),
    }));
  });
}

export async function getAdminTicket(ticketId: string): Promise<PlatformSupportTicketDetailDto> {
  return runWithTenantIsolationBypass('admin-console', async () => {
    const ticket = await prisma.platformSupportTicket.findUnique({
      where: { id: ticketId },
      include: {
        tenant: { select: { companyName: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            authorUser: { select: { id: true, name: true, email: true } },
            authorAdmin: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundError('Destek bileti');
    }

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      tenantId: ticket.tenantId,
      tenantName: ticket.tenant.companyName,
      tenantSlug: ticket.tenant.slug,
      createdById: ticket.createdById,
      createdByUser: ticket.createdBy,
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedAdminId: ticket.assignedAdminId,
      assignedAdmin: ticket.assignedAdmin,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messageCount: ticket.messages.length,
      lastMessageAt: ticket.messages[ticket.messages.length - 1]?.createdAt.toISOString() ?? ticket.createdAt.toISOString(),
      messages: ticket.messages.map((msg) => ({
        id: msg.id,
        ticketId: msg.ticketId,
        senderType: msg.senderType,
        authorUserId: msg.authorUserId,
        authorAdminId: msg.authorAdminId,
        authorUser: msg.authorUser,
        authorAdmin: msg.authorAdmin,
        message: msg.message,
        isInternal: msg.isInternal,
        createdAt: msg.createdAt.toISOString(),
      })),
    };
  });
}

export async function addAdminTicketMessage(
  adminId: string,
  ticketId: string,
  input: AddTicketMessageInput,
): Promise<PlatformTicketMessageDto> {
  return runWithTenantIsolationBypass('admin-console', async () => {
    const ticket = await prisma.platformSupportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundError('Destek bileti');
    }

    return await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.platformTicketMessage.create({
        data: {
          ticketId,
          senderType: 'ADMIN_USER',
          authorAdminId: adminId,
          message: input.message.trim(),
          isInternal: input.isInternal ?? false,
        },
        include: {
          authorAdmin: { select: { id: true, name: true, email: true } },
        },
      });

      const nextStatus =
        !input.isInternal && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS')
          ? 'WAITING_TENANT'
          : ticket.status;

      await tx.platformSupportTicket.update({
        where: { id: ticketId, tenantId: ticket.tenantId },
        data: {
          status: nextStatus,
          updatedAt: new Date(),
          ...(ticket.assignedAdminId === null ? { assignedAdminId: adminId } : {}),
        },
      });

      return {
        id: createdMessage.id,
        ticketId: createdMessage.ticketId,
        senderType: createdMessage.senderType,
        authorUserId: null,
        authorAdminId: createdMessage.authorAdminId,
        authorUser: null,
        authorAdmin: createdMessage.authorAdmin,
        message: createdMessage.message,
        isInternal: createdMessage.isInternal,
        createdAt: createdMessage.createdAt.toISOString(),
      };
    });
  });
}

export async function updateAdminTicket(
  adminId: string,
  ticketId: string,
  input: UpdateTicketAdminInput,
): Promise<PlatformSupportTicketDetailDto> {
  return runWithTenantIsolationBypass('admin-console', async () => {
    const ticket = await prisma.platformSupportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundError('Destek bileti');
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.status) {
      updateData.status = input.status;
      if (input.status === 'RESOLVED' && !ticket.resolvedAt) {
        updateData.resolvedAt = new Date();
      }
      if (input.status === 'CLOSED' && !ticket.closedAt) {
        updateData.closedAt = new Date();
      }
    }

    if (input.priority) {
      updateData.priority = input.priority;
    }

    if (input.assignedAdminId !== undefined) {
      updateData.assignedAdminId = input.assignedAdminId;
    }

    await prisma.platformSupportTicket.update({
      where: { id: ticketId, tenantId: ticket.tenantId },
      data: updateData,
    });

    return getAdminTicket(ticketId);
  });
}
