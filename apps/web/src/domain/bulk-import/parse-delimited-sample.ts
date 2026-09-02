export type DelimitedCell = string | number | boolean | null;
export type DelimitedRow = Record<string, DelimitedCell>;

function parseCell(value: string): DelimitedCell {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  return trimmed;
}

function splitDelimitedLine(line: string, separator: ',' | ';'): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === separator && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function delimiterCount(line: string, separator: ',' | ';'): number {
  return Math.max(0, splitDelimitedLine(line, separator).length - 1);
}

export function parseDelimitedSample(value: string): { headers: string[]; rows: DelimitedRow[] } {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const separator: ',' | ';' = delimiterCount(lines[0], ';') > delimiterCount(lines[0], ',') ? ';' : ',';
  const headers = splitDelimitedLine(lines[0], separator).filter(Boolean);
  const rows = lines.slice(1, 101).map((line) => {
    const values = splitDelimitedLine(line, separator);
    return Object.fromEntries(headers.map((header, index) => [header, parseCell(values[index] ?? '')]));
  });
  return { headers, rows };
}
