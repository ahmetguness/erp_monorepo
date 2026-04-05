'use client';

import { useState, useCallback, useRef } from 'react';
import { Play, Copy, Check, Clock, Terminal, Wifi, WifiOff, ChevronRight, Braces, Send, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

interface EndpointDef {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  label: string;
  scope: string;
  hasBody: boolean;
  sampleBody?: string;
  params?: string;
  description?: string;
}

const ENDPOINT_GROUPS: { group: string; color: string; items: EndpointDef[] }[] = [
  {
    group: 'Ürünler', color: 'emerald',
    items: [
      { method: 'GET', path: '/api/external/products', label: 'Listele', scope: 'products:read', hasBody: false, params: '?page=1&limit=5', description: 'Tüm ürünleri sayfalı listeler' },
      { method: 'GET', path: '/api/external/products/:id', label: 'Detay', scope: 'products:read', hasBody: false, description: 'Tek ürün detayını getirir' },
    ],
  },
  {
    group: 'Cari Hesaplar', color: 'sky',
    items: [
      { method: 'GET', path: '/api/external/contacts', label: 'Listele', scope: 'contacts:read', hasBody: false, params: '?page=1&limit=5', description: 'Müşteri ve tedarikçileri listeler' },
      { method: 'GET', path: '/api/external/contacts/:id', label: 'Detay', scope: 'contacts:read', hasBody: false, description: 'Cari hesap detayı' },
    ],
  },
  {
    group: 'Faturalar', color: 'violet',
    items: [
      { method: 'GET', path: '/api/external/invoices', label: 'Listele', scope: 'invoices:read', hasBody: false, params: '?page=1&limit=5', description: 'Faturaları listeler' },
      { method: 'GET', path: '/api/external/invoices/:id', label: 'Detay', scope: 'invoices:read', hasBody: false, description: 'Fatura detayı ve satırları' },
    ],
  },
  {
    group: 'Stok', color: 'amber',
    items: [
      { method: 'GET', path: '/api/external/stock-levels', label: 'Seviyeler', scope: 'products:read', hasBody: false, params: '?page=1&limit=10', description: 'Depo bazlı stok seviyeleri' },
    ],
  },
  {
    group: 'Siparişler', color: 'rose',
    items: [
      { method: 'GET', path: '/api/external/sales-orders', label: 'Listele', scope: 'orders:read', hasBody: false, params: '?page=1&limit=5', description: 'Satış siparişlerini listeler' },
    ],
  },
];

const ALL_ENDPOINTS = ENDPOINT_GROUPS.flatMap((g) => g.items);

const METHOD_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  POST: { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
  PATCH: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
};

function sanitizeApiKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 128);
}

