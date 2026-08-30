'use client';

import { useEffect, useRef, useState } from 'react';
import type { ZodType } from 'zod';

interface LocalFormDraftOptions<T> {
  storageKey: string;
  value: T;
  schema: ZodType<T>;
  enabled: boolean;
  intervalMs: number;
  onRestore: (value: T) => void;
}

export function useLocalFormDraft<T>({ storageKey, value, schema, enabled, intervalMs, onRestore }: LocalFormDraftOptions<T>) {
  const restoredKeyRef = useRef<string | null>(null);
  const restoreHandlerRef = useRef(onRestore);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    restoreHandlerRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    if (!enabled || restoredKeyRef.current === storageKey) return;
    restoredKeyRef.current = storageKey;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    const parsedJson: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
    const parsed = schema.safeParse(parsedJson);
    if (parsed.success) restoreHandlerRef.current(parsed.data);
  }, [enabled, schema, storageKey]);

  useEffect(() => {
    if (!enabled || restoredKeyRef.current !== storageKey) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
      setSavedAt(new Date());
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [enabled, intervalMs, storageKey, value]);

  const clear = () => {
    window.localStorage.removeItem(storageKey);
    setSavedAt(null);
  };
  return { savedAt, clear };
}
