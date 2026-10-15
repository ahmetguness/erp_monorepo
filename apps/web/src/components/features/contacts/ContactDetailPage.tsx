"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pencil,
  Trash2,
  Phone,
  Mail,
  Globe,
  MapPin,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  FileDown,
  FileText,
  AlertTriangle,
  Calendar,
  Clock,
  Filter,
  X,
  Users,
  CheckSquare,
  Paperclip,
  TrendingUp,
  TrendingDown,
  Wallet,
  ShieldAlert,
  Send,
  Eye,
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { CreditLimitBar } from "@/components/shared/CreditLimitBar";
import { SupplierPerformanceCard } from "@/components/features/contacts/SupplierPerformanceCard";
import { AttachmentPanel } from "@/components/shared/AttachmentPanel";
import { EntityActivityTimeline } from "@/components/shared/EntityActivityTimeline";
import { EntityTaskActions } from "@/components/shared/EntityTaskActions";
import { RecommendedActionsPanel, type RecommendedEntityAction } from "@/components/shared/RecommendedActionsPanel";
import { RecordCollaborationPanel, useCreateCollaborationEntry } from "@/features/collaboration";
import { RecordRecoveryPanel } from "@/features/recovery";
import {
  CONTACT_MISSING_INFO_LABELS,
  CONTACT_RISK_SCORE_LABELS,
  CONTACT_RISK_SCORE_VARIANTS,
  CONTACT_TYPE_LABELS,
  CONTACT_TYPE_VARIANTS,
} from "@/components/features/contacts/contact-display";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  useContact,
  useDeleteContact,
  useAccountEntries,
} from "@/hooks/useContacts";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSendMail } from "@/hooks/useMail";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type {
  AccountEntry,
  ContactMissingInfoKey,
  OpenInvoice,
} from "@/services/contact.service";
import type { SendMailDTO } from "@/services/mail.service";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function InfoField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </span>
      <div className="text-xs text-slate-200 font-medium break-words">
        {value}
      </div>
    </div>
  );
}

