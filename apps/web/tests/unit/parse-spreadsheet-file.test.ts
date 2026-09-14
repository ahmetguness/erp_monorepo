import { File } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { parseSpreadsheetFile } from '@/lib/import/parse-spreadsheet-file';

describe('parseSpreadsheetFile', () => {
  it('CSV içeriğini değiştirmeden döndürür', async () => {
    const csv = 'code,name\nPRD-1,Ürün';
    const file = new File([csv], 'urunler.csv', { type: 'text/csv' });

    await expect(parseSpreadsheetFile(file)).resolves.toBe(csv);
  });

  it('ilk Excel çalışma sayfasını CSV hattına dönüştürür', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Ürünler');
    sheet.addRow(['code', 'name', 'salesPrice']);
    sheet.addRow(['PRD-1', 'Deneme, Ürün', 125.5]);
    const bytes = await workbook.xlsx.writeBuffer();
    const file = new File([new Uint8Array(bytes)], 'urunler.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await expect(parseSpreadsheetFile(file)).resolves.toBe(
      'code,name,salesPrice\nPRD-1,"Deneme, Ürün",125.5',
    );
  });
});
