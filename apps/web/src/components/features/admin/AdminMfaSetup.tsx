'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { AdminLoginResult } from '@repo/types';

type AdminMfaSetupProps = Pick<
  Extract<AdminLoginResult, { status: 'MFA_SETUP_REQUIRED' }>,
  'secret' | 'otpauthUri'
>;

export function AdminMfaSetup({ secret, otpauthUri }: AdminMfaSetupProps) {
  return (
    <div className="space-y-3">
      <p>Google Authenticator veya başka bir doğrulama uygulamasında hesap ekleyip QR kodu tarayın.</p>
      <div className="mx-auto w-fit max-w-full rounded-lg bg-white p-4">
        <QRCodeSVG
          value={otpauthUri}
          size={224}
          level="M"
          marginSize={4}
          title="Admin iki faktörlü doğrulama kurulum QR kodu"
          className="h-auto max-w-full"
        />
      </div>
      <p className="text-xs">QR kodu tarayamıyorsanız kurulum anahtarını zamana dayalı hesap olarak elle girin:</p>
      <code className="block break-all select-all">{secret}</code>
      <a href={otpauthUri} className="inline-block text-blue-400">Doğrulama uygulamasında aç</a>
      <p className="text-xs text-neutral-400">QR kodu ve kurulum anahtarını paylaşmayın.</p>
    </div>
  );
}
