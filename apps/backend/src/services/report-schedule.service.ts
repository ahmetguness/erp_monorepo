import { EntityType, NotificationStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { sendMail } from './mail.service';
import { MailHistoryService } from './mail-history.service';
import { isKpiConfig, normalizeKpiConfig, ReportingBuilderService } from './reporting-builder.service';
import { ValidationError } from '../errors';

export interface ReportScheduleDispatchResult {
  reportId: string;
  reportName: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recipients: string[];
  notificationCount: number;
  mailCount: number;
  preview: {
    datasetLabel: string;
    metricLabel: string;
    formattedValue: string;
    period: { from: string | null; to: string | null };
  };
}

function reportScheduleHtml(input: {
  reportName: string;
  datasetLabel: string;
  metricLabel: string;
  formattedValue: string;
  period: { from: string | null; to: string | null };
}): string {
  const periodText = input.period.from && input.period.to ? `${input.period.from} - ${input.period.to}` : 'Dinamik donem';
  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;">
      <h2 style="margin:0 0 12px;">${input.reportName}</h2>
      <p style="margin:0 0 16px;color:#475569;">Zamanlanmis rapor ozeti hazirlandi.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase;">${input.datasetLabel} / ${input.metricLabel}</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#0284c7;">${input.formattedValue}</p>
        <p style="margin:8px 0 0;color:#64748b;font-size:12px;">Donem: ${periodText}</p>
      </div>
    </div>
  `;
}

export class ReportScheduleService {
  constructor(private readonly db: PrismaClient) {}

  async dispatchSavedReport(
    tenantId: string,
    userId: string,
    report: { id: string; name: string; filters: Prisma.JsonValue },
  ): Promise<ReportScheduleDispatchResult> {
    if (!isKpiConfig(report.filters)) {
      throw new ValidationError('Sadece KPI raporlari zamanlanabilir.');
    }

    const config = normalizeKpiConfig(report.filters);
    if (!config.scheduleEmail.enabled) {
      throw new ValidationError('Bu rapor icin zamanlama acik degil.');
    }
    if (config.scheduleEmail.recipients.length === 0) {
      throw new ValidationError('Zamanlanmis rapor icin en az bir alici girin.');
    }

    const reporting = new ReportingBuilderService(this.db);
    const preview = await reporting.preview(tenantId, userId, config);
    const subject = `Zamanlanmis rapor: ${report.name}`;
    const html = reportScheduleHtml({
      reportName: report.name,
      datasetLabel: preview.datasetLabel,
      metricLabel: preview.metricLabel,
      formattedValue: preview.formattedValue,
      period: preview.period,
    });

    let mailCount = 0;
    for (const recipient of config.scheduleEmail.recipients) {
      const history = await MailHistoryService.createOutbound({
        tenantId,
        sentById: userId,
        to: [recipient],
        subject,
        html,
      });
      const result = await sendMail({ to: recipient, subject, html });
      await MailHistoryService.complete({
        id: history.id,
        tenantId,
        success: result.success,
        providerId: result.id,
        error: result.error,
      });
      if (result.success) mailCount++;
    }

    await this.db.notification.create({
      data: {
        tenantId,
        userId,
        title: 'Zamanlanmis rapor gonderildi',
        message: `${report.name} raporu ${config.scheduleEmail.frequency.toLowerCase()} periyoduyla ${config.scheduleEmail.recipients.length} aliciya gonderildi.`,
        module: 'reporting',
        entityType: EntityType.OTHER,
        entityId: report.id,
        status: NotificationStatus.UNREAD,
      },
    });

    return {
      reportId: report.id,
      reportName: report.name,
      frequency: config.scheduleEmail.frequency,
      recipients: config.scheduleEmail.recipients,
      notificationCount: 1,
      mailCount,
      preview: {
        datasetLabel: preview.datasetLabel,
        metricLabel: preview.metricLabel,
        formattedValue: preview.formattedValue,
        period: preview.period,
      },
    };
  }
}
