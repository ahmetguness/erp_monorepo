"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Mail,
  Paperclip,
  Phone,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttachmentPanel } from "@/components/shared/AttachmentPanel";
import { EntityActivityTimeline } from "@/components/shared/EntityActivityTimeline";
import { EntityTaskActions } from "@/components/shared/EntityTaskActions";
import { EntityImageManager } from "@/components/shared/EntityImageManager";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCurrentUser } from "@/hooks/useAuth";
import { useEmployee } from "@/hooks/useHR";
import { useSendMail } from "@/hooks/useMail";
import { useTenantUsers } from "@/hooks/useUsers";
import { formatDate, formatCurrency } from "@/lib/utils";

interface MailAttachmentDraft {
  filename: string;
  content: string;
  contentType?: string;
  size: number;
}

interface EmployeeMailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  employeeEmail: string;
}

interface RecipientOption {
  label: string;
  email: string;
}

interface RecipientPickerProps {
  label: string;
  recipients: string[];
  options: RecipientOption[];
  externalValue: string;
  onExternalChange: (value: string) => void;
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
}

const LEAVE_STATUS: Record<
  string,
  { label: string; variant: "neutral" | "success" | "warning" | "danger" }
> = {
  PENDING: { label: "Bekliyor", variant: "warning" },
  APPROVED: { label: "Onayli", variant: "success" },
  REJECTED: { label: "Reddedildi", variant: "danger" },
  CANCELLED: { label: "Iptal", variant: "neutral" },
};

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="truncate text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center text-xs text-slate-500">
      {title}
    </div>
  );
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

function formatRecipientLabel(name: string, email: string): string {
  return `${name} (${email})`;
}

function addUniqueRecipient(current: string[], email: string): string[] {
  const normalized = email.trim();
  if (!normalized) return current;
  if (current.some((item) => item.toLowerCase() === normalized.toLowerCase())) return current;
  return [...current, normalized];
}

