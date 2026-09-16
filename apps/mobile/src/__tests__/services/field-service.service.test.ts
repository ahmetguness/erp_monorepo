import { describe, it, expect } from 'vitest';
import {
  generateServiceReportHtml,
  ServiceReportData,
  FieldServiceJob,
} from '../../services/field-service.service';

describe('field-service.service (FAZ 16.5 Corporate Service Report)', () => {
  const mockJob: FieldServiceJob = {
    id: 'srv-001',
    number: 'SRV-2026-0089',
    subject: 'Kazan Basınç Valfi Arızası',
    status: 'COMPLETED',
    priority: 'HIGH',
    assignedToId: 'tech-01',
    createdAt: '2026-09-16T10:00:00.000Z',
    contact: {
      id: 'cont-01',
      code: 'CAR-001',
      name: 'Örnek Tekstil Sanayi A.Ş.',
      phone: '+90 532 111 2233',
      address: 'Organize Sanayi Bölgesi 4. Cad No:12',
      city: 'Bursa',
    },
    asset: {
      id: 'asset-01',
      name: 'Endüstriyel Buhar Kazanı',
      brand: 'Buderus',
      model: 'BK-500',
      serialNo: 'SN-998877',
    },
    routeStop: {
      serviceRequestId: 'srv-001',
      serviceRequestNumber: 'SRV-2026-0089',
      sequence: 1,
      title: 'Kazan Valf Değişimi',
      address: 'Organize Sanayi Bölgesi 4. Cad No:12',
      city: 'Bursa',
      contactPhone: '+90 532 111 2233',
    },
    photoCount: 2,
    signatureCount: 1,
    serviceFormSubmitted: true,
    customerApproved: true,
    offlineReady: true,
    pendingSyncCount: 0,
    lastOfflineSyncAt: null,
    steps: [],
  };

  it('should generate valid HTML document containing header, customer and asset info', () => {
    const reportData: ServiceReportData = {
      job: mockJob,
      diagnosis: 'Emniyet ventili contası aşınmış ve basınç kaçırıyordu.',
      actionsTaken: 'Yeni ventil takıldı, 6 bar basınç testi yapıldı.',
      technicianName: 'Ahmet Güneş (Baş Teknisyen)',
      customerName: 'Mehmet Yılmaz',
      customerSignatureSvg: ['M10,20 L50,80 L120,40'],
      items: [
        {
          productId: 'p-01',
          description: 'Emniyet Ventili 1/2 inç',
          quantity: 1,
          unitPrice: 1250,
          lineTotal: 1250,
        },
        {
          productId: 'p-02',
          description: 'Saha Servis & Kalibrasyon İşçiliği',
          quantity: 2,
          unitPrice: 500,
          lineTotal: 1000,
        },
      ],
    };

    const html = generateServiceReportHtml(reportData);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('SRV-2026-0089');
    expect(html).toContain('Örnek Tekstil Sanayi A.Ş.');
    expect(html).toContain('Endüstriyel Buhar Kazanı');
    expect(html).toContain('SN-998877');
    expect(html).toContain('Saha Servis & Kalibrasyon');
    expect(html).toContain('Ahmet Güneş (Baş Teknisyen)');
    expect(html).toContain('Mehmet Yılmaz');
    expect(html).toContain('M10,20 L50,80 L120,40'); // SVG path
  });

  it('should handle service reports without spare parts gracefully', () => {
    const reportData: ServiceReportData = {
      job: mockJob,
      diagnosis: 'Genel kontrol ve yazılım parametre güncellemesi yapıldı.',
      actionsTaken: 'Sistem test edildi, arıza görülmedi.',
      items: [],
    };

    const html = generateServiceReportHtml(reportData);
    expect(html).toContain('Yedek parça sarfiyatı kaydedilmedi.');
    expect(html).toContain('GENEL TOPLAM');
  });
});
