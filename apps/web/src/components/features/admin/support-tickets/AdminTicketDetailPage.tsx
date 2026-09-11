'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  Lock,
  MessageSquare,
  Shield,
  User,
  Building2,
  ExternalLink,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  CheckCheck,
  Clock,
  Sparkles,
  CornerDownLeft,
  ShieldAlert,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import {
  getAdminTicket,
  addAdminTicketMessage,
  updateAdminTicket,
} from '@/services/support-ticket.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import type {
  PlatformTicketPriority,
  PlatformTicketStatus,
} from '@repo/types';
import { formatDateTime } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import {
  CATEGORY_LABELS,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  formatRelativeTime,
  formatClockTime,
  formatChatDateHeader,
  CANNED_RESPONSES,
  getErrorMessage,
} from '@/components/features/support-tickets/ticket-ui';
import { TicketLifecycleStepper } from '@/components/features/support-tickets/TicketLifecycleStepper';

interface AdminTicketDetailPageProps {
  ticketId?: string;
}

export function AdminTicketDetailPage({ ticketId: propTicketId }: AdminTicketDetailPageProps) {
  const routeParams = useParams<{ id?: string }>();
  const ticketId = propTicketId || routeParams?.id || '';

  const { toast } = useUIStore();
  const client = useQueryClient();
  const currentAdmin = useAdminAuthStore((state) => state.admin);

  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const {
    data: ticket,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-ticket', ticketId],
    queryFn: () => getAdminTicket(ticketId),
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

  const messageMutation = useMutation({
    mutationFn: () =>
      addAdminTicketMessage(ticketId, {
        message: replyMessage.trim(),
        isInternal: isInternalNote,
      }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      setReplyMessage('');
      setActionError(null);
      toast.success(
        isInternalNote ? 'Dahili not güvenle kaydedildi.' : 'Müşteriye yanıt gönderildi.'
      );
      void client.invalidateQueries({ queryKey: ['admin-ticket', ticketId] });
      void client.invalidateQueries({ queryKey: ['admin-tickets'] });
    },
    onError: (err: unknown) => {
      const errorMsg = getErrorMessage(err, 'Mesaj gönderilemedi.');
      setActionError(errorMsg);
      toast.error(errorMsg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updates: {
      status?: PlatformTicketStatus;
      priority?: PlatformTicketPriority;
      assignedAdminId?: string | null;
    }) => updateAdminTicket(ticketId, updates),
    onSuccess: () => {
      toast.success('Bilet güncellendi.');
      void client.invalidateQueries({ queryKey: ['admin-ticket', ticketId] });
      void client.invalidateQueries({ queryKey: ['admin-tickets'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Bilet güncellenemedi.'));
    },
  });

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyMessage.trim() || messageMutation.isPending) return;
    messageMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const applyCannedResponse = (text: string) => {
    setReplyMessage((prev) => (prev ? `${prev}\n\n${text}` : text));
  };

  if (isLoading || !ticketId) {
    return (
      <div className="flex h-72 flex-col items-center justify-center text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent mb-3" />
        <span className="text-xs text-slate-400">Destek bileti yükleniyor...</span>
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-10 text-center text-slate-300">
        <AlertTriangle className="mx-auto h-10 w-10 text-rose-400" />
        <h3 className="mt-3 text-base font-bold text-white">Destek bileti bulunamadı</h3>
        <p className="mt-1 text-xs text-slate-400">
          İlgili bilet silinmiş veya ID parametresi geçersiz olabilir.
        </p>
        <Link href="/admin/tickets" className="mt-5 inline-block">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Bilet Listesine Dön
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

  const isAssignedToMe = currentAdmin && ticket.assignedAdminId === currentAdmin.id;

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/admin/tickets"
          className="group inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/80 group-hover:bg-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          Bilet Masasına Dön
        </Link>

        {/* Quick Lifecycle Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {!isAssignedToMe && currentAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateMutation.mutate({ assignedAdminId: currentAdmin.id })}
              loading={updateMutation.isPending}
              leftIcon={<UserCheck className="h-4 w-4 text-sky-400" />}
            >
              Kendime Ata
            </Button>
          )}

          {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateMutation.mutate({ status: 'RESOLVED' })}
              loading={updateMutation.isPending}
              leftIcon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              className="hover:border-emerald-500/50 hover:text-emerald-300"
            >
              Çözüldü Yap
            </Button>
          )}

          {/* Quick link to Tenant Support Session */}
          <Link href={`/admin/support?tenantId=${encodeURIComponent(ticket.tenantId)}&ticketId=${encodeURIComponent(ticket.ticketNumber)}`}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
              className="bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30"
            >
              Destek Oturumu Başlat
            </Button>
          </Link>
        </div>
      </div>

      {/* Visual Stepper */}
      <TicketLifecycleStepper
        status={ticket.status}
        createdAt={ticket.createdAt}
        resolvedAt={ticket.resolvedAt}
        closedAt={ticket.closedAt}
      />

      {/* Main Grid: Ticket Details & Thread (Left) + Management Sidebar (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Header & Conversation */}
        <div className="space-y-6 lg:col-span-2">
          {/* Header Card */}
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

                <span className="rounded-lg bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 border border-slate-700/60 font-medium">
                  {CATEGORY_LABELS[ticket.category] || ticket.category}
                </span>
              </div>

              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                {formatRelativeTime(ticket.createdAt)} ({formatDateTime(ticket.createdAt)})
              </span>
            </div>

            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">{ticket.title}</h1>
              <p className="mt-2 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed rounded-xl bg-slate-800/40 p-3 border border-slate-800/80">
                {ticket.description}
              </p>
            </div>
          </div>

          {/* Conversation Thread - WhatsApp Style */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-400" />
                Yazışma & Not Geçmişi ({ticket.messages.length})
              </h2>
              <span className="text-[11px] text-slate-500">
                Sarı kutular tenant tarafından gizlenmiş dahili notlardır.
              </span>
            </div>

            {/* WhatsApp-style Scrollable Chat Board */}
            <div className="relative">
              <div
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-4 sm:p-5 space-y-3.5 max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 hover:scrollbar-thumb-slate-700 scrollbar-track-transparent scroll-smooth shadow-inner"
              >
                {/* Sticky Centered Date Pill */}
                <div className="sticky top-0 z-10 flex justify-center py-1 pointer-events-none">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/95 border border-slate-700/80 px-3 py-0.5 text-[11px] font-medium text-slate-300 shadow-md backdrop-blur-md">
                    <Clock className="h-3 w-3 text-slate-400" />
                    {formatChatDateHeader(ticket.createdAt)}
                  </span>
                </div>

                {ticket.messages.map((msg) => {
                  const isInternal = msg.isInternal;
                  const isAdmin = msg.senderType === 'ADMIN_USER';

                  return (
                    <div
                      key={msg.id}
                      className={`flex w-full ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isAdmin ? (
                        /* Customer (Incoming from Left) */
                        <div className="flex items-end gap-2 max-w-[88%] sm:max-w-[72%] md:max-w-[65%]">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-200 shadow-sm mb-1">
                            <User className="h-3.5 w-3.5" />
                          </div>

                          <div className="relative rounded-2xl rounded-bl-xs border border-slate-700/80 bg-slate-800 text-slate-100 p-3.5 shadow-lg shadow-black/30 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-100">
                                {msg.authorUser?.name || 'Müşteri'}
                              </span>
                              <span className="rounded bg-slate-700/60 px-1.5 py-0.2 text-[9px] font-medium text-slate-300 border border-slate-600/40">
                                İşletme
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
                      ) : isInternal ? (
                        /* Admin Internal Note (Right - Amber) */
                        <div className="flex items-end justify-end gap-2 max-w-[88%] sm:max-w-[72%] md:max-w-[65%]">
                          <div className="relative rounded-2xl rounded-br-xs border border-amber-500/60 bg-amber-950/70 text-amber-50 p-3.5 shadow-lg shadow-amber-950/30 space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5">
                                <Lock className="h-3 w-3 text-amber-400" />
                                <span className="text-xs font-bold text-amber-200">
                                  {msg.authorAdmin?.name || 'Siz'}
                                </span>
                              </div>
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.2 text-[9px] font-bold text-amber-300 border border-amber-500/40">
                                Dahili Not (Gizli)
                              </span>
                            </div>

                            <div className="text-xs sm:text-sm text-amber-100 whitespace-pre-wrap leading-relaxed break-words font-normal">
                              {msg.message}
                            </div>

                            <div className="flex items-center justify-end gap-1.5 select-none pt-0.5 text-[10px] text-amber-300/80 font-mono">
                              <span title={formatRelativeTime(msg.createdAt)}>{formatClockTime(msg.createdAt)}</span>
                              <Lock className="h-3 w-3 text-amber-400 shrink-0" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Admin Public Reply (Right - Emerald WhatsApp Bubble) */
                        <div className="flex items-end justify-end gap-2 max-w-[88%] sm:max-w-[72%] md:max-w-[65%]">
                          <div className="relative rounded-2xl rounded-br-xs border border-emerald-600/60 bg-emerald-700 text-white p-3.5 shadow-lg shadow-emerald-950/40 space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5">
                                <Shield className="h-3 w-3 text-emerald-200" />
                                <span className="text-xs font-bold text-emerald-100">
                                  {msg.authorAdmin?.name || 'Siz'}
                                </span>
                              </div>
                              <span className="rounded-full bg-emerald-800/80 px-2 py-0.2 text-[9px] font-medium text-emerald-200 border border-emerald-600/40">
                                Müşteriye İletildi
                              </span>
                            </div>

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
                  <ChevronDown className="h-3.5 w-3.5 text-indigo-400" />
                  <span>En Alta Kaydır</span>
                </button>
              )}
            </div>
          </div>

          {/* Reply Form */}
          <form
            onSubmit={handleSendMessage}
            className={`rounded-2xl border p-5 space-y-4 shadow-lg transition-all ${
              isInternalNote
                ? 'border-amber-500/50 bg-amber-950/10 ring-1 ring-amber-500/20'
                : 'border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90'
            }`}
          >
            {/* Error Banner if any */}
            {actionError && (
              <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3.5 text-xs text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>{actionError}</span>
                </div>
                {actionError.includes('/admin/sessions') && (
                  <Link
                    href="/admin/sessions"
                    className="inline-flex items-center gap-1 font-bold text-sky-400 hover:text-sky-300 underline shrink-0"
                  >
                    Doğrulama Sayfasına Git <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}

            {/* Mode Switch Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-xl bg-slate-800/80 p-1 border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setIsInternalNote(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    !isInternalNote
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Müşteriye Yanıt Gönder
                </button>
                <button
                  type="button"
                  onClick={() => setIsInternalNote(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isInternalNote
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Dahili Not Ekle (Gizli)
                </button>
              </div>

              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" />
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700">
                  Ctrl + Enter
                </kbd>
              </span>
            </div>

            {/* Quick Canned Response Buttons for Admin */}
            {!isInternalNote && (
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-slate-400">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  Hızlı Hazır Şablonlar:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CANNED_RESPONSES.map((canned, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applyCannedResponse(canned.text)}
                      className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-sky-500/60 hover:text-sky-300 transition-colors"
                    >
                      + {canned.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              placeholder={
                isInternalNote
                  ? 'Yalnızca yöneticilerin görebileceği teknik analiz veya dahili notunuzu yazın...'
                  : 'Müşteriye gönderilecek resmi yanıtınızı yazın...'
              }
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              disabled={messageMutation.isPending}
              required
              minLength={2}
              className="rounded-xl border-slate-700/80 bg-slate-800/80 focus:ring-sky-500/20"
            />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              <span
                className={`text-[11px] ${
                  isInternalNote ? 'text-amber-400 font-medium' : 'text-slate-500'
                }`}
              >
                {isInternalNote
                  ? '⚠️ Bu mesaj veritabanında dahili işaretlenir; tenant/müşteri asla göremez.'
                  : 'Mesaj gönderildiğinde bilet durumu otomatik "Müşteri Yanıtı Bekleniyor" durumuna geçer.'}
              </span>

              <Button
                type="submit"
                variant={isInternalNote ? 'secondary' : 'primary'}
                size="sm"
                loading={messageMutation.isPending}
                disabled={!replyMessage.trim()}
                leftIcon={<Send className="h-3.5 w-3.5" />}
                className={isInternalNote ? 'bg-amber-600 hover:bg-amber-500 text-white' : ''}
              >
                {isInternalNote ? 'Dahili Notu Kaydet' : 'Yanıtı Gönder'}
              </Button>
            </div>
          </form>
        </div>

        {/* Right Sidebar: Ticket Controls & Tenant Context */}
        <div className="space-y-5">
          {/* Tenant & Customer Info Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-sky-400" />
              İşletme (Tenant) Bilgisi
            </h3>

            <div className="space-y-2 text-xs">
              <div className="rounded-xl bg-slate-800/50 p-3 border border-slate-800">
                <p className="text-xs text-slate-400">Şirket Adı:</p>
                <p className="font-bold text-white text-sm mt-0.5">
                  {ticket.tenantName || 'Tenant'}
                </p>
                {ticket.tenantSlug && (
                  <p className="font-mono text-[11px] text-sky-400 mt-0.5">
                    ID / Slug: {ticket.tenantSlug}
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-slate-800/50 p-3 border border-slate-800 space-y-1.5">
                <p className="text-xs text-slate-400">Talebi Açan Kullanıcı:</p>
                <p className="font-semibold text-slate-200">
                  {ticket.createdByUser?.name || 'Bilinmiyor'}
                </p>
                {ticket.createdByUser?.email && (
                  <p className="text-[11px] text-slate-400">{ticket.createdByUser.email}</p>
                )}
              </div>

              <Link
                href={`/admin/tenants/${ticket.tenantId}`}
                className="block text-center text-xs text-sky-400 hover:underline pt-1"
              >
                Tenant Detaylarına Git →
              </Link>
            </div>
          </div>

          {/* Quick Management Panel */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-sky-400" />
              Bilet Yönetimi
            </h3>

            {/* Status Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Durum</label>
              <select
                value={ticket.status}
                onChange={(e) =>
                  updateMutation.mutate({ status: e.target.value as PlatformTicketStatus })
                }
                disabled={updateMutation.isPending}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="OPEN">Açık (Kuyrukta)</option>
                <option value="IN_PROGRESS">İnceleniyor (İşlemde)</option>
                <option value="WAITING_TENANT">Müşteri Yanıtı Bekleniyor</option>
                <option value="RESOLVED">Çözümlendi</option>
                <option value="CLOSED">Kapatıldı</option>
              </select>
            </div>

            {/* Priority Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Öncelik Seviyesi</label>
              <select
                value={ticket.priority}
                onChange={(e) =>
                  updateMutation.mutate({ priority: e.target.value as PlatformTicketPriority })
                }
                disabled={updateMutation.isPending}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="LOW">Düşük</option>
                <option value="MEDIUM">Orta</option>
                <option value="HIGH">Yüksek</option>
                <option value="URGENT">Acil</option>
              </select>
            </div>

            {/* Assigned Admin Status */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-300">Atanan Uzman</label>
              <div className="rounded-xl bg-slate-800/70 p-3 border border-slate-700/60 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-xs text-white">
                    {ticket.assignedAdmin?.name || 'Henüz atanmadı'}
                  </p>
                  {ticket.assignedAdmin?.email && (
                    <p className="text-[10px] text-slate-400">{ticket.assignedAdmin.email}</p>
                  )}
                </div>
                {ticket.assignedAdminId && (
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate({ assignedAdminId: null })}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Kaldır
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
