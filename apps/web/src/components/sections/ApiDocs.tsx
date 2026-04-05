'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Key, Lock, Code, Copy, Check, ChevronDown, Shield, Zap } from 'lucide-react';

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

const SCOPES = [
  { key: 'products:read', label: 'Ürünler — Okuma' },
  { key: 'products:write', label: 'Ürünler — Yazma' },
  { key: 'products:delete', label: 'Ürünler — Silme' },
  { key: 'contacts:read', label: 'Cari Hesaplar — Okuma' },
  { key: 'contacts:write', label: 'Cari Hesaplar — Yazma' },
  { key: 'contacts:delete', label: 'Cari Hesaplar — Silme' },
  { key: 'invoices:read', label: 'Faturalar — Okuma' },
  { key: 'invoices:write', label: 'Faturalar — Yazma' },
  { key: 'invoices:delete', label: 'Faturalar — İptal' },
  { key: 'orders:read', label: 'Siparişler — Okuma' },
  { key: 'orders:write', label: 'Siparişler — Yazma' },
];

interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  desc: string;
  scope: string;
  params?: string;
}

const ENDPOINT_GROUPS: { title: string; endpoints: Endpoint[] }[] = [
  {
    title: 'Ürünler',
    endpoints: [
      { method: 'GET', path: '/api/external/products', desc: 'Ürün listesi (sayfalı)', scope: 'products:read', params: '?page=1&limit=20' },
      { method: 'GET', path: '/api/external/products/:id', desc: 'Ürün detayı', scope: 'products:read' },
      { method: 'POST', path: '/api/external/products', desc: 'Yeni ürün oluştur', scope: 'products:write' },
      { method: 'PATCH', path: '/api/external/products/:id', desc: 'Ürün güncelle', scope: 'products:write' },
      { method: 'DELETE', path: '/api/external/products/:id', desc: 'Ürün sil (soft delete)', scope: 'products:delete' },
    ],
  },
  {
    title: 'Cari Hesaplar',
    endpoints: [
      { method: 'GET', path: '/api/external/contacts', desc: 'Cari hesap listesi', scope: 'contacts:read', params: '?page=1&limit=20' },
      { method: 'GET', path: '/api/external/contacts/:id', desc: 'Cari hesap detayı', scope: 'contacts:read' },
      { method: 'POST', path: '/api/external/contacts', desc: 'Yeni cari hesap', scope: 'contacts:write' },
      { method: 'PATCH', path: '/api/external/contacts/:id', desc: 'Cari hesap güncelle', scope: 'contacts:write' },
      { method: 'DELETE', path: '/api/external/contacts/:id', desc: 'Cari hesap sil', scope: 'contacts:delete' },
    ],
  },
  {
    title: 'Faturalar',
    endpoints: [
      { method: 'GET', path: '/api/external/invoices', desc: 'Fatura listesi', scope: 'invoices:read', params: '?page=1&limit=20' },
      { method: 'GET', path: '/api/external/invoices/:id', desc: 'Fatura detayı (satırlar dahil)', scope: 'invoices:read' },
      { method: 'POST', path: '/api/external/invoices', desc: 'Yeni fatura oluştur', scope: 'invoices:write' },
      { method: 'POST', path: '/api/external/invoices/:id/cancel', desc: 'Fatura iptal et', scope: 'invoices:delete' },
    ],
  },
  {
    title: 'Stok',
    endpoints: [
      { method: 'GET', path: '/api/external/stock-levels', desc: 'Stok seviyeleri', scope: 'products:read', params: '?page=1&limit=50' },
      { method: 'POST', path: '/api/external/stock-movements', desc: 'Stok hareketi kaydet', scope: 'products:write' },
    ],
  },
  {
    title: 'Siparişler',
    endpoints: [
      { method: 'GET', path: '/api/external/sales-orders', desc: 'Satış siparişi listesi', scope: 'orders:read', params: '?page=1&limit=20' },
      { method: 'POST', path: '/api/external/sales-orders', desc: 'Yeni satış siparişi', scope: 'orders:write' },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-500/10',
  POST: 'text-sky-400 bg-sky-500/10',
  PATCH: 'text-amber-400 bg-amber-500/10',
  DELETE: 'text-red-400 bg-red-500/10',
};

const CODE_EXAMPLE = `curl -X GET "https://api.axonerp.com/api/external/products?page=1&limit=10" \\
  -H "x-api-key: sk_live_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json"`;

const RESPONSE_EXAMPLE = `{
  "data": [
    {
      "id": "clx...",
      "code": "P001",
      "name": "Laptop Pro 15\\"",
      "salesPrice": "24999.00",
      "isActive": true,
      "category": { "id": "...", "name": "Elektronik" },
      "unit": { "id": "...", "name": "Adet", "code": "AD" }
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5
  }
}`;

// ─────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
      aria-label="Kopyala"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function EndpointGroup({ title, endpoints }: { title: string; endpoints: Endpoint[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/30 transition-colors">
        <span className="text-sm font-semibold text-white">{title}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{endpoints.length} endpoint</span>
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-800 divide-y divide-slate-800/50">
          {endpoints.map((ep) => (
            <div key={`${ep.method}-${ep.path}`} className="px-5 py-3 flex items-center gap-4">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
              <code className="text-xs text-slate-300 font-mono flex-1">{ep.path}{ep.params ? <span className="text-slate-600">{ep.params}</span> : ''}</code>
              <span className="text-xs text-slate-500 hidden sm:block">{ep.desc}</span>
              <code className="text-[10px] text-slate-600 font-mono hidden md:block">{ep.scope}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Section
// ─────────────────────────────────────────────

export default function ApiDocs() {
  return (
    <section id="api-docs" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 mb-6">
            <Code className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs font-medium text-sky-400">REST API</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Güçlü API ile <span className="text-sky-400">Entegre Edin</span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            E-ticaret platformları, muhasebe yazılımları ve iş süreçlerinizi Axon ERP API ile sorunsuz entegre edin.
            Professional ve Enterprise planlarında kullanılabilir.
          </p>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
        >
          {[
            { icon: Key, title: 'API Key Kimlik Doğrulama', desc: 'Her istek x-api-key header\'ı ile doğrulanır. Anahtarlar hash\'lenerek saklanır, ham key sadece oluşturulurken gösterilir.' },
            { icon: Shield, title: 'Scope Bazlı Yetkilendirme', desc: 'Her API anahtarına özel erişim kapsamları tanımlayın. Sadece ihtiyaç duyulan verilere erişim sağlayın.' },
            { icon: Zap, title: 'Sayfalı Yanıtlar', desc: 'Tüm liste endpoint\'leri sayfalama destekler. page ve limit parametreleri ile veri akışını kontrol edin.' },
          ].map((item) => (
            <div key={item.title} className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center mb-4">
                <item.icon className="w-5 h-5 text-sky-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Auth section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.15 }}
          className="mb-12"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-sky-400" />
            Kimlik Doğrulama
          </h3>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <p className="text-sm text-slate-300 mb-4">
              Tüm API istekleri <code className="text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded text-xs">x-api-key</code> header&apos;ı ile doğrulanır.
              API anahtarlarını <span className="text-white font-medium">Ayarlar → API Anahtarları</span> sayfasından oluşturabilirsiniz.
            </p>
            <div className="bg-slate-950 rounded-lg p-4 relative group">
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={CODE_EXAMPLE} />
              </div>
              <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre">{CODE_EXAMPLE}</pre>
            </div>
          </div>
        </motion.div>

        {/* Response example */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-12"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Örnek Yanıt</h3>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 relative group">
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={RESPONSE_EXAMPLE} />
            </div>
            <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre">{RESPONSE_EXAMPLE}</pre>
          </div>
        </motion.div>

        {/* Scopes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.25 }}
          className="mb-12"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-400" />
            Erişim Kapsamları (Scopes)
          </h3>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-slate-800">
              {SCOPES.map((s) => (
                <div key={s.key} className="bg-slate-900 px-4 py-3">
                  <code className="text-[10px] text-sky-400 font-mono block mb-1">{s.key}</code>
                  <span className="text-xs text-slate-400">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Endpoints */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Code className="w-4 h-4 text-sky-400" />
            Endpoint Referansı
          </h3>
          <div className="space-y-3">
            {ENDPOINT_GROUPS.map((group) => (
              <EndpointGroup key={group.title} title={group.title} endpoints={group.endpoints} />
            ))}
          </div>
        </motion.div>

        {/* Rate limit & errors */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            <h4 className="text-sm font-semibold text-white mb-3">Hata Kodları</h4>
            <div className="space-y-2 text-xs">
              {[
                { code: '400', label: 'Geçersiz istek parametreleri' },
                { code: '401', label: 'Geçersiz veya eksik API anahtarı' },
                { code: '403', label: 'Yetersiz erişim kapsamı veya plan kısıtlaması' },
                { code: '404', label: 'Kaynak bulunamadı' },
                { code: '429', label: 'İstek limiti aşıldı' },
              ].map((e) => (
                <div key={e.code} className="flex items-center gap-3">
                  <code className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded font-mono">{e.code}</code>
                  <span className="text-slate-400">{e.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            <h4 className="text-sm font-semibold text-white mb-3">Plan Gereksinimleri</h4>
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">PRO</span>
                <span className="text-slate-400">API erişimi, anahtar yönetimi, tüm endpoint&apos;ler</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-500/20 text-violet-400">ENT</span>
                <span className="text-slate-400">Sınırsız istek, webhook desteği, özel entegrasyon</span>
              </div>
              <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                <p className="text-amber-400">Starter planında API erişimi bulunmamaktadır. Yükseltme için iletişime geçin.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
