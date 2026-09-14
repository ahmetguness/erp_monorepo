import 'exceljs';

declare module 'exceljs' {
  interface Xlsx {
    /** Browser bundle accepts typed arrays; upstream declaration only lists Node Buffer. */
    load(buffer: Uint8Array, options?: Partial<XlsxReadOptions>): Promise<Workbook>;
  }
}
