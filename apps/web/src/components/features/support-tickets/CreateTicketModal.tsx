'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Wrench,
  CreditCard,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  Lightbulb,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { createTenantTicket } from '@/services/support-ticket.service';
import type { PlatformTicketCategory, PlatformTicketPriority } from '@repo/types';
import { useUIStore } from '@/store/ui.store';
import {
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  PRIORITY_CONFIG,
  getErrorMessage,
} from './ticket-ui';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: Array<{
  key: PlatformTicketCategory;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'TECHNICAL', icon: Wrench },
  { key: 'BILLING', icon: CreditCard },
  { key: 'ACCOUNT', icon: ShieldCheck },
  { key: 'FEATURE_REQUEST', icon: Sparkles },
  { key: 'OTHER', icon: HelpCircle },
];

const PRIORITIES: PlatformTicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function CreateTicketModal({ isOpen, onClose }: CreateTicketModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PlatformTicketCategory>('TECHNICAL');
  const [priority, setPriority] = useState<PlatformTicketPriority>('MEDIUM');
  const [description, setDescription] = useState('');
  const { toast } = useUIStore();
  const client = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      createTenantTicket({
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
      }),
    onSuccess: () => {
      toast.success('Destek talebiniz başarıyla oluşturuldu.');
      setTitle('');
      setDescription('');
      setCategory('TECHNICAL');
      setPriority('MEDIUM');
      onClose();
      void client.invalidateQueries({ queryKey: ['tenant-tickets'] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, 'Destek talebi oluşturulamadı.'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Lütfen başlık ve açıklama alanlarını eksiksiz doldurunuz.');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Yeni Destek Talebi Oluştur"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Category Visual Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Talep Kategorisi
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {CATEGORIES.map(({ key, icon: Icon }) => {
              const isSelected = category === key;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setCategory(key)}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-sky-500 bg-sky-500/10 text-white ring-1 ring-sky-500/40 shadow-sm'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isSelected ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-semibold">{CATEGORY_LABELS[key]}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight line-clamp-2">
                    {CATEGORY_DESCRIPTIONS[key]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Öncelik Seviyesi
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRIORITIES.map((p) => {
              const isSelected = priority === p;
              const config = PRIORITY_CONFIG[p];

              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                    isSelected
                      ? `${config.borderColor} ${config.bgSoft} ${config.textColor} ring-1 ring-current font-bold`
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <Input
          label="Konu / Başlık"
          placeholder="Örn: E-Fatura entegrasyonunda 500 hatası alıyoruz"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={5}
          maxLength={200}
        />

        {/* Description */}
        <Textarea
          label="Detaylı Açıklama"
          placeholder="Lütfen sorunu ayrıntılı açıklayın (Hata mesajı metni, hangi sayfada oluştuğu, işlem sırası vb.)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          required
          minLength={10}
        />

        {/* Help Tip Box */}
        <div className="rounded-xl border border-sky-900/30 bg-sky-950/20 p-3 flex items-start gap-2.5">
          <Lightbulb className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-sky-300">Daha Hızlı Çözüm İçin: </span>
            Hatanın meydana geldiği modül adını, hata kodunu veya tam hata metnini belirtmeniz destek ekibimizin müdahale süresini yarı yarıya kısaltacaktır.
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={createMutation.isPending}
          >
            Vazgeç
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={createMutation.isPending}
            leftIcon={<Send className="h-4 w-4" />}
          >
            Talebi Gönder
          </Button>
        </div>
      </form>
    </Modal>
  );
}
