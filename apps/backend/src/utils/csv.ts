export type CsvCellValue = string | number | boolean | null | undefined;

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

const UTF8_BOM = '\uFEFF';

export function csvEscape(value: CsvCellValue): string {
  let normalized = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(normalized)) normalized = `'${normalized}`;
  if (!/[",\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: Record<string, CsvCellValue>[]): string {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

function countDelimiter(line: string, delimiter: ',' | ';'): number {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(headerLine: string): ',' | ';' {
  return countDelimiter(headerLine, ';') > countDelimiter(headerLine, ',') ? ';' : ',';
}

function parseCsvRows(csv: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function parseCsv(csv: string): CsvParseResult {
  const normalized = csv.replace(/^\uFEFF/, '');
  const firstPhysicalLine = normalized.split(/\r?\n/, 1)[0] ?? '';
  if (!firstPhysicalLine.trim()) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(firstPhysicalLine);
  const parsedRows = parseCsvRows(normalized, delimiter);
  const headers = parsedRows[0]?.map((header) => header.trim()) ?? [];
  const rows = parsedRows.slice(1).map((values) => {
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  return { headers, rows };
}
