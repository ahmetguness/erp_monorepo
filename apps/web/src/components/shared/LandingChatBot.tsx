'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, X, Send, Loader2, Sparkles, User,
  Trash2, Copy, Check, CheckCircle, AlertCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: boolean;
  demoSuccess?: boolean;
}

const QUICK_QUESTIONS = [
  'Axon ERP ne işe yarar?',
  'Fiyatlandırma nasıl?',
  'Demo görebilir miyim?',
  'Hangi modüller var?',
];

// ─────────────────────────────────────────────
// rAF-based smooth streaming hook
// ─────────────────────────────────────────────

function useSmoothStream() {
  const [displayed, setDisplayed] = useState('');
  const pendingRef = useRef('');
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    setDisplayed(pendingRef.current);
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

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return { displayed, append, reset };
}

// ─────────────────────────────────────────────
// Copy button
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
      aria-label="Kopyala" title="Kopyala"
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
            ? <code className="bg-slate-700/50 px-1 py-0.5 rounded text-xs text-blue-300">{children}</code>
            : <code className="block bg-slate-800 p-2 rounded text-xs overflow-x-auto my-1">{children}</code>;
        },
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{children}</a>
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

export function LandingChatBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome', role: 'assistant', timestamp: new Date(),
      content: 'Merhaba! 👋 Ben Axon ERP asistanıyım. Ürünümüz, fiyatlandırma veya özellikler hakkında sorularınızı yanıtlayabilirim.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const { displayed: streamingContent, append: appendStream, reset: resetStream } = useSmoothStream();
  const [sessionId] = useState(() => `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const clearChat = () => {
    setMessages([{
      id: 'welcome', role: 'assistant', timestamp: new Date(),
      content: 'Sohbet temizlendi. Size nasıl yardımcı olabilirim?',
    }]);
  };

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    resetStream();

    try {
      const res = await fetch(`${API_URL}/api/public/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sessionId }),
      });

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

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream okunamadı');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
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
            } else if (currentEvent === 'done') {
              gotDone = true;
              try {
                const { output } = JSON.parse(data);
                const reply = output || accumulated;
                if (reply) {
                  const demoSuccess = /demo\s*(hesabınız|ortamınız)\s*(hazırlan|oluşturul|başarıyla)/i.test(reply)
                    && !/oluşturulamadı|hata|başarısız/i.test(reply);
                  setMessages((prev) => [...prev, {
                    id: `a-${Date.now()}`, role: 'assistant', content: reply,
                    timestamp: new Date(), demoSuccess,
                  }]);
                }
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

      if (!gotDone) {
        if (accumulated) {
          const demoSuccess = /demo\s*(hesabınız|ortamınız)\s*(hazırlan|oluşturul|başarıyla)/i.test(accumulated)
            && !/oluşturulamadı|hata|başarısız/i.test(accumulated);
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant', content: accumulated,
            timestamp: new Date(), demoSuccess,
          }]);
        } else {
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
            content: 'Yanıt alınamadı. Lütfen tekrar deneyin.', error: true,
          }]);
        }
        resetStream();
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
        content: 'Üzgünüm, şu an yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.', error: true,
      }]);
      resetStream();
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, appendStream, resetStream]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Dışarıdan chatbot'a mesaj göndermek için global event dinle
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        setOpen(true);
        setTimeout(() => sendMessage(detail), 300);
      }
    };
    window.addEventListener('openChatWithMessage', handler);
    return () => window.removeEventListener('openChatWithMessage', handler);
  }, [sendMessage]);

  const showQuickQuestions = messages.length <= 1 && !loading;

  // ── Kapalı durum ──
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 z-[90] w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 hover:scale-105 transition-all flex items-center justify-center group"
        aria-label="Chatbot aç">
        <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0F172A] animate-pulse" />
      </button>
    );
  }

  // ── Açık durum ──
  return (
    <div className="fixed bottom-4 right-4 z-[90] w-[calc(100vw-2rem)] max-w-[380px] h-[min(540px,calc(100vh-6rem))] rounded-2xl bg-[#0F172A] border border-slate-700/50 shadow-2xl shadow-black/50 flex flex-col overflow-hidden sm:w-[380px]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 flex-shrink-0">
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0F172A]" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Axon ERP</h3>
          <p className="text-[10px] text-blue-400">Satış Asistanı</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={clearChat}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            aria-label="Sohbeti temizle" title="Sohbeti temizle">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
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
              msg.role === 'user'
                ? 'bg-blue-500/20'
                : msg.error ? 'bg-red-500/20'
                : msg.demoSuccess ? 'bg-emerald-500/20'
                : 'bg-slate-800'
            }`}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5 text-blue-400" />
                : msg.demoSuccess
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  : msg.error
                    ? <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              }
            </div>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : msg.error
                    ? 'bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20'
                    : msg.demoSuccess
                      ? 'bg-emerald-500/10 text-emerald-200 rounded-bl-md border border-emerald-500/20'
                      : 'bg-slate-800/80 text-slate-200 rounded-bl-md border border-slate-700/50'
              }`}>
                {msg.role === 'user'
                  ? msg.content
                  : <ChatMarkdown content={msg.content} />
                }
              </div>

              {/* Meta row */}
              <div className={`flex items-center gap-1.5 mt-1 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.demoSuccess && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-500">
                    <CheckCircle className="w-2.5 h-2.5" /> Demo oluşturuldu
                  </span>
                )}
                {msg.role === 'assistant' && msg.id !== 'welcome' && !msg.error && (
                  <CopyButton text={msg.content} />
                )}
                <p className="text-[10px] text-slate-600">
                  {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Quick questions */}
        {showQuickQuestions && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Hızlı Sorular</p>
            {QUICK_QUESTIONS.map((q) => (
              <button key={q} onClick={() => sendMessage(q)}
                className="block w-full text-left px-3 py-2 rounded-xl text-xs text-slate-300 bg-slate-800/50 border border-slate-700/30 hover:bg-slate-800 hover:border-blue-500/30 transition-all">
                {q}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-md px-4 py-3">
              {streamingContent ? (
                <div className="max-w-[85%]">
                  <div className="text-sm leading-relaxed text-slate-200">
                    <ChatMarkdown content={streamingContent} />
                    <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 focus-within:border-blue-500/40 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Bir soru sorun..."
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none py-1.5 disabled:opacity-50"
            autoComplete="off"
          />
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:hover:bg-blue-600 transition-all flex-shrink-0"
            aria-label="Gönder">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[9px] text-slate-700 text-center mt-1.5">Axon ERP — Satış ve ürün bilgilendirme asistanı</p>
      </div>
    </div>
  );
}
