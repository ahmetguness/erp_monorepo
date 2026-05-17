export type SafeJson = string | number | boolean | SafeJson[] | { [key: string]: SafeJson };

export function toInputJson(value: unknown): SafeJson | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const items: SafeJson[] = [];
    for (const item of value) {
      const parsed = toInputJson(item);
      if (parsed !== undefined) items.push(parsed);
    }
    return items;
  }
  if (typeof value === 'object') {
    const output: { [key: string]: SafeJson } = {};
    for (const [key, item] of Object.entries(value)) {
      const parsed = toInputJson(item);
      if (parsed !== undefined) output[key] = parsed;
    }
    return output;
  }
  return undefined;
}

export function getStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const field = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
  return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}
