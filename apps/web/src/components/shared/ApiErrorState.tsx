'use client';

import type React from 'react';
import { ShieldAlert, Lock, AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ERROR_CODES, getErrorCode, getErrorMessage, type ErrorCode } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface ApiErrorCopy {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const ERROR_COPY: Partial<Record<ErrorCode, ApiErrorCopy>> = {
  [ERROR_CODES.UNAUTHORIZED]: {
    title: 'Oturum gerekli',
    description: 'Devam etmek için tekrar giriş yapmanız gerekiyor.',
    icon: <Lock className="h-5 w-5" />,
  },
  [ERROR_CODES.FORBIDDEN]: {
    title: 'Yetki gerekli',
    description: 'Bu ekran veya işlem için gerekli yetkiniz bulunmuyor.',
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  [ERROR_CODES.LIMIT_EXCEEDED]: {
    title: 'Plan limiti doldu',
    description: 'Bu işlem mevcut plan limitini aşıyor.',
    icon: <AlertCircle className="h-5 w-5" />,
  },
  [ERROR_CODES.FEATURE_DISABLED]: {
    title: 'Özellik kapalı',
    description: 'Bu özellik tenant ayarları veya plan kapsamında etkin değil.',
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  [ERROR_CODES.MODULE_DISABLED]: {
    title: 'Modül kapalı',
    description: 'Bu modül tenant ayarları veya plan kapsamında etkin değil.',
    icon: <ShieldAlert className="h-5 w-5" />,
  },
};

export interface ApiErrorStateProps {
  error: unknown;
  className?: string;
  onRetry?: () => void;
}

function isKnownErrorCode(code: string | null): code is ErrorCode {
  return Object.values(ERROR_CODES).some((knownCode) => knownCode === code);
}

export function ApiErrorState({ error, className, onRetry }: ApiErrorStateProps) {
  const rawCode = getErrorCode(error);
  const code = isKnownErrorCode(rawCode) ? rawCode : null;
  const copy = code ? ERROR_COPY[code] : undefined;
  const title = copy?.title ?? 'İşlem tamamlanamadı';
  const description = copy?.description ?? getErrorMessage(error);

  return (
    <div className={cn('rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-center', className)}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-300">
        {copy?.icon ?? <AlertCircle className="h-5 w-5" />}
      </div>
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{description}</p>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          leftIcon={<RefreshCcw className="h-3.5 w-3.5" />}
          onClick={onRetry}
        >
          Tekrar dene
        </Button>
      )}
    </div>
  );
}