function RecipientPicker({
  label,
  recipients,
  options,
  externalValue,
  onExternalChange,
  onAdd,
  onRemove,
}: RecipientPickerProps) {
  const availableOptions = options.filter(
    (option) => !recipients.some((recipient) => recipient.toLowerCase() === option.email.toLowerCase()),
  );

  const addExternalRecipient = () => {
    onAdd(externalValue);
    onExternalChange("");
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        <span className="text-[11px] text-slate-600">Birden fazla alıcı eklenebilir</span>
      </div>

      <div className="space-y-3">
        <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2">
          {recipients.map((recipient) => (
            <span
              key={recipient}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-100"
            >
              <span className="truncate">{recipient}</span>
              <button
                type="button"
                onClick={() => onRemove(recipient)}
                className="text-sky-300/70 hover:text-red-300"
                aria-label={`${recipient} alıcısını kaldır`}
              >
                x
              </button>
            </span>
          ))}
          {recipients.length === 0 && <span className="text-sm text-slate-600">Alıcı ekleyin</span>}
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              onAdd(event.target.value);
              event.target.value = "";
            }}
            className="h-9 min-w-0 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-xs text-white outline-none focus:border-sky-500/60"
          >
            <option value="">Kayıtlı kullanıcı seç</option>
            {availableOptions.map((option) => (
              <option key={option.email} value={option.email}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            value={externalValue}
            onChange={(event) => onExternalChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addExternalRecipient();
            }}
            placeholder="Kayıtlı olmayan e-posta"
            className="h-9 min-w-0 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-xs text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={addExternalRecipient}
            disabled={!externalValue.trim()}
          >
            Ekle
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmployeeMailComposer({
  isOpen,
  onClose,
  employeeName,
  employeeEmail,
}: EmployeeMailComposerProps) {
  const sendMail = useSendMail();
  const { user: currentUser } = useCurrentUser();
  const { data: tenantUsers = [] } = useTenantUsers();
  const defaultFrom = currentUser?.name.trim() ?? "";
  const defaultReplyTo = currentUser?.email.trim() ?? "";
  const tenantRecipientOptions = tenantUsers
    .filter((tenantUser) => tenantUser.isActive && tenantUser.user.isActive)
    .map((tenantUser) => ({
      label: formatRecipientLabel(tenantUser.user.name, tenantUser.user.email),
      email: tenantUser.user.email,
    }));

  const [toRecipients, setToRecipients] = useState<string[]>([employeeEmail]);
  const [toExternal, setToExternal] = useState("");
  const [from, setFrom] = useState(defaultFrom);
  const [replyTo, setReplyTo] = useState(defaultReplyTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MailAttachmentDraft[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);

  const resetAndClose = () => {
    setToRecipients([employeeEmail]);
    setToExternal("");
    setFrom(defaultFrom);
    setReplyTo(defaultReplyTo);
    setSubject("");
    setBody("");
    setAttachments([]);
    setFileError(null);
    setIsReadingFiles(false);
    onClose();
  };

  useEffect(() => {
    if (isOpen && defaultFrom && !from.trim()) {
      setFrom(defaultFrom);
    }
    if (isOpen && defaultReplyTo && !replyTo.trim()) {
      setReplyTo(defaultReplyTo);
    }
  }, [defaultFrom, defaultReplyTo, from, isOpen, replyTo]);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setFileError(null);
    if (files.length === 0) return;

    if (attachments.length + files.length > 5) {
      setFileError("En fazla 5 dosya ekleyebilirsiniz.");
      return;
    }

    const tooLarge = files.find((file) => file.size > 5 * 1024 * 1024);
    if (tooLarge) {
      setFileError(`${tooLarge.name} 5 MB sınırını aşıyor.`);
      return;
    }

    const currentSize = attachments.reduce((sum, item) => sum + item.size, 0);
    const nextSize = files.reduce((sum, file) => sum + file.size, currentSize);
    if (nextSize > 10 * 1024 * 1024) {
      setFileError("Toplam dosya eki boyutu 10 MB sınırını aşıyor.");
      return;
    }

    setIsReadingFiles(true);
    try {
      const nextAttachments = await Promise.all(files.map(readFileAsAttachment));
      setAttachments((prev) => [...prev, ...nextAttachments]);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Dosya okunamadı.");
    } finally {
      setIsReadingFiles(false);
    }
  };

  const handleSend = async () => {
    try {
      await sendMail.mutateAsync({
        to: toRecipients,
        subject: subject.trim(),
        html: textToHtml(body.trim()),
        ...(replyTo.trim() && { replyTo: replyTo.trim() }),
        ...(attachments.length > 0 && {
          attachments: attachments.map(({ filename, content, contentType }) => ({
            filename,
            content,
            contentType,
          })),
        }),
      });
      resetAndClose();
    } catch {
      // useSendMail handles the toast; keep the composer open for correction.
    }
  };

  const canSend =
    toRecipients.length > 0 &&
    Boolean(subject.trim() && body.trim()) &&
    !sendMail.isPending &&
    !isReadingFiles;

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Mail gönder"
      description={`${employeeName} için yeni ileti`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={resetAndClose}>
            İptal
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!canSend}
            loading={sendMail.isPending}
            leftIcon={<Send className="h-3.5 w-3.5" />}
          >
            {isReadingFiles ? "Dosya okunuyor" : "Gönder"}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <RecipientPicker
          label="Hangi adrese mail atılacak?"
          recipients={toRecipients}
          options={tenantRecipientOptions}
          externalValue={toExternal}
          onExternalChange={setToExternal}
          onAdd={(email) => setToRecipients((prev) => addUniqueRecipient(prev, email))}
          onRemove={(email) => setToRecipients((prev) => prev.filter((item) => item !== email))}
        />

        <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Kimden</span>
            <input
              value={from}
              readOnly
              placeholder="Ad soyad"
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Yanıt adresi</span>
            <input
              value={replyTo}
              onChange={(event) => setReplyTo(event.target.value)}
              placeholder="Yanıtların geleceği e-posta adresi"
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Konu</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Mail başlığı"
            className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
          />
        </label>

        <label className="mt-3 block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Açıklama</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={9}
            placeholder="Mail içeriğini yazın"
            className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
          />
        </label>
        </div>

        <div className="space-y-2 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:border-sky-500/50 hover:text-sky-300">
              <Paperclip className="h-3.5 w-3.5" />
              Dosya ekle
              <input type="file" multiple className="hidden" onChange={handleFiles} />
            </label>
            <span className="text-[11px] text-slate-600">5 dosya, toplam 10 MB</span>
          </div>
          {isReadingFiles && <p className="text-xs text-sky-300">Dosya eki hazırlanıyor...</p>}
          {fileError && <p className="text-xs text-red-400">{fileError}</p>}
          {attachments.length > 0 && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              {attachments.map((attachment) => (
                <div key={`${attachment.filename}-${attachment.size}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-200">{attachment.filename}</p>
                    <p className="text-[11px] text-slate-500">{formatFileSize(attachment.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((item) => item !== attachment))}
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
  );
}

export function EmployeeDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: emp, isLoading } = useEmployee(id);
  const [mailOpen, setMailOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  if (!emp) {
    return (
      <div className="py-20 text-center text-slate-400">
        Personel bulunamadi.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        subtitle={[emp.position, emp.department].filter(Boolean).join(" - ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMailOpen(true)}
              disabled={!emp.email}
              leftIcon={<Mail className="h-4 w-4" />}
            >
              Mail gönder
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              Geri
            </Button>
          </div>
        }
      />

      <section className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Personel</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-white">
                {emp.firstName} {emp.lastName}
              </h2>
            </div>
            <Badge variant={emp.isActive ? "success" : "neutral"}>
              {emp.isActive ? "Aktif" : "Pasif"}
            </Badge>
          </div>

          <EntityImageManager
            entityType="EMPLOYEE"
            entityId={id}
            label="Profil fotografi"
            description=""
            variant="avatar"
          />
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <InfoTile icon={<Mail className="h-3.5 w-3.5" />} label="E-posta" value={emp.email ?? "-"} />
          <InfoTile icon={<Phone className="h-3.5 w-3.5" />} label="Telefon" value={emp.phone ?? "-"} />
          <InfoTile icon={<CalendarDays className="h-3.5 w-3.5" />} label="Ise Giris" value={formatDate(emp.hireDate)} />
          <InfoTile icon={<Wallet className="h-3.5 w-3.5" />} label="Maas" value={formatCurrency(emp.salary)} />
          <InfoTile icon={<BriefcaseBusiness className="h-3.5 w-3.5" />} label="Pozisyon" value={emp.position ?? "-"} />
          <InfoTile icon={<Building2 className="h-3.5 w-3.5" />} label="Departman" value={emp.department ?? "-"} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Izin Talepleri</h3>
            <Badge variant="neutral">{emp.leaveRequests?.length ?? 0}</Badge>
          </div>
          {emp.leaveRequests && emp.leaveRequests.length > 0 ? (
            <div className="space-y-3">
              {emp.leaveRequests.map((lr) => {
                const status = LEAVE_STATUS[lr.status];
                return (
                  <div key={lr.id} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-sm text-white">{lr.type}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {formatDate(lr.startDate)} - {formatDate(lr.endDate)} ({lr.days} gun)
                      </span>
                    </div>
                    {status && <Badge variant={status.variant}>{status.label}</Badge>}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyPanel title="Bu personel icin izin talebi yok." />
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Bordro Gecmisi</h3>
            <Badge variant="neutral">{emp.payrolls?.length ?? 0}</Badge>
          </div>
          {emp.payrolls && emp.payrolls.length > 0 ? (
            <div className="space-y-3">
              {emp.payrolls.map((payroll) => (
                <div key={payroll.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-mono text-sm text-sky-400">{payroll.period}</span>
                    <span className="block truncate text-xs text-slate-500">
                      Brut: {formatCurrency(payroll.grossSalary)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-medium text-white">
                      {formatCurrency(payroll.netSalary)}
                    </span>
                    {payroll.paidAt ? (
                      <Badge variant="success">Odendi</Badge>
                    ) : (
                      <Badge variant="warning">Bekliyor</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel title="Bu personel icin bordro kaydi yok." />
          )}
        </div>
      </section>

      <AttachmentPanel entityType="EMPLOYEE" entityId={id} />
      <EntityTaskActions entityType="EMPLOYEE" entityId={id} entityLabel={`${emp.firstName} ${emp.lastName}`} module="hr" />
      <EntityActivityTimeline entityType="EMPLOYEE" entityId={id} />

      {emp.email && (
        <EmployeeMailComposer
          isOpen={mailOpen}
          onClose={() => setMailOpen(false)}
          employeeName={`${emp.firstName} ${emp.lastName}`}
          employeeEmail={emp.email}
        />
      )}
    </div>
  );
}
