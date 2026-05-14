'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, X, Send, Bot, User, Loader2, Minimize2, Maximize2,
  Trash2, Database, Copy, Check, RefreshCw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '@/store/auth.store';
import { clearChatHistory, openChatStream } from '@/services/chat.service';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  usedData?: boolean;
  suggestions?: string[];
  error?: boolean;
}

const STORAGE_KEY_PREFIX = 'axon_chat_messages_';

// ─────────────────────────────────────────────
// rAF-based smooth streaming hook
// ─────────────────────────────────────────────

/**
 * Token'ları bir pending buffer'da biriktirir, requestAnimationFrame ile
 * frame başına bir kez state'e yazar. Böylece React re-render sayısı
 * token sayısından bağımsız, 60fps ile sınırlı kalır.
 */
function useSmoothStream() {
  const [displayed, setDisplayed] = useState('');
  const pendingRef = useRef('');
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const next = pendingRef.current;
    setDisplayed(next);
  }, []);

  const append = useCallback((token: string) => {
    pendingRef.current += token;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  const reset = useCallback((value = '') => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = value;
    setDisplayed(value);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return { displayed, append, reset };
}

const QUICK_ACTIONS = [
  { label: 'Bugünkü özet', message: 'Bugünkü genel durumu özetle: satış, gider, gecikmiş faturalar, bekleyen ödemeler ve stok uyarıları' },
  { label: 'Gecikmiş faturalar', message: 'Vadesi geçmiş tüm faturaları listele, kaç gün geciktiğini ve toplam tutarı göster' },
  { label: 'Riskli cariler', message: 'Kredi limitini aşan riskli cari hesapları göster' },
  { label: 'Stok uyarıları', message: 'Minimum stok seviyesinin altındaki ürünleri listele' },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Yanıttan suggestions JSON'ını ayıkla */
function parseSuggestions(text: string): { content: string; suggestions: string[] } {
  const separator = text.lastIndexOf('\n---\n');
  if (separator === -1) return { content: text, suggestions: [] };

  const before = text.slice(0, separator).trim();
  const after = text.slice(separator + 5).trim();

  try {
    const parsed = JSON.parse(after);
    if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
      return { content: before, suggestions: parsed.suggestions.slice(0, 3) };
    }
  } catch { /* JSON parse hatası — suggestions yok say */ }

  return { content: text, suggestions: [] };
}

/** localStorage'dan mesajları yükle */
function loadMessages(userId?: string): Message[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((m: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string; usedData?: boolean; suggestions?: string[]; error?: boolean }) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch { return null; }
}

/** localStorage'a mesajları kaydet */
function saveMessages(messages: Message[], userId?: string) {
  if (!userId) return;
  try {
    const toSave = messages.slice(-50);
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(toSave));
  } catch { /* quota aşımı vb. */ }
}

// ─────────────────────────────────────────────
// Copy button component
// ─────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API kullanılamıyor */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
      aria-label="Kopyala"
      title="Kopyala"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─────────────────────────────────────────────
// Markdown renderer
// ─────────────────────────────────────────────

function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-slate-200">{children}</li>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-700/50">{children}</thead>,
        th: ({ children }) => <th className="px-2 py-1 text-left text-slate-300 font-medium border-b border-slate-600">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 text-slate-200 border-b border-slate-700/50">{children}</td>,
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline
            ? <code className="bg-slate-700/50 px-1 py-0.5 rounded text-xs text-sky-300">{children}</code>
            : <code className="block bg-slate-800 p-2 rounded text-xs overflow-x-auto my-1">{children}</code>;
        },
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function ChatBot() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const { displayed: streamingContent, append: appendStream, reset: resetStream } = useSmoothStream();
  const [fetchingData, setFetchingData] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const prevUserIdRef = useRef<string | undefined>(undefined);

  // ── Kullanıcı değişimi algıla — hesap değiştiğinde sohbeti sıfırla ──
  useEffect(() => {
    const currentUserId = user?.id;
    const prevUserId = prevUserIdRef.current;

    // İlk yükleme değilse ve kullanıcı değiştiyse
    if (prevUserId !== undefined && prevUserId !== currentUserId) {
      const name = user?.name?.split(' ')[0] ?? 'Merhaba';
      setMessages([{
        id: 'welcome', role: 'assistant', timestamp: new Date(),
        content: `Merhaba ${name}! 👋 Ben Axon ERP asistanınızım. Cari hesaplar, faturalar, stok ve raporlar hakkında sorularınızı yanıtlayabilirim.`,
      }]);
    }

    prevUserIdRef.current = currentUserId;
  }, [user?.id, user?.name]);

  // ── Başlangıç: localStorage'dan yükle veya welcome mesajı ──
  useEffect(() => {
    if (messages.length > 0) return;
    const saved = loadMessages(user?.id);
    if (saved && saved.length > 0) {
      setMessages(saved);
    } else {
      const name = user?.name?.split(' ')[0] ?? 'Merhaba';
      setMessages([{
        id: 'welcome', role: 'assistant', timestamp: new Date(),
        content: `Merhaba ${name}! 👋 Ben Axon ERP asistanınızım. Cari hesaplar, faturalar, stok ve raporlar hakkında sorularınızı yanıtlayabilirim.`,
      }]);
    }
  }, [user, messages.length]);

  // ── Mesajlar değişince localStorage'a kaydet ──
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages, user?.id);
  }, [messages, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // ── Sohbet temizle (frontend + backend) ──
  const clearChat = useCallback(async () => {
    const name = user?.name?.split(' ')[0] ?? 'Merhaba';
    setMessages([{
      id: 'welcome', role: 'assistant', timestamp: new Date(),
      content: `Sohbet temizlendi. Size nasıl yardımcı olabilirim, ${name}?`,
    }]);
    localStorage.removeItem(STORAGE_KEY_PREFIX + (user?.id ?? ''));

    // Backend conversation history'yi de temizle
    try {
      clearChatHistory().catch(() => {});
    } catch { /* sessizce geç */ }
  }, [user]);

  // ── Mesaj gönder (SSE streaming) ──
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    resetStream();
    setFetchingData(false);


    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await openChatStream(msg, abort.signal);

      // Non-streaming hata yanıtları
      if (!res.ok) {
        const errData: Record<string, unknown> = await res.json().catch(() => ({}));
        const errMsg = typeof errData.error === 'string' ? errData.error : `Hata: ${res.status}`;
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
          content: errMsg, error: true,
        }]);
        setLoading(false);
        return;
      }

      // SSE stream okuma
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream okunamadı');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let usedTools = false;
      let currentEvent = '';
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();

            if (currentEvent === 'token') {
              try {
                const { token: t } = JSON.parse(data);
                accumulated += t;
                appendStream(t);
              } catch { /* */ }
            } else if (currentEvent === 'tool_start') {
              setFetchingData(true);
              usedTools = true;
            } else if (currentEvent === 'done') {
              gotDone = true;
              try {
                const { output, usedTools: ut } = JSON.parse(data);
                const finalOutput = output || accumulated || 'Yanıt alınamadı.';
                const { content, suggestions } = parseSuggestions(finalOutput);
                setMessages((prev) => [...prev, {
                  id: `a-${Date.now()}`, role: 'assistant', content,
                  timestamp: new Date(), usedData: ut || usedTools, suggestions,
                }]);
              } catch { /* */ }
              resetStream();
              accumulated = '';
            } else if (currentEvent === 'error') {
              gotDone = true;
              try {
                const { error: errText } = JSON.parse(data);
                setMessages((prev) => [...prev, {
                  id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
                  content: errText, error: true,
                }]);
              } catch { /* */ }
              resetStream();
              accumulated = '';
            }

            currentEvent = '';
          }
        }
      }

      // Stream bitti ama done event gelmemişse — accumulated'ı mesaj olarak ekle
      if (!gotDone) {
        if (accumulated) {
          const { content, suggestions } = parseSuggestions(accumulated);
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant', content,
            timestamp: new Date(), usedData: usedTools, suggestions,
          }]);
        } else {
          // Hiçbir veri gelmedi — hata mesajı göster
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
            content: 'Yanıt alınamadı. Lütfen tekrar deneyin.', error: true,
          }]);
        }
        resetStream();
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Kullanıcı iptal etti
        if (streamingContent) {
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant', content: streamingContent,
            timestamp: new Date(),
          }]);
          resetStream();
        }
      } else {
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
          content: 'Üzgünüm, şu an yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.', error: true,
        }]);
        resetStream();
      }
    } finally {
      setLoading(false);
      setFetchingData(false);
      abortRef.current = null;
    }
  }, [input, loading, streamingContent, appendStream, resetStream]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const showQuickActions = messages.length <= 1 && !loading;

  // ── Kapalı durum ──
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 hover:scale-105 transition-all flex items-center justify-center group"
        aria-label="Chatbot aç">
        <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse" />
      </button>
    );
  }

  // ── Açık durum ──
  return (
    <div className={`fixed z-50 transition-all duration-300 ${
      expanded
        ? 'bottom-0 right-0 w-full h-full sm:bottom-4 sm:right-4 sm:w-[520px] sm:h-[700px] sm:rounded-2xl'
        : 'bottom-4 right-4 w-[380px] h-[540px] rounded-2xl'
    } bg-slate-900 border border-slate-800 shadow-2xl shadow-black/40 flex flex-col overflow-hidden`}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm flex-shrink-0">
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white">Axon Asistan</h3>
          <p className="text-[10px] text-slate-500 truncate">{tenant?.companyName ?? 'ERP Asistanı'}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={clearChat}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            aria-label="Sohbeti temizle" title="Sohbeti temizle">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors hidden sm:flex"
            aria-label={expanded ? 'Küçült' : 'Büyüt'}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => { setOpen(false); setExpanded(false); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            aria-label="Kapat">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === 'user' ? 'bg-sky-500/20' : msg.error ? 'bg-red-500/20' : 'bg-slate-800'
            }`}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5 text-sky-400" />
                : <Bot className={`w-3.5 h-3.5 ${msg.error ? 'text-red-400' : 'text-slate-400'}`} />
              }
            </div>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-sky-500 text-white rounded-br-md'
                  : msg.error
                    ? 'bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20'
                    : 'bg-slate-800/80 text-slate-200 rounded-bl-md border border-slate-700/50'
              }`}>
                {msg.role === 'user'
                  ? msg.content
                  : <ChatMarkdown content={msg.content} />
                }
              </div>

              {/* Meta row: badges + copy */}
              <div className={`flex items-center gap-1.5 mt-1 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.usedData && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] text-sky-500">
                    <Database className="w-2.5 h-2.5" /> ERP verisi
                  </span>
                )}
                {msg.role === 'assistant' && msg.id !== 'welcome' && !msg.error && (
                  <CopyButton text={msg.content} />
                )}
                <p className="text-[10px] text-slate-600">
                  {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {/* Suggested follow-ups */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.suggestions.map((s, i) => (
                    <button key={i} onClick={() => sendMessage(s)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-300 hover:bg-slate-800 hover:border-sky-500/30 transition-all text-left">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Quick actions */}
        {showQuickActions && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Hızlı İşlemler</p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.map((q) => (
                <button key={q.label} onClick={() => sendMessage(q.message)}
                  className="text-left px-2.5 py-2 rounded-xl text-[11px] text-slate-300 bg-slate-800/50 border border-slate-700/30 hover:bg-slate-800 hover:border-sky-500/30 transition-all">
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Streaming content */}
        {streamingContent && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="max-w-[85%]">
              <div className="inline-block px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm leading-relaxed bg-slate-800/80 text-slate-200 border border-slate-700/50">
                <ChatMarkdown content={streamingContent} />
                <span className="inline-block w-1.5 h-4 bg-sky-400 animate-pulse ml-0.5 align-middle" />
              </div>
            </div>
          </div>
        )}

        {/* Loading: veri çekiliyor veya düşünüyor */}
        {loading && !streamingContent && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-md px-4 py-3">
              {fetchingData ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>ERP verisi çekiliyor...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 focus-within:border-sky-500/40 focus-within:ring-1 focus-within:ring-sky-500/20 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cari sorgula, rapor iste, stok kontrol et..."
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none py-1.5 disabled:opacity-50"
            autoComplete="off"
          />
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-30 disabled:hover:bg-sky-500 transition-all flex-shrink-0"
            aria-label="Gönder">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[9px] text-slate-700 text-center mt-1.5">Axon AI — ERP verilerinize erişerek yanıt verir</p>
      </div>
    </div>
  );
}
