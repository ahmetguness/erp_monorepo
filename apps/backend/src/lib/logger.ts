// ─────────────────────────────────────────────
// ANSI helpers
// ─────────────────────────────────────────────
const r = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';

const fg = {
  black:   '\x1b[30m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const bg = {
  red:     '\x1b[41m',
  green:   '\x1b[42m',
  yellow:  '\x1b[43m',
  blue:    '\x1b[44m',
  magenta: '\x1b[45m',
  cyan:    '\x1b[46m',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function time(): string {
  return `${fg.gray}${dim}${new Date().toLocaleTimeString('tr-TR')}${r}`;
}

function badge(text: string, bgColor: string, fgColor = fg.black): string {
  return `${bgColor}${fgColor}${bold} ${text} ${r}`;
}

function httpMethodBadge(method: string): string {
  const colors: Record<string, string> = {
    GET:    bg.blue,
    POST:   bg.green,
    PATCH:  bg.yellow,
    PUT:    bg.yellow,
    DELETE: bg.red,
  };
  const color = colors[method.toUpperCase()] ?? bg.magenta;
  const textColor = method === 'PATCH' || method === 'PUT' ? fg.black : fg.white;
  return `${color}${textColor}${bold} ${method.padEnd(6)}${r}`;
}

function statusBadge(status: number): string {
  if (status >= 500) return `${fg.red}${bold}${status}${r}`;
  if (status >= 400) return `${fg.yellow}${bold}${status}${r}`;
  if (status >= 300) return `${fg.cyan}${bold}${status}${r}`;
  return `${fg.green}${bold}${status}${r}`;
}

export interface StructuredLogFields {
  [key: string]: string | number | boolean | null | undefined;
}

function formatFields(fields: StructuredLogFields | undefined): string {
  if (!fields) return '';
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  return parts.length > 0 ? ` ${dim}${parts.join(' ')}${r}` : '';
}

// ─────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────

export const logger = {
  info: (msg: string, fields?: StructuredLogFields) =>
    console.log(`${time()} ${badge('INFO', bg.blue, fg.white)}  ${fg.white}${msg}${r}${formatFields(fields)}`),

  success: (msg: string, fields?: StructuredLogFields) =>
    console.log(`${time()} ${badge(' OK ', bg.green, fg.white)}  ${fg.white}${msg}${r}${formatFields(fields)}`),

  warn: (msg: string, fields?: StructuredLogFields) =>
    console.log(`${time()} ${badge('WARN', bg.yellow, fg.black)}  ${fg.yellow}${msg}${r}${formatFields(fields)}`),

  error: (msg: string, fields?: StructuredLogFields) =>
    console.log(`${time()} ${badge('ERR ', bg.red, fg.white)}  ${fg.red}${msg}${r}${formatFields(fields)}`),

  http: (method: string, path: string, status: number, ms: number, fields?: StructuredLogFields) => {
    const pathStr = `${fg.white}${path}${r}`;
    const msStr   = ms > 500
      ? `${fg.red}${bold}${ms}ms${r}`
      : ms > 200
        ? `${fg.yellow}${ms}ms${r}`
        : `${dim}${ms}ms${r}`;

    console.log(
      `${time()} ${httpMethodBadge(method)} ${pathStr.padEnd(38)} ${statusBadge(status)}  ${msStr}${formatFields(fields)}`,
    );
  },
};

// ─────────────────────────────────────────────
// Banner
// ─────────────────────────────────────────────

export function printBanner(port: number): void {
  const env = process.env.NODE_ENV ?? 'development';
  const envColor = env === 'production' ? fg.green : env === 'test' ? fg.yellow : fg.cyan;

  console.log('');
  console.log(`  ${bg.cyan}${fg.black}${bold}  AXON ERP  ${r}`);
  console.log(`  ${dim}${'─'.repeat(36)}${r}`);
  console.log(`  ${fg.gray}server   ${r}${fg.white}http://localhost:${bold}${port}${r}`);
  console.log(`  ${fg.gray}health   ${r}${fg.white}http://localhost:${port}/health${r}`);
  console.log(`  ${fg.gray}env      ${r}${envColor}${bold}${env}${r}`);
  console.log(`  ${dim}${'─'.repeat(36)}${r}`);
  console.log('');
}
