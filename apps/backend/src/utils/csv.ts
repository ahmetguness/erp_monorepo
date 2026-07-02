export type CsvCellValue = string | number | boolean | null | undefined;

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function csvEscape(value: CsvCellValue): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  if (!/[",\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: Record<string, CsvCellValue>[]): string {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
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

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

export function parseCsv(csv: string): CsvParseResult {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  return { headers, rows };
}
