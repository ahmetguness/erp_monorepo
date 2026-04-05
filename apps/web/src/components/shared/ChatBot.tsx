'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2, Maximize2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ?? '';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ChatBot() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: 'Merhaba! Size nasıl yardımcı olabilirim?', timestamp: new Date() },
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      if (!N8N_WEBHOOK_URL) {
        // n8n URL yapılandırılmamışsa fallback
        setTimeout(() => {
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
            content: 'Chatbot henüz yapılandırılmamış. NEXT_PUBLIC_N8N_WEBHOOK_URL ortam değişkenini ayarlayın.',
          }]);
          setLoading(false);
        }, 500);
        return;
      }

      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: `${tenant?.id ?? 'anon'}-${user?.id ?? 'anon'}`,
          context: {
            userName: user?.name ?? 'Kullanıcı',
            tenantName: tenant?.companyName ?? '',
            plan: tenant?.plan ?? 'STARTER',
          },
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const reply = data.output ?? data.response ?? data.message ?? data.text ?? JSON.stringify(data);

      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', content: reply, timestamp: new Date(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
        content: 'Üzgünüm, şu an yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, user, tenant]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

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
            <Bot className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Axon Asistan</h3>
          <p className="text-[10px] text-emerald-400">Çevrimiçi</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors hidden sm:flex"
            aria-label={expanded ? 'Küçült' : 'Büyüt'}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => { setOpen(false); setExpanded(false); }}
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
              msg.role === 'user' ? 'bg-sky-500/20' : 'bg-slate-800'
            }`}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5 text-sky-400" />
                : <Bot className="w-3.5 h-3.5 text-slate-400" />
              }
            </div>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-sky-500 text-white rounded-br-md'
                  : 'bg-slate-800/80 text-slate-200 rounded-bl-md border border-slate-700/50'
              }`}>
                {msg.content.split('\n').map((line, i) => (
                  <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
                ))}
              </div>
              <p className={`text-[10px] text-slate-600 mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
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
            placeholder="Mesajınızı yazın..."
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none py-1.5 disabled:opacity-50"
            autoComplete="off"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-30 disabled:hover:bg-sky-500 transition-all flex-shrink-0"
            aria-label="Gönder"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[9px] text-slate-700 text-center mt-1.5">Axon AI Asistan — Yanıtlar bilgilendirme amaçlıdır</p>
      </div>
    </div>
  );
}
