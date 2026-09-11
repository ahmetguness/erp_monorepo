'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  CheckCircle,
  CheckCircle2,
  CheckCheck,
  MessageSquare,
  ShieldCheck,
  User,
  AlertCircle,
  Clock,
  Wrench,
  CreditCard,
  Sparkles,
  HelpCircle,
  CornerDownLeft,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  getTenantTicket,
  addTenantTicketMessage,
  closeTenantTicket,
  reopenTenantTicket,
} from '@/services/support-ticket.service';
import { formatDateTime } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import {
  CATEGORY_LABELS,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  formatRelativeTime,
  formatClockTime,
  formatChatDateHeader,
  getErrorMessage,
} from './ticket-ui';
import { TicketLifecycleStepper } from './TicketLifecycleStepper';
import type { PlatformTicketCategory } from '@repo/types';

interface TicketDetailPageProps {
  ticketId?: string;
}

const CATEGORY_ICON_MAP: Record<PlatformTicketCategory, React.ComponentType<{ className?: string }>> = {
  TECHNICAL: Wrench,
  BILLING: CreditCard,
  ACCOUNT: ShieldCheck,
  FEATURE_REQUEST: Sparkles,
  OTHER: HelpCircle,
};

export function TicketDetailPage({ ticketId: propTicketId }: TicketDetailPageProps) {
  const routeParams = useParams<{ id?: string }>();
  const ticketId = propTicketId || routeParams?.id || '';

  const { toast } = useUIStore();
  const client = useQueryClient();

  const [replyMessage, setReplyMessage] = useState('');
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const {
    data: ticket,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['tenant-ticket', ticketId],
    queryFn: () => getTenantTicket(ticketId),
    enabled: Boolean(ticketId),
    refetchInterval: 12000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages.length]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const replyMutation = useMutation({
    mutationFn: () => addTenantTicketMessage(ticketId, replyMessage.trim()),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      setReplyMessage('');
      setActionError(null);
      toast.success('Yanıtınız iletildi.');
      void client.invalidateQueries({ queryKey: ['tenant-ticket', ticketId] });
      void client.invalidateQueries({ queryKey: ['tenant-tickets'] });
    },
    onError: (err: unknown) => {
      const errorMsg = getErrorMessage(err, 'Yanıt gönderilemedi.');
      setActionError(errorMsg);
      toast.error(errorMsg);
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => closeTenantTicket(ticketId),
    onSuccess: () => {
      toast.success('Destek talebi başarıyla kapatıldı.');
      setIsCloseDialogOpen(false);
      void client.invalidateQueries({ queryKey: ['tenant-ticket', ticketId] });
      void client.invalidateQueries({ queryKey: ['tenant-tickets'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Talep kapatılamadı.'));
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenTenantTicket(ticketId),
    onSuccess: () => {
      toast.success('Destek talebi yeniden açıldı. Mesajınızı iletebilirsiniz.');
      setActionError(null);
      void client.invalidateQueries({ queryKey: ['tenant-ticket', ticketId] });
      void client.invalidateQueries({ queryKey: ['tenant-tickets'] });
    },
    onError: (err: unknown) => {
      const errorMsg = getErrorMessage(err, 'Talep yeniden açılamadı.');
      setActionError(errorMsg);
      toast.error(errorMsg);
    },
  });

  const handleSendReply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyMessage.trim() || replyMutation.isPending) return;
    replyMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendReply();
    }
  };

  if (isLoading || !ticketId) {
    return (
      <div className="flex h-72 flex-col items-center justify-center text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent mb-3" />
        <span className="text-xs text-slate-400">Destek talebi detayları yükleniyor...</span>
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-10 text-center text-slate-300">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
        <h3 className="mt-3 text-base font-bold text-white">Destek talebi bulunamadı</h3>
        <p className="mt-1 text-xs text-slate-400">
          Talep silinmiş olabilir veya bu bilet işletmenize ait değil.
        </p>
        <Link href="/dashboard/tickets" className="mt-5 inline-block">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Taleplere Dön
          </Button>
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status] || {
    label: ticket.status,
    variant: 'neutral',
    dotClass: 'bg-slate-400',
    badgeClass: 'border-slate-700 bg-slate-800 text-slate-300',
    description: '',
  };

  const priorityConfig = PRIORITY_CONFIG[ticket.priority] || {
    label: ticket.priority,
    variant: 'neutral',
    borderColor: 'border-slate-700',
    textColor: 'text-slate-400',
    dotColor: 'bg-slate-400',
    bgSoft: 'bg-slate-800/40',
  };

  const isClosed = ticket.status === 'CLOSED';
  const isResolved = ticket.status === 'RESOLVED';
  const isWaitingTenant = ticket.status === 'WAITING_TENANT';
  const CategoryIcon = CATEGORY_ICON_MAP[ticket.category] || HelpCircle;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top navigation & action bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/tickets"
          className="group inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/80 group-hover:bg-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          Tüm Taleplere Dön
        </Link>

        {!isClosed && !isResolved && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCloseDialogOpen(true)}
            leftIcon={<CheckCircle className="h-4 w-4 text-emerald-400" />}
            className="hover:border-emerald-500/40 hover:text-emerald-300"
          >
            Talebi Kapat
          </Button>
        )}
      </div>

      {/* Visual Status Stepper */}
      <TicketLifecycleStepper
        status={ticket.status}
        createdAt={ticket.createdAt}
        resolvedAt={ticket.resolvedAt}
        closedAt={ticket.closedAt}
      />

      {/* Action banner if tenant response is waiting */}
      {isWaitingTenant && (
        <div className="rounded-2xl border border-rose-800/50 bg-gradient-to-r from-rose-950/40 via-rose-900/20 to-slate-900/80 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertCircle className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-rose-300">Destek Uzmanından Yanıt Geldi</h4>
              <p className="text-[11px] text-slate-300">
                Talebinizin çözüme kavuşturulabilmesi için uzmanımızın ilettiği mesaja yanıt vermeniz bekleniyor.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Header Card */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-sky-400 bg-sky-950/50 px-2.5 py-1 rounded-lg border border-sky-800/60">
              {ticket.ticketNumber}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${statusConfig.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`} />
              {statusConfig.label}
            </span>

            <Badge variant={priorityConfig.variant}>{priorityConfig.label} Öncelik</Badge>

            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/60">
              <CategoryIcon className="h-3.5 w-3.5 text-slate-400" />
              {CATEGORY_LABELS[ticket.category] || ticket.category}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span>Açılış: {formatRelativeTime(ticket.createdAt)} ({formatDateTime(ticket.createdAt)})</span>
          </div>
        </div>

        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">{ticket.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 pt-3 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-slate-500">Talep Sahibi:</span>
            <span className="text-slate-200 font-medium">{ticket.createdByUser?.name || '-'}</span>
          </div>

          {ticket.assignedAdmin && (
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-slate-500">İlgilenen Destek Uzmanı:</span>
              <span className="text-sky-300 font-semibold">{ticket.assignedAdmin.name}</span>
            </div>
          )}

          {ticket.resolvedAt && (
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-slate-500">Çözümlenme:</span>
              <span className="text-emerald-400 font-medium">{formatDateTime(ticket.resolvedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Thread - WhatsApp Style */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
            Yazışma Geçmişi ({ticket.messages.length})
          </h2>
          <span className="text-[11px] text-slate-500">Uçtan uca platform güvenceli</span>
        </div>

        {/* WhatsApp-style Chat Board with scroll and auto-jump */}
        <div className="relative">
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-4 sm:p-5 space-y-3.5 min-h-[260px] max-h-[520px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800 hover:scrollbar-thumb-slate-700 scrollbar-track-transparent scroll-smooth shadow-inner"
          >
            {/* Centered Date Pill - Sticky at top */}
            <div className="sticky top-0 z-10 flex justify-center py-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/95 border border-slate-700/80 px-3 py-0.5 text-[11px] font-medium text-slate-300 shadow-md backdrop-blur-sm">
                <Clock className="h-3 w-3 text-emerald-400" />
                {formatChatDateHeader(ticket.createdAt)}
              </span>
            </div>

            {ticket.messages.map((msg) => {
              const isAdmin = msg.senderType === 'ADMIN_USER';

              return (
                <div
                  key={msg.id}
                  className={`flex w-full ${isAdmin ? 'justify-start' : 'justify-end'}`}
                >
                  {isAdmin ? (
                    /* Admin (Incoming from Left) */
                    <div className="flex items-end gap-2 max-w-[88%] sm:max-w-[72%] md:max-w-[65%]">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm ring-2 ring-sky-500/20 mb-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </div>

                      <div className="relative rounded-2xl rounded-bl-xs border border-slate-700/80 bg-slate-800 text-slate-100 p-3.5 shadow-lg shadow-black/30 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-sky-400">
                            {msg.authorAdmin?.name || 'Destek Uzmanı'}
                          </span>
                          <span className="rounded bg-sky-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-sky-300 border border-sky-500/30">
                            Yetkili
                          </span>
                        </div>

                        <div className="text-xs sm:text-sm text-slate-100 whitespace-pre-wrap leading-relaxed break-words">
                          {msg.message}
                        </div>

                        <div className="flex items-center justify-end gap-1 select-none pt-0.5 text-[10px] text-slate-400 font-mono">
                          <span title={formatRelativeTime(msg.createdAt)}>{formatClockTime(msg.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Tenant / Siz (Outgoing to Right - Signature Emerald WhatsApp Bubble) */
                    <div className="flex items-end justify-end gap-2 max-w-[88%] sm:max-w-[72%] md:max-w-[65%]">
                      <div className="relative rounded-2xl rounded-br-xs border border-emerald-600/60 bg-emerald-700 text-white p-3.5 shadow-lg shadow-emerald-950/40 space-y-1.5">
                        <div className="text-xs sm:text-sm text-white whitespace-pre-wrap leading-relaxed break-words font-normal">
                          {msg.message}
                        </div>

                        <div className="flex items-center justify-end gap-1.5 select-none pt-0.5 text-[10px] text-emerald-200 font-mono">
                          <span title={formatRelativeTime(msg.createdAt)}>{formatClockTime(msg.createdAt)}</span>
                          <CheckCheck className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating Jump to Bottom Button */}
          {showScrollBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-3 right-5 z-20 flex items-center gap-1.5 rounded-full bg-slate-900/95 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur-md hover:bg-slate-800 hover:text-white transition-all active:scale-95"
            >
              <ChevronDown className="h-3.5 w-3.5 text-emerald-400" />
              <span>En Alta Kaydır</span>
            </button>
          )}
        </div>
      </div>

      {/* Reply or Resolution Action Section */}
      {isResolved ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/30 via-slate-900/90 to-slate-950/90 p-6 space-y-4 shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Destek Uzmanımız Bu Talebi Çözümlendi Olarak İşaretledi
                </h3>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                  Onayınız Bekleniyor
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Platform destek uzmanımız talebinizle ilgili gerekli işlemleri tamamlamıştır.
                Sorun çözüme ulaştı mı? Lütfen aşağıdaki butonlardan birini seçerek durumu teyit edin.
              </p>
            </div>
          </div>

          {actionError && (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3.5 text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
            {/* Buton 2: Çözüme Ulaşmadı */}
            <Button
              type="button"
              variant="outline"
              size="md"
              loading={reopenMutation.isPending}
              disabled={closeMutation.isPending}
              onClick={() => reopenMutation.mutate()}
              leftIcon={<AlertCircle className="h-4 w-4 text-amber-400" />}
              className="hover:border-amber-500/50 hover:bg-amber-950/20 hover:text-amber-300 border-slate-700 text-slate-200"
            >
              ✕ Çözüme Ulaşmadı (Yeniden Aç & Mesaj Gönder)
            </Button>

            {/* Buton 1: Çözüme Ulaştı */}
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={closeMutation.isPending}
              disabled={reopenMutation.isPending}
              onClick={() => closeMutation.mutate()}
              leftIcon={<CheckCircle className="h-4 w-4" />}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30"
            >
              ✓ Çözüme Ulaştı (Talebi Kapat)
            </Button>
          </div>
        </div>
      ) : !isClosed ? (
        <form
          onSubmit={handleSendReply}
          className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-5 space-y-3.5 shadow-lg"
        >
          {actionError && (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3.5 text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-200">
              Yanıt Yaz
            </label>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" />
              Göndermek için <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700">Ctrl + Enter</kbd>
            </span>
          </div>

          <Textarea
            placeholder="Destek ekibine yanıtınızı veya ek bilgileri buraya yazın..."
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            disabled={replyMutation.isPending}
            required
            minLength={2}
            className="rounded-xl border-slate-700/80 bg-slate-800/80 focus:ring-sky-500/20"
          />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-slate-500">
              Yanıtınız doğrudan ilgili destek uzmanına anlık bildirim olarak düşecektir.
            </span>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={replyMutation.isPending}
              disabled={!replyMessage.trim()}
              leftIcon={<Send className="h-3.5 w-3.5" />}
              className="shadow-md shadow-sky-600/20"
            >
              Yanıtı Gönder
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-300">Bu destek talebi kapatılmıştır.</p>
          <p>
            Yeni bir sorunuz veya farklı bir teknik ihtiyacınız varsa lütfen{' '}
            <Link href="/dashboard/tickets" className="text-sky-400 font-medium underline hover:text-sky-300">
              yeni bir destek talebi oluşturun.
            </Link>
          </p>
        </div>
      )}

      {/* Close Confirm Dialog */}
      <ConfirmDialog
        isOpen={isCloseDialogOpen}
        title="Destek Talebini Kapat"
        message="Sorununuz çözüme ulaştı mı? Talebi kapattığınızda bu bilet arşivlenir ve yeni mesaj girişi engellenir."
        confirmLabel="Evet, Talebi Kapat"
        cancelLabel="Vazgeç"
        variant="warning"
        isLoading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutate()}
        onClose={() => setIsCloseDialogOpen(false)}
      />
    </div>
  );
}
