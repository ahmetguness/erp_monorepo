'use client';

import { useState, useEffect } from 'react';
import { Shield, Key, Globe, Clock, Copy, Check, RefreshCw, Save } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useUIStore } from '@/store/ui.store';
import {
  useCorporateSecuritySettings,
  useUpdateCorporateSecuritySettings,
  useGenerateScimToken,
} from '@/hooks/useSettings';
import type { CorporateSecuritySettings } from '@/services/settings.service';

export default function CorporateSecurityPage() {
  const { data: settings, isLoading } = useCorporateSecuritySettings();
  const updateSettings = useUpdateCorporateSecuritySettings();
  const generateScim = useGenerateScimToken();
  const { toast } = useUIStore();

  const [form, setForm] = useState<CorporateSecuritySettings>({
    ssoEnabled: false,
    ssoProvider: 'saml',
    samlMetadataUrl: '',
    oidcClientId: '',
    oidcClientSecret: '',
    scimEnabled: false,
    scimToken: '',
    ipRestrictionEnabled: false,
    ipWhitelist: '',
    sessionMaxAgeDays: 7,
    sessionConcurrentLimit: 5,
    sessionIdleTimeoutMins: 30,
  });

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleCopyToken = () => {
    if (form.scimToken) {
      navigator.clipboard.writeText(form.scimToken);
      setCopied(true);
      toast.success('SCIM Token panoya kopyalandı.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerateScimToken = () => {
    if (confirm('Yeni bir SCIM entegrasyon tokenı oluşturmak istediğinize emin misiniz? Eski token geçersiz kalacaktır.')) {
      generateScim.mutate(undefined, {
        onSuccess: (data) => {
          setForm((prev) => ({ ...prev, scimToken: data.token }));
        },
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Kurumsal Güvenlik Politikaları"
        subtitle="SSO (SAML/OIDC), SCIM kullanıcı eşitleme, IP kısıtlamaları ve oturum politikalarını yönetin."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SSO Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Tekli Oturum Açma (SSO / SAML / OIDC)</h3>
              <p className="text-xs text-slate-500">Okta, Azure AD (Entra ID) veya Google Workspace ile oturum açmayı zorunlu kılın.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ssoEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, ssoEnabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-sky-500 focus:ring-sky-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">SSO Girişini Etkinleştir</span>
            </label>

            {form.ssoEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 pl-7 border-l-2 border-slate-800">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">SSO Sağlayıcı Tipi</label>
                  <select
                    value={form.ssoProvider}
                    onChange={(e) => setForm((prev) => ({ ...prev, ssoProvider: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
                  >
                    <option value="saml">SAML 2.0</option>
                    <option value="oidc">OpenID Connect (OIDC)</option>
                  </select>
                </div>

                {form.ssoProvider === 'saml' ? (
                  <div className="space-y-2 col-span-2">
                    <Input
                      label="SAML Metadata URL / XML"
                      placeholder="https://identityprovider.okta.com/app/.../metadata"
                      value={form.samlMetadataUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, samlMetadataUrl: e.target.value }))}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Input
                        label="OIDC Client ID"
                        placeholder="client_id"
                        value={form.oidcClientId}
                        onChange={(e) => setForm((prev) => ({ ...prev, oidcClientId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Input
                        label="OIDC Client Secret"
                        type="password"
                        placeholder="••••••••••••••••"
                        value={form.oidcClientSecret}
                        onChange={(e) => setForm((prev) => ({ ...prev, oidcClientSecret: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl col-span-2 mt-2">
                  <span className="text-xs font-semibold text-slate-300 block mb-1">Kurumsal Giriş Bağlantısı (Simülasyon):</span>
                  <span className="text-[11px] text-slate-500 font-mono select-all">
                    /api/auth/sso/login (email ve tenantSlug parametreleri ile)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SCIM Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">SCIM 2.0 Kullanıcı Provizyonlama</h3>
              <p className="text-xs text-slate-500">Okta veya Azure AD üzerinden kullanıcıları otomatik ekleyin, güncelleyin veya pasife alın.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.scimEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, scimEnabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">SCIM Provizyonlamayı Etkinleştir</span>
            </label>

            {form.scimEnabled && (
              <div className="space-y-4 pt-2 pl-7 border-l-2 border-slate-800">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">SCIM Base URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/api/scim/v2`}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">SCIM Bearer Token</label>
                  <div className="flex gap-2">
                    <input
                      type={form.scimToken ? 'text' : 'password'}
                      readOnly
                      placeholder="Henüz token oluşturulmadı"
                      value={form.scimToken || '••••••••••••••••••••••••'}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-xs font-mono focus:outline-none"
                    />
                    {form.scimToken && (
                      <Button type="button" variant="secondary" size="sm" onClick={handleCopyToken} className="px-3 shrink-0">
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleGenerateScimToken}
                      loading={generateScim.isPending}
                      className="shrink-0"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Token Üret
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* IP Restriction Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">IP Adresi Kısıtlamaları</h3>
              <p className="text-xs text-slate-500">Sadece izin verilen IP adreslerinden veya ofis ağınızdan (CIDR) erişim sağlayın.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ipRestrictionEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, ipRestrictionEnabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">IP Adresi Kısıtlamasını Etkinleştir</span>
            </label>

            {form.ipRestrictionEnabled && (
              <div className="space-y-2 pt-2 pl-7 border-l-2 border-slate-800">
                <label className="text-xs text-slate-400 font-medium">İzin Verilen IP Adresleri (Virgül ile ayırın)</label>
                <textarea
                  placeholder="ör. 127.0.0.1, 192.168.1.0/24, 82.165.12.33"
                  value={form.ipWhitelist}
                  onChange={(e) => setForm((prev) => ({ ...prev, ipWhitelist: e.target.value }))}
                  className="w-full min-h-[80px] p-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-amber-500/50 focus:outline-none transition-colors"
                />
                <span className="text-[10px] text-slate-500 block leading-normal">
                  IP adresleri tekil değerler veya CIDR blokları formatında yazılabilir. Kendi mevcut IP adresinizi dahil ettiğinizden emin olun, aksi halde sistem dışı kalabilirsiniz.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Session Lifecycle Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Oturum Yaşam Döngüsü Politikaları</h3>
              <p className="text-xs text-slate-500">Maksimum oturum süresi, eşzamanlı aktif oturum sayısı ve boşta kalma aşımı limitlerini belirleyin.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Input
                label="Oturum Maksimum Süresi (Gün)"
                type="number"
                min={1}
                max={90}
                value={form.sessionMaxAgeDays}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionMaxAgeDays: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Input
                label="Eşzamanlı Oturum Limiti (Cihaz)"
                type="number"
                min={1}
                max={20}
                value={form.sessionConcurrentLimit}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionConcurrentLimit: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Input
                label="Boşta Kalma Aşımı (Dakika)"
                type="number"
                min={5}
                max={1440}
                value={form.sessionIdleTimeoutMins}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionIdleTimeoutMins: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" loading={updateSettings.isPending}>
            <Save className="w-4 h-4" />
            Politikaları Kaydet
          </Button>
        </div>
      </form>
    </div>
  );
}
