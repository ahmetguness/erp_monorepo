'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles } from 'lucide-react';

const N8N_PUBLIC_URL = process.env.NEXT_PUBLIC_N8N_PUBLIC_WEBHOOK_URL ?? '';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  'Axon ERP ne işe yarar?',
  'Fiyatlandırma nasıl?',
  'Demo görebilir miyim?',
  'Hangi modüller var?',
];

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
  const [sessionId] = useState(() => `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      if (!N8N_PUBLIC_URL) {
        setTimeout(() => {
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
            content: 'Chatbot henüz yapılandırılmamış. Lütfen NEXT_PUBLIC_N8N_PUBLIC_WEBHOOK_URL ortam değişkenini ayarlayın.',
          }]);
          setLoading(false);
        }, 500);
        return;
      }

      const res = await fetch(N8N_PUBLIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sessionId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') ?? '';
      let reply: string;

      if (contentType.includes('application/json')) {
        const data = await res.json();
        reply = data.output ?? data.response ?? data.message ?? data.text ?? JSON.stringify(data);
      } else {
        reply = await res.text();
      }

      if (!reply || reply.trim() === '') throw new Error('Empty response');

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
  }, [input, loading, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const showQuickQuestions = messages.length <= 1 && !loading;

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

  return (
    <div className="fixed bottom-4 right-4 z-[90] w-[380px] h-[540px] rounded-2xl bg-[#0F172A] border border-slate-700/50 shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
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
        <button onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Kapat">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === 'user' ? 'bg-blue-500/20' : 'bg-slate-800'
            }`}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5 text-blue-400" />
                : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              }
            </div>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
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
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
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