function isValidJson(str: string): boolean {
  if (!str.trim()) return true;
  try { JSON.parse(str); return true; } catch { return false; }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─────────────────────────────────────────────
// Syntax highlight (minimal)
// ─────────────────────────────────────────────

function highlightJson(json: string): string {
  return json
    .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="text-violet-400">$1</span>:')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="text-emerald-400">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="text-amber-400">$1</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-sky-400">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="text-slate-500">$1</span>');
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ApiPlayground() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'response' | 'curl' | null>(null);
  const [history, setHistory] = useState<Array<{ method: string; path: string; status: number; duration: number; time: string }>>([]);
  const responseRef = useRef<HTMLPreElement>(null);

  const endpoint = ALL_ENDPOINTS[selectedIdx];
  const methodStyle = METHOD_STYLES[endpoint.method];

  const handleSelect = useCallback((idx: number) => {
    setSelectedIdx(idx);
    setResponse(null);
    setStatusCode(null);
    setDuration(null);
    const ep = ALL_ENDPOINTS[idx];
    setBody(ep.sampleBody ?? '');
  }, []);

  const handleSend = useCallback(async () => {
    if (!apiKey.trim()) return;
    if (endpoint.hasBody && body.trim() && !isValidJson(body)) return;

    setLoading(true);
    setResponse(null);
    setStatusCode(null);

    const sanitizedKey = sanitizeApiKey(apiKey);
    const url = `${API_BASE}${endpoint.path}${endpoint.params ?? ''}`;
    const start = performance.now();

    try {
      const res = await fetch(url, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json', 'x-api-key': sanitizedKey },
        ...(endpoint.hasBody && body.trim() ? { body: body.trim() } : {}),
      });

      const elapsed = Math.round(performance.now() - start);
      setDuration(elapsed);
      setStatusCode(res.status);

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        setResponse(JSON.stringify(json, null, 2));
      } catch {
        setResponse(text);
      }

      setHistory((prev) => [
        { method: endpoint.method, path: endpoint.path, status: res.status, duration: elapsed, time: new Date().toLocaleTimeString('tr-TR') },
        ...prev.slice(0, 9),
      ]);
    } catch {
      const elapsed = Math.round(performance.now() - start);
      setDuration(elapsed);
      setStatusCode(0);
      setResponse(JSON.stringify({ error: 'Bağlantı hatası. Backend çalışıyor mu?' }, null, 2));
      setHistory((prev) => [
        { method: endpoint.method, path: endpoint.path, status: 0, duration: elapsed, time: new Date().toLocaleTimeString('tr-TR') },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  }, [apiKey, endpoint, body]);

  const handleCopy = (type: 'response' | 'curl', text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const curlCommand = `curl -X ${endpoint.method} "${API_BASE}${endpoint.path}${endpoint.params ?? ''}" \\\n  -H "x-api-key: ${apiKey || 'YOUR_API_KEY'}" \\\n  -H "Content-Type: application/json"${endpoint.hasBody && body.trim() ? ` \\\n  -d '${body.replace(/\n/g, '')}'` : ''}`;

  const statusColor = statusCode === null ? '' : statusCode >= 200 && statusCode < 300 ? 'text-emerald-400' : statusCode >= 400 ? 'text-red-400' : 'text-amber-400';
  const statusBg = statusCode === null ? '' : statusCode >= 200 && statusCode < 300 ? 'bg-emerald-500/10' : statusCode >= 400 ? 'bg-red-500/10' : 'bg-amber-500/10';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden min-h-[600px]">

      {/* ─── Left Panel: Endpoints ─── */}
      <div className="border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
        {/* API Key */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${apiKey.trim() ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">API Key</span>
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="sk_live_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 pr-16"
              autoComplete="off"
              spellCheck={false}
            />
            <button onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors px-1.5 py-0.5 rounded bg-slate-700/50">
              {showKey ? 'Gizle' : 'Göster'}
            </button>
          </div>
        </div>

        {/* Endpoint list */}
        <div className="p-2">
          {ENDPOINT_GROUPS.map((group) => (
            <div key={group.group} className="mb-3">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-2 mb-1">{group.group}</p>
              {group.items.map((ep) => {
                const idx = ALL_ENDPOINTS.indexOf(ep);
                const isSelected = idx === selectedIdx;
                const ms = METHOD_STYLES[ep.method];
                return (
                  <button key={idx} onClick={() => handleSelect(idx)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all mb-0.5 ${
                      isSelected ? 'bg-slate-800 ring-1 ring-sky-500/20' : 'hover:bg-slate-800/40'
                    }`}>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ms.bg} ${ms.text} w-11 text-center`}>{ep.method}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium block ${isSelected ? 'text-white' : 'text-slate-400'}`}>{ep.label}</span>
                    </div>
                    {isSelected && <ChevronRight className="w-3 h-3 text-sky-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="border-t border-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Geçmiş</span>
              <button onClick={() => setHistory([])} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded-md bg-slate-800/30">
                  <span className={`font-bold ${h.status >= 200 && h.status < 300 ? 'text-emerald-400' : 'text-red-400'}`}>{h.status || 'ERR'}</span>
                  <span className="text-slate-500 font-mono truncate flex-1">{h.method} {h.path}</span>
                  <span className="text-slate-600">{h.duration}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Right Panel: Request & Response ─── */}
      <div className="flex flex-col overflow-hidden">

        {/* Info bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-sky-500/5 border-b border-sky-500/10 text-[11px] text-sky-400/80">
          <Terminal className="w-3 h-3 flex-shrink-0" />
          Salt okunur mod — Playground sadece GET isteklerini destekler. Yazma işlemleri için cURL veya kendi entegrasyonunuzu kullanın.
        </div>

        {/* Request header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800 bg-slate-900/80">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${methodStyle.bg} ${methodStyle.text}`}>{endpoint.method}</span>
          <code className="text-sm text-white font-mono flex-1 truncate">{endpoint.path}<span className="text-slate-600">{endpoint.params ?? ''}</span></code>
          <Button size="sm" onClick={handleSend} loading={loading}
            disabled={!apiKey.trim() || (endpoint.hasBody && body.trim() !== '' && !isValidJson(body))}
            className="gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Gönder
          </Button>
        </div>

        {/* Endpoint info */}
        <div className="px-5 py-3 border-b border-slate-800/50 flex items-center gap-4">
          <span className="text-xs text-slate-400">{endpoint.description}</span>
          <span className="ml-auto text-[10px] font-mono text-slate-600 bg-slate-800/60 px-2 py-0.5 rounded">scope: {endpoint.scope}</span>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">

          {/* Body editor */}
          {endpoint.hasBody && (
            <div className="px-5 py-4 border-b border-slate-800/50">
              <div className="flex items-center gap-2 mb-2">
                <Braces className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-medium text-slate-400">Request Body</span>
                {body.trim() && !isValidJson(body) && (
                  <span className="text-[10px] text-red-400 ml-auto">Geçersiz JSON</span>
                )}
              </div>
              <div className="relative">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-xs text-slate-300 font-mono resize-none focus:outline-none focus:ring-1 leading-relaxed ${
                    body.trim() && !isValidJson(body) ? 'border-red-500/40 focus:ring-red-500/20' : 'border-slate-800 focus:border-sky-500/40 focus:ring-sky-500/20'
                  }`}
                />
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button onClick={() => { try { setBody(JSON.stringify(JSON.parse(body), null, 2)); } catch {} }}
                    className="text-[10px] text-slate-600 hover:text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/80 transition-colors">
                    Format
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Response */}
          <div className="px-5 py-4" ref={responseRef}>
            {/* Status bar */}
            {statusCode !== null && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  {statusCode >= 200 && statusCode < 300 ? (
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className={`text-sm font-bold font-mono ${statusColor}`}>{statusCode || 'ERR'}</span>
                  <span className="text-xs text-slate-500">
                    {statusCode === 200 ? 'OK' : statusCode === 201 ? 'Created' : statusCode === 400 ? 'Bad Request' : statusCode === 401 ? 'Unauthorized' : statusCode === 403 ? 'Forbidden' : statusCode === 404 ? 'Not Found' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Clock className="w-3 h-3 text-slate-600" />
                  <span className="text-xs text-slate-500 font-mono">{duration}ms</span>
                </div>
                {response && (
                  <span className="text-[10px] text-slate-600">{(new TextEncoder().encode(response).length / 1024).toFixed(1)} KB</span>
                )}
              </div>
            )}

            {response ? (
              <div className="relative group">
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => handleCopy('response', response)}
                    className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition-colors">
                    {copied === 'response' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied === 'response' ? 'Kopyalandı' : 'Kopyala'}
                  </button>
                </div>
                <pre
                  className={`${statusBg} border border-slate-800 rounded-xl p-4 text-xs font-mono overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed`}
                  dangerouslySetInnerHTML={{ __html: highlightJson(response) }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4">
                  <Terminal className="w-5 h-5 text-slate-600" />
                </div>
                <p className="text-sm text-slate-500 mb-1">Yanıt bekleniyor</p>
                <p className="text-xs text-slate-600">Bir endpoint seçin ve API anahtarınızla istek gönderin</p>
              </div>
            )}
          </div>

          {/* cURL */}
          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">cURL</span>
              </div>
              <button onClick={() => handleCopy('curl', curlCommand)}
                className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-300 transition-colors">
                {copied === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied === 'curl' ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] text-slate-500 font-mono overflow-x-auto whitespace-pre leading-relaxed">{curlCommand}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