function MissingInfoBanner({
  keys,
  onEdit,
}: {
  keys: ContactMissingInfoKey[];
  onEdit: () => void;
}) {
  if (keys.length === 0) return null;

  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="font-medium text-amber-200">Eksik bilgiler mevcut:</span>
        <div className="flex flex-wrap gap-1">
          {keys.map((key) => (
            <Badge key={key} variant="warning" className="text-[10px] py-0 px-1.5">
              {CONTACT_MISSING_INFO_LABELS[key]}
            </Badge>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEdit}
        className="h-6 px-2 text-[11px] text-amber-300 hover:text-amber-100 hover:bg-amber-500/10"
      >
        Tamamla
      </Button>
    </div>
  );
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const REF_TYPE_LABELS: Record<string, string> = {
  INVOICE: "Fatura",
  PAYMENT: "Ödeme",
  OPENING: "Açılış",
  ADJUSTMENT: "Düzeltme",
  RETURN: "İade",
  COLLECTION: "Tahsilat",
};

const REF_TYPE_ICONS: Record<string, React.ReactNode> = {
  INVOICE: <Receipt className="w-3.5 h-3.5 text-sky-400 shrink-0" />,
  PAYMENT: <ArrowUpRight className="w-3.5 h-3.5 text-red-400 shrink-0" />,
  COLLECTION: <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
  OPENING: <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
  ADJUSTMENT: <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
  RETURN: <FileText className="w-3.5 h-3.5 text-violet-400 shrink-0" />,
};

const REF_TYPE_OPTIONS = [
  { value: "", label: "Tüm Tipler" },
  { value: "INVOICE", label: "Fatura" },
  { value: "PAYMENT", label: "Ödeme" },
  { value: "COLLECTION", label: "Tahsilat" },
  { value: "OPENING", label: "Açılış" },
  { value: "ADJUSTMENT", label: "Düzeltme" },
  { value: "RETURN", label: "İade" },
];

interface MailAttachmentDraft {
  filename: string;
  content: string;
  contentType?: string;
  size: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value: string): string {
  return escapeHtml(value)
    .split("\n")
    .map((line) => (line.trim() ? line : "&nbsp;"))
    .join("<br>");
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsAttachment(file: File): Promise<MailAttachmentDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = result.split(",");
      resolve({
        filename: file.name,
        content: base64,
        contentType: file.type || undefined,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error(`${file.name} okunamadı.`));
    reader.readAsDataURL(file);
  });
}

function toMailAttachments(
  attachments: MailAttachmentDraft[],
): NonNullable<SendMailDTO["attachments"]> {
  return attachments.map(({ filename, content, contentType }) => ({
    filename,
    content,
    ...(contentType && { contentType }),
  }));
}

function parseRecipients(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

type TabKey =
  | "statement"
  | "invoices"
  | "collaboration"
  | "tasks"
  | "attachments"
  | "activity";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props {
  id: string;
}

export function ContactDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: contact, isLoading } = useContact(id);
  const deleteContact = useDeleteContact();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Active tab state
  const [activeTab, setActiveTab] = useState<TabKey>("statement");

  // Statement filters
  const [entryPage, setEntryPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refType, setRefType] = useState("");
  const [showEntryFilters, setShowEntryFilters] = useState(false);

  // Mail modal state
  const { user } = useCurrentUser();
  const sendMail = useSendMail();
  const createCollaborationEntry = useCreateCollaborationEntry({
    entityType: "CONTACT",
    entityId: id,
  });
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailAttachments, setMailAttachments] = useState<MailAttachmentDraft[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);

  const { data: entriesData, isLoading: loadingEntries } = useAccountEntries(
    id,
    {
      page: entryPage,
      limit: 25,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      refType: refType || undefined,
    },
  );

  const entries = entriesData?.data ?? [];
  const periodTotals = entriesData?.periodTotals;
  const hasEntryFilters = !!dateFrom || !!dateTo || !!refType;

  const clearEntryFilters = () => {
    setDateFrom("");
    setDateTo("");
    setRefType("");
    setEntryPage(1);
  };

  const openMailModal = () => {
    setMailTo(contact?.email ?? "");
    setMailSubject(`${contact?.name ?? ""} hakkında`);
    setMailBody("");
    setMailAttachments([]);
    setFileError(null);
    setMailOpen(true);
  };

  const handleMailFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setFileError(null);
    if (files.length === 0) return;

    if (mailAttachments.length + files.length > 5) {
      setFileError("En fazla 5 dosya ekleyebilirsiniz.");
      return;
    }
    const tooLarge = files.find((file) => file.size > 5 * 1024 * 1024);
    if (tooLarge) {
      setFileError(`${tooLarge.name} 5 MB sınırını aşıyor.`);
      return;
    }
    const currentSize = mailAttachments.reduce((sum, item) => sum + item.size, 0);
    const nextSize = files.reduce((sum, file) => sum + file.size, currentSize);
    if (nextSize > 10 * 1024 * 1024) {
      setFileError("Toplam dosya eki boyutu 10 MB sınırını aşıyor.");
      return;
    }

    setIsReadingFiles(true);
    try {
      const nextAttachments = await Promise.all(files.map(readFileAsAttachment));
      setMailAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Dosya okunamadı.");
    } finally {
      setIsReadingFiles(false);
    }
  };

  const mailRecipients = parseRecipients(mailTo);
  const canSendMail =
    mailRecipients.length > 0 &&
    Boolean(mailSubject.trim() && mailBody.trim()) &&
    !sendMail.isPending &&
    !isReadingFiles;

  const handleSendMail = async () => {
    const result = await sendMail.mutateAsync({
      to: mailRecipients.length === 1 ? mailRecipients[0] : mailRecipients,
      subject: mailSubject.trim(),
      html: textToHtml(mailBody.trim()),
      ...(user?.email && { replyTo: user.email }),
      ...(mailAttachments.length > 0 && {
        attachments: toMailAttachments(mailAttachments),
      }),
    });
    if (result.success && result.id) {
      await createCollaborationEntry.mutateAsync({
        type: "EMAIL_LINK",
        content: `${mailSubject.trim()} başlıklı e-posta kayda bağlandı.`,
        mentionIds: [],
        externalId: result.id,
      });
    }
    setMailOpen(false);
  };

  // Statement Columns
  const entryColumns: ColumnDef<AccountEntry>[] = [
    {
      key: "date",
      header: "Tarih",
      width: "100px",
      render: (r) => (
        <span className="text-xs text-slate-300 font-mono tabular-nums">
          {formatDate(r.date)}
        </span>
      ),
    },
    {
      key: "refType",
      header: "Belge Tipi",
      width: "125px",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {r.refType && REF_TYPE_ICONS[r.refType]}
          <span className="text-xs text-slate-300">
            {r.refType ? (REF_TYPE_LABELS[r.refType] ?? r.refType) : "—"}
          </span>
        </div>
      ),
    },
    {
      key: "description",
      header: "Açıklama",
      render: (r) => (
        <span className="text-xs text-slate-300 truncate block max-w-sm">
          {r.description ?? "—"}
        </span>
      ),
    },
    {
      key: "debit",
      header: "Borç",
      width: "130px",
      align: "right",
      render: (r) =>
        r.debit > 0 ? (
          <span className="text-xs font-mono font-medium text-rose-400 tabular-nums">
            {formatCurrency(r.debit)}
          </span>
        ) : (
          <span className="text-slate-700 font-mono text-xs">—</span>
        ),
    },
    {
      key: "credit",
      header: "Alacak",
      width: "130px",
      align: "right",
      render: (r) =>
        r.credit > 0 ? (
          <span className="text-xs font-mono font-medium text-emerald-400 tabular-nums">
            {formatCurrency(r.credit)}
          </span>
        ) : (
          <span className="text-slate-700 font-mono text-xs">—</span>
        ),
    },
    {
      key: "balance",
      header: "Bakiye",
      width: "140px",
      align: "right",
      render: (r) => (
        <span
          className={cn(
            "text-xs font-mono font-semibold tabular-nums",
            r.balance >= 0 ? "text-slate-100" : "text-rose-400",
          )}
        >
          {formatCurrency(r.balance)}
        </span>
      ),
    },
  ];

  // Open Invoice Columns
  const invoiceColumns: ColumnDef<OpenInvoice>[] = [
    {
      key: "number",
      header: "Fatura No",
      width: "150px",
      render: (inv) => (
        <Link
          href={`/dashboard/invoices/${inv.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline transition-colors block leading-tight truncate"
        >
          {inv.number}
        </Link>
      ),
    },
    {
      key: "date",
      header: "Tarih",
      width: "110px",
      render: (inv) => (
        <span className="text-xs font-mono text-slate-400 tabular-nums">
          {formatDate(inv.date)}
        </span>
      ),
    },
    {
      key: "dueDate",
      header: "Vade Tarihi",
      width: "125px",
      render: (inv) => (
        <span
          className={cn(
            "text-xs font-mono tabular-nums",
            inv.isOverdue ? "text-rose-400 font-medium" : "text-slate-400",
          )}
        >
          {inv.dueDate ? formatDate(inv.dueDate) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Durum",
      width: "120px",
      render: (inv) =>
        inv.isOverdue ? (
          <Badge variant="danger" className="text-[11px]">
            Gecikmiş
          </Badge>
        ) : (
          <Badge variant="neutral" className="text-[11px]">
            Vadesi Bekliyor
          </Badge>
        ),
    },
    {
      key: "totalGross",
      header: "Tutar",
      width: "140px",
      align: "right",
      render: (inv) => (
        <span className="text-xs font-mono font-semibold tabular-nums text-slate-100">
          {formatCurrency(inv.totalGross)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      align: "center",
      render: (inv) => (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-100"
          onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
        >
          Görüntüle
        </Button>
      ),
    },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!contact)
    return <div className="text-slate-400 text-sm">Cari hesap bulunamadı.</div>;

  const fin = contact.financials ?? {
    totalDebit: 0,
    totalCredit: 0,
    currentBalance: 0,
    lastTransactionDate: null,
    transactionCount: 0,
    openInvoiceCount: 0,
    overdueInvoiceCount: 0,
    riskLevel: "none" as const,
    riskRatio: 0,
    riskScore: 0,
    riskScoreLevel: "LOW" as const,
  };
  const openInvoices = contact.openInvoices ?? [];
  const creditLimit = contact.creditLimit ? Number(contact.creditLimit) : 0;
  const creditUsed = Math.max(Number(fin.currentBalance) || 0, 0);
  const hasFinancialRisk =
    (fin.overdueInvoiceCount ?? 0) > 0 ||
    fin.riskLevel === "exceeded" ||
    fin.riskLevel === "warning";

  const recommendedActions: RecommendedEntityAction[] = hasFinancialRisk
    ? [
        {
          id: `contact-${id}-risk-followup`,
          kind: "task",
          title: "Cari risk takip görevi oluştur",
          summary: `${contact.name} için ${fin.overdueInvoiceCount ?? 0} gecikmiş fatura ve ${formatCurrency(fin.currentBalance)} bakiye görünüyor.`,
          priority: fin.riskLevel === "exceeded" ? "CRITICAL" : "HIGH",
          entityType: "CONTACT",
          entityId: id,
          module: "contacts",
          href: `/dashboard/contacts/${id}`,
          steps: [
            "Öneriyi gör",
            "Görev taslağını incele",
            "Onayla",
            "Workflow’da takip et",
          ],
          draft: {
            title: `${contact.name} cari risk takibi`,
            detail: [
              `Cari: ${contact.name}`,
              `Güncel bakiye: ${formatCurrency(fin.currentBalance)}`,
              `Açık fatura: ${fin.openInvoiceCount ?? 0}`,
              `Gecikmiş fatura: ${fin.overdueInvoiceCount ?? 0}`,
              creditLimit > 0
                ? `Kredi limiti: ${formatCurrency(creditLimit)}`
                : null,
            ]
              .filter((line): line is string => line !== null)
              .join("\n"),
            type: "COLLECTION",
            dueAt: addDays(1),
          },
        },
      ]
    : [];

  const totalOpenInvoiceAmount = openInvoices.reduce(
    (acc, inv) => acc + (Number(inv.totalGross) || 0),
    0,
  );
  const overdueInvoiceCount = openInvoices.filter((inv) => inv.isOverdue).length;

  const tabs = [
    {
      id: "statement" as const,
      label: "Hesap Ekstresi",
      icon: Receipt,
      count: entriesData?.meta.total,
    },
    {
      id: "invoices" as const,
      label: "Faturalar",
      icon: FileText,
      count: openInvoices.length,
    },
    {
      id: "collaboration" as const,
      label: "İş Birliği",
      icon: Users,
    },
    {
      id: "tasks" as const,
      label: "Görevler",
      icon: CheckSquare,
    },
    {
      id: "attachments" as const,
      label: "Dosyalar",
      icon: Paperclip,
    },
    {
      id: "activity" as const,
      label: "Aktivite",
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Standardized Record Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
              {contact.name}
            </h1>
            {contact.code && (
              <span className="font-mono text-xs text-slate-400">
                ({contact.code})
              </span>
            )}
            <Badge variant={CONTACT_TYPE_VARIANTS[contact.type]}>
              {CONTACT_TYPE_LABELS[contact.type]}
            </Badge>
            <ActiveBadge isActive={contact.isActive} />
            {contact.paymentTermDays != null && (
              <Badge variant="neutral" dot>
                <Clock className="w-3 h-3 mr-0.5" />
                {contact.paymentTermDays} gün vade
              </Badge>
            )}
            <Badge variant={CONTACT_RISK_SCORE_VARIANTS[fin.riskScoreLevel]}>
              Risk skoru: %{fin.riskScore} —{" "}
              {CONTACT_RISK_SCORE_LABELS[fin.riskScoreLevel]}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />}
            onClick={() =>
              router.push(`/dashboard/payments/new?type=receive&contactId=${id}`)
            }
            className="h-8 text-xs"
          >
            Tahsilat
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />}
            onClick={() =>
              router.push(`/dashboard/payments/new?type=send&contactId=${id}`)
            }
            className="h-8 text-xs"
          >
            Ödeme
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Receipt className="w-3.5 h-3.5 text-sky-400" />}
            onClick={() =>
              router.push(`/dashboard/invoices/new?contactId=${id}`)
            }
            className="h-8 text-xs"
          >
            Fatura
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileDown className="w-3.5 h-3.5" />}
            onClick={() => {
              setActiveTab("statement");
              window.print();
            }}
            className="h-8 text-xs"
          >
            Ekstre
          </Button>
          <div className="w-px h-5 bg-slate-800 mx-1" />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Mail className="w-3.5 h-3.5" />}
            onClick={openMailModal}
            className="h-8 text-xs"
          >
            Mail
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Pencil className="w-3.5 h-3.5" />}
            onClick={() => router.push(`/dashboard/contacts/${id}/edit`)}
            className="h-8 text-xs"
          >
            Düzenle
          </Button>
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => setDeleteOpen(true)}
            className="h-8 text-xs"
          >
            Sil
          </Button>
        </div>
      </div>

      {/* 2. Unified Financial Summary Strip (5 metrics) */}
      <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-sm">
        <div className="grid grid-cols-2 divide-y divide-slate-800/60 sm:grid-cols-3 lg:grid-cols-5 sm:divide-y-0 sm:divide-x divide-slate-800/70">
          {/* Toplam Alacak */}
          <div className="flex flex-col justify-between p-3 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
              Toplam Alacak
            </span>
            <div className="mt-1">
              <span className="text-base sm:text-lg font-semibold text-emerald-400 tabular-nums font-mono">
                {formatCurrency(Number(fin.totalDebit) || 0)}
              </span>
              <span className="block text-[11px] text-slate-500">Müşteri borcu</span>
            </div>
          </div>

          {/* Toplam Borç */}
          <div className="flex flex-col justify-between p-3 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
              Toplam Borç
            </span>
            <div className="mt-1">
              <span className="text-base sm:text-lg font-semibold text-rose-400 tabular-nums font-mono">
                {formatCurrency(Number(fin.totalCredit) || 0)}
              </span>
              <span className="block text-[11px] text-slate-500">Tedarikçi alacağı</span>
            </div>
          </div>

          {/* Güncel Bakiye */}
          <div className="flex flex-col justify-between p-3 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
              Güncel Bakiye
            </span>
            <div className="mt-1">
              <span
                className={cn(
                  "text-base sm:text-lg font-semibold tabular-nums font-mono",
                  (Number(fin.currentBalance) || 0) >= 0
                    ? "text-emerald-400"
                    : "text-rose-400",
                )}
              >
                {formatCurrency(Math.abs(Number(fin.currentBalance) || 0))}
              </span>
              <span className="block text-[11px] text-slate-400 font-medium">
                {(Number(fin.currentBalance) || 0) > 0
                  ? "Alacaklıyız"
                  : (Number(fin.currentBalance) || 0) < 0
                    ? "Borçluyuz"
                    : "Sıfır Bakiye"}
              </span>
            </div>
          </div>

          {/* Açık Fatura */}
          <div className="flex flex-col justify-between p-3 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
              Açık Fatura
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "text-base sm:text-lg font-semibold tabular-nums font-mono",
                  (fin.overdueInvoiceCount ?? 0) > 0
                    ? "text-amber-400"
                    : "text-slate-100",
                )}
              >
                {fin.openInvoiceCount ?? 0}
              </span>
              <span className="text-[11px] text-slate-500">
                {(fin.overdueInvoiceCount ?? 0) > 0
                  ? `${fin.overdueInvoiceCount} gecikmiş`
                  : "vadesi güncel"}
              </span>
            </div>
          </div>

          {/* Risk Oranı */}
          <div className="flex flex-col justify-between p-3 min-w-0 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
              Risk Oranı
            </span>
            <div className="mt-1">
              <span
                className={cn(
                  "text-base sm:text-lg font-semibold tabular-nums font-mono",
                  fin.riskLevel === "exceeded"
                    ? "text-rose-400"
                    : fin.riskLevel === "warning"
                      ? "text-amber-400"
                      : "text-emerald-400",
                )}
              >
                %{fin.riskRatio ?? 0}
              </span>
              <span className="block text-[11px] text-slate-500 truncate">
                Skor: %{fin.riskScore ?? 0} · {CONTACT_RISK_SCORE_LABELS[fin.riskScoreLevel] ?? ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Risk Actions Banner (if any) */}
      {recommendedActions.length > 0 && (
        <RecommendedActionsPanel actions={recommendedActions} />
      )}

      {/* 3. Account Information & Credit Context Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Left 2 Cols: Compact Account Details */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800/80">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Cari Hesap Bilgileri
            </h2>
            {fin.lastTransactionDate && (
              <span className="text-[11px] text-slate-500 font-mono">
                Son işlem: {formatDate(fin.lastTransactionDate)}
              </span>
            )}
          </div>

          <MissingInfoBanner
            keys={contact.missingInfoKeys ?? []}
            onEdit={() => router.push(`/dashboard/contacts/${id}/edit`)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <InfoField label="Vergi Numarası" value={contact.taxNumber} />
            <InfoField label="Vergi Dairesi" value={contact.taxOffice} />
            <InfoField
              label="E-posta"
              value={
                contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 transition-colors truncate"
                  >
                    <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{contact.email}</span>
                  </a>
                ) : null
              }
            />
            <InfoField
              label="Telefon"
              value={
                contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{contact.phone}</span>
                  </a>
                ) : null
              }
            />
            <InfoField
              label="Web Sitesi"
              value={
                contact.website ? (
                  <a
                    href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 transition-colors truncate"
                  >
                    <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{contact.website}</span>
                  </a>
                ) : null
              }
            />
            <InfoField
              label="Adres"
              value={
                contact.address || contact.city || contact.country ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">
                      {[contact.address, contact.city, contact.country]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                ) : null
              }
            />
            <InfoField label="Kayıt Tarihi" value={formatDate(contact.createdAt)} />
            <InfoField label="Son Güncelleme" value={formatDate(contact.updatedAt)} />
          </div>

          {contact.notes && (
            <div className="mt-3.5 pt-3 border-t border-slate-800/70">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 block">
                Notlar
              </span>
              <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">
                {contact.notes}
              </p>
            </div>
          )}

          {contact.tags.length > 0 && (
            <div
              className="mt-3.5 pt-3 border-t border-slate-800/70 flex flex-wrap items-center gap-1.5"
              aria-label="Cari etiketleri"
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mr-1">
                Etiketler:
              </span>
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Col: Financial Context & Credit Overview */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800/80">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Kredi & Mali Özet
              </h2>
              <span className="text-[11px] text-slate-500">
                {fin.transactionCount} hareket
              </span>
            </div>

            {/* Credit Limit Information */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Tanımlı Limit:</span>
                <span className="font-mono font-medium text-slate-200 tabular-nums">
                  {creditLimit > 0 ? formatCurrency(creditLimit) : "Limit yok"}
                </span>
              </div>

              {creditLimit > 0 && (
                <>
                  <CreditLimitBar used={creditUsed} limit={creditLimit} />
                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 block">
                        Kullanılan
                      </span>
                      <span className="font-mono font-medium text-slate-200 tabular-nums">
                        {formatCurrency(creditUsed)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 block">
                        Kalan Limit
                      </span>
                      <span className="font-mono font-medium text-emerald-400 tabular-nums">
                        {formatCurrency(Math.max(creditLimit - creditUsed, 0))}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Supplier Performance Card if supplier or both */}
            {(contact.type === "SUPPLIER" || contact.type === "BOTH") && (
              <div className="mt-3.5 pt-3 border-t border-slate-800/70">
                <SupplierPerformanceCard contactId={id} />
              </div>
            )}
          </div>

          {/* Quick Summary Navigation Anchors */}
          <div className="mt-3.5 pt-3 border-t border-slate-800/70 grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("statement")}
              className="flex flex-col p-2 rounded-lg bg-slate-950/40 hover:bg-slate-800/60 transition-colors text-left"
            >
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Toplam İşlem
              </span>
              <span className="font-semibold text-slate-200 font-mono mt-0.5">
                {fin.transactionCount} adet
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className="flex flex-col p-2 rounded-lg bg-slate-950/40 hover:bg-slate-800/60 transition-colors text-left"
            >
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Açık Fatura
              </span>
              <span className="font-semibold text-slate-200 font-mono mt-0.5">
                {openInvoices.length} adet
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Full-Width Contextual Tabs Navigation */}
      <div className="border-b border-slate-800/90 pt-1">
        <nav
          className="flex space-x-1 overflow-x-auto scrollbar-none"
          aria-label="Cari hesap detay sekmeleri"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group inline-flex items-center gap-2 border-b-2 py-2.5 px-3.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500",
                  isActive
                    ? "border-sky-500 text-sky-400 bg-sky-500/[0.04]"
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200",
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive
                      ? "text-sky-400"
                      : "text-slate-500 group-hover:text-slate-300",
                  )}
                />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={cn(
                      "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-mono tabular-nums",
                      isActive
                        ? "bg-sky-500/20 text-sky-300"
                        : "bg-slate-800 text-slate-400",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 5. Tab Content Sections (Mounted with hidden to preserve all unsaved state) */}

      {/* TAB 1: Hesap Ekstresi (Default) */}
      <div className={activeTab === "statement" ? "block space-y-3" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-400">Toplam Hareket:</span>
            <span className="font-semibold text-slate-200 font-mono">
              {entriesData?.meta.total ?? 0}
            </span>
            {periodTotals && (entriesData?.meta.total ?? 0) > 0 && (
              <>
                <span className="text-slate-700">|</span>
                <span className="text-slate-400">Dönem Toplamları:</span>
                <span className="font-mono font-medium text-rose-400 tabular-nums">
                  {formatCurrency(periodTotals.debit)} B
                </span>
                <span className="text-slate-600 font-normal">/</span>
                <span className="font-mono font-medium text-emerald-400 tabular-nums">
                  {formatCurrency(periodTotals.credit)} A
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showEntryFilters ? "secondary" : "ghost"}
              size="sm"
              leftIcon={<Filter className="w-3.5 h-3.5" />}
              onClick={() => setShowEntryFilters((o) => !o)}
              className="h-8 text-xs"
            >
              Filtrele
              {hasEntryFilters && (
                <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[10px] font-semibold text-white">
                  {[dateFrom, dateTo, refType].filter(Boolean).length}
                </span>
              )}
            </Button>
            {hasEntryFilters && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<X className="w-3.5 h-3.5" />}
                onClick={clearEntryFilters}
                className="h-8 text-xs text-slate-400 hover:text-slate-200"
              >
                Temizle
              </Button>
            )}
          </div>
        </div>

        {showEntryFilters && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
            <DatePicker
              value={dateFrom}
              onValueChange={(value) => {
                setDateFrom(value ?? "");
                setEntryPage(1);
              }}
              aria-label="Başlangıç tarihi"
              placeholder="Başlangıç"
              className="w-40"
            />
            <DatePicker
              value={dateTo}
              onValueChange={(value) => {
                setDateTo(value ?? "");
                setEntryPage(1);
              }}
              aria-label="Bitiş tarihi"
              placeholder="Bitiş"
              className="w-40"
            />
            <Select
              aria-label="Belge tipi"
              options={REF_TYPE_OPTIONS}
              value={refType}
              onChange={(e) => {
                setRefType(e.target.value);
                setEntryPage(1);
              }}
              className="w-40 h-9 !py-1 text-xs rounded-lg border-slate-800 bg-slate-900/60"
            />
          </div>
        )}

        <DataTable
          columns={entryColumns}
          data={entries}
          keyExtractor={(r) => r.id}
          isLoading={loadingEntries}
          emptyTitle="Henüz hareket yok"
          emptyDescription="Bu cari hesaba ait ekstre hareketi bulunmuyor."
          density="compact"
          pagination={
            entriesData
              ? {
                  page: entryPage,
                  pageSize: 25,
                  total: entriesData.meta.total,
                  totalPages: entriesData.meta.totalPages,
                  onChange: setEntryPage,
                }
              : undefined
          }
        />
      </div>

      {/* TAB 2: Faturalar (Open Invoices) */}
      <div className={activeTab === "invoices" ? "block space-y-3" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400">Açık Fatura Sayısı:</span>
            <span className="font-semibold text-slate-200 font-mono">
              {openInvoices.length}
            </span>
            {overdueInvoiceCount > 0 && (
              <span className="text-rose-400 font-medium">
                ({overdueInvoiceCount} gecikmiş)
              </span>
            )}
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">Toplam Açık Tutar:</span>
            <span className="font-mono font-semibold text-slate-100 tabular-nums">
              {formatCurrency(totalOpenInvoiceAmount)}
            </span>
            <span className="text-slate-500 hidden sm:inline">
              (Yalnızca ödenmemiş açık faturalar listelenmektedir)
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Receipt className="w-3.5 h-3.5" />}
            onClick={() => router.push(`/dashboard/invoices/new?contactId=${id}`)}
            className="h-8 text-xs"
          >
            Yeni Fatura
          </Button>
        </div>

        <DataTable
          columns={invoiceColumns}
          data={openInvoices}
          keyExtractor={(inv) => inv.id}
          emptyTitle="Açık fatura bulunmuyor"
          emptyDescription="Bu cari hesaba ait bekleyen veya vadesi geçmiş açık fatura yoktur."
          density="compact"
          onRowClick={(inv) => router.push(`/dashboard/invoices/${inv.id}`)}
        />
      </div>

      {/* TAB 3: İş Birliği (Comments, Decisions, Recovery) */}
      <div className={activeTab === "collaboration" ? "block" : "hidden"}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <RecordCollaborationPanel
              entityType="CONTACT"
              entityId={id}
              displayName={contact.name}
            />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <RecordRecoveryPanel
              entityType="CONTACT"
              entityId={id}
              displayName={contact.name}
            />
          </div>
        </div>
      </div>

      {/* TAB 4: Görevler */}
      <div className={activeTab === "tasks" ? "block" : "hidden"}>
        <div className="max-w-4xl">
          <EntityTaskActions
            entityType="CONTACT"
            entityId={id}
            entityLabel={contact.name}
            module="contacts"
            href={`/dashboard/contacts/${id}`}
          />
        </div>
      </div>

      {/* TAB 5: Dosyalar */}
      <div className={activeTab === "attachments" ? "block" : "hidden"}>
        <div className="max-w-4xl">
          <AttachmentPanel entityType="CONTACT" entityId={id} />
        </div>
      </div>

      {/* TAB 6: Aktivite */}
      <div className={activeTab === "activity" ? "block" : "hidden"}>
        <div className="max-w-4xl">
          <EntityActivityTimeline entityType="CONTACT" entityId={id} />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteContact.mutate(id, {
            onSuccess: () => router.push("/dashboard/contacts"),
          })
        }
        message={`"${contact.name}" cari hesabını silmek istediğinize emin misiniz?`}
        isLoading={deleteContact.isPending}
      />

      {/* Mail Modal */}
      <Modal
        isOpen={mailOpen}
        onClose={() => setMailOpen(false)}
        title="Mail gönder"
        description={contact.name}
        size="lg"
        footer={(
          <>
            <Button
              variant="ghost"
              onClick={() => setMailOpen(false)}
              disabled={sendMail.isPending}
            >
              İptal
            </Button>
            <Button
              onClick={handleSendMail}
              disabled={!canSendMail}
              loading={sendMail.isPending}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {isReadingFiles ? "Dosya okunuyor" : "Gönder"}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Kime</span>
            <input
              value={mailTo}
              onChange={(event) => setMailTo(event.target.value)}
              placeholder="Birden fazla adres için virgül veya yeni satır kullanın"
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Konu</span>
            <input
              value={mailSubject}
              onChange={(event) => setMailSubject(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Açıklama</span>
            <textarea
              value={mailBody}
              onChange={(event) => setMailBody(event.target.value)}
              rows={8}
              className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-sky-500/60"
            />
          </label>
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:border-sky-500/50 hover:text-sky-300">
                <Paperclip className="h-3.5 w-3.5" />
                Dosya ekle
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleMailFiles}
                />
              </label>
              <span className="text-[11px] text-slate-600">5 dosya, toplam 10 MB</span>
            </div>
            {fileError && <p className="mt-2 text-xs text-red-400">{fileError}</p>}
            {mailAttachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {mailAttachments.map((attachment) => (
                  <div
                    key={`${attachment.filename}-${attachment.size}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200">
                        {attachment.filename}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setMailAttachments((current) =>
                          current.filter((item) => item !== attachment),
                        )
                      }
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-300"
                      aria-label="Dosya ekini kaldır"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
