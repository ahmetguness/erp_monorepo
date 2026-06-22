"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Edit3,
  Eye,
  FileText,
  Mail,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { FeaturePageShell } from "@/components/shared/FeaturePageShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MailCenterFilters } from "./MailCenterFilters";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  useMailHistory,
  useMailMessage,
  useMailSummary,
  useMailTemplateLifecycle,
  useMailTemplates,
  useApproveMailTemplate,
  useCreateAiMailDraft,
  useCreateMailTemplate,
  useDeleteMailTemplate,
  useRenderMailTemplate,
  useSendBulkMail,
  useUpdateMailTemplate,
} from "@/hooks/useMail";
import { useTenantUsers } from "@/hooks/useUsers";
import { formatDate } from "@/lib/utils";
import type {
  MailDeliveryStatus,
  MailDraftTone,
  MailDirection,
  MailMessageListItem,
  MailTemplate,
  MailTemplateId,
  MailTemplateVariableDefinition,
  MailTemplateVariableKey,
  MailTemplateVariables,
  UpsertMailTemplateDTO,
} from "@/services/mail.service";

interface MailAttachmentDraft {
  filename: string;
  content: string;
  contentType?: string;
  size: number;
}

const STATUS_LABELS: Record<MailDeliveryStatus, string> = {
  PENDING: "Bekliyor",
  SENT: "Gonderildi",
  FAILED: "Hatali",
};

const DIRECTION_LABELS: Record<MailDirection, string> = {
  INBOUND: "Gelen",
  OUTBOUND: "Giden",
};

const AI_TONE_LABELS: Record<MailDraftTone, string> = {
  formal: "Resmi",
  friendly: "Samimi",
  short: "Kisa",
};

const AI_TONES: readonly MailDraftTone[] = ["formal", "friendly", "short"];

const TEMPLATE_VARIABLES: readonly MailTemplateVariableDefinition[] = [
  { key: "customerName", label: "Musteri adi", required: false, example: "Acme Ltd." },
  { key: "invoiceNo", label: "Fatura no", required: false, example: "FTR-2026-001" },
  { key: "dueDate", label: "Vade tarihi", required: false, example: "31.05.2026" },
  { key: "amount", label: "Tutar", required: false, example: "25.000 TL" },
  { key: "employeeName", label: "Personel adi", required: false, example: "Ayse Yilmaz" },
  { key: "quoteNo", label: "Teklif no", required: false, example: "TKL-2026-014" },
  { key: "serviceNo", label: "Servis no", required: false, example: "SRV-2026-008" },
];

interface TemplateFormState {
  id: string | null;
  name: string;
  category: string;
  description: string;
  subject: string;
  body: string;
  enabledVariables: MailTemplateVariableKey[];
  requiredVariables: MailTemplateVariableKey[];
  approved: boolean;
}

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  id: null,
  name: "",
  category: "Genel",
  description: "",
  subject: "",
  body: "",
  enabledVariables: [],
  requiredVariables: [],
  approved: false,
};

function textToHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .split("\n")
    .map((line) => (line.trim() ? line : "&nbsp;"))
    .join("<br>");
}

function htmlToReadableText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRecipients(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    reader.onerror = () => reject(new Error(`${file.name} okunamadi.`));
    reader.readAsDataURL(file);
  });
}

function templateToForm(template: MailTemplate): TemplateFormState {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    subject: template.subject,
    body: template.body,
    enabledVariables: template.variables.map((variable) => variable.key),
    requiredVariables: template.variables
      .filter((variable) => variable.required)
      .map((variable) => variable.key),
    approved: template.approved,
  };
}

function buildTemplatePayload(form: TemplateFormState): UpsertMailTemplateDTO {
  const variables = TEMPLATE_VARIABLES
    .filter((variable) => form.enabledVariables.includes(variable.key))
    .map((variable) => ({
      ...variable,
      required: form.requiredVariables.includes(variable.key),
    }));

  return {
    name: form.name.trim(),
    category: form.category.trim(),
    description: form.description.trim(),
    subject: form.subject.trim(),
    body: form.body.trim(),
    variables,
    approved: form.approved,
  };
}

function statusVariant(
  status: MailDeliveryStatus,
): "neutral" | "success" | "danger" | "warning" {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PENDING") return "warning";
  return "neutral";
}

function MailRow({
  mail,
  onOpen,
}: {
  mail: MailMessageListItem;
  onOpen: (id: string) => void;
}) {
  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-900/70">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant={mail.direction === "OUTBOUND" ? "info" : "neutral"}>
            {DIRECTION_LABELS[mail.direction]}
          </Badge>
          <Badge variant={statusVariant(mail.status)}>
            {STATUS_LABELS[mail.status]}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="max-w-md truncate text-sm font-medium text-slate-100">
          {mail.subject}
        </p>
        <p className="max-w-md truncate text-xs text-slate-500">
          {mail.textPreview || "-"}
        </p>
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">
        <p className="max-w-[220px] truncate">{mail.to.join(", ")}</p>
        {mail.sentBy && (
          <p className="mt-0.5 text-slate-600">{mail.sentBy.name}</p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {mail.attachmentCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-slate-300">
            <Paperclip className="h-3.5 w-3.5" />
            {mail.attachmentCount}
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {formatDate(mail.sentAt ?? mail.createdAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpen(mail.id)}
          leftIcon={<Eye className="h-3.5 w-3.5" />}
        >
          Detay
        </Button>
      </td>
    </tr>
  );
}

function MailBodyPreview({ html }: { html: string }) {
  const readableBody = htmlToReadableText(html);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 shadow-inner shadow-slate-950/40">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-sky-400" />
          <span className="text-xs font-semibold text-slate-200">
            Mail icerigi
          </span>
        </div>
        <span className="rounded-full border border-slate-800 px-2 py-1 text-[11px] text-slate-500">
          Onizleme
        </span>
      </div>
      <div className="max-h-72 min-h-44 overflow-auto px-4 py-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
          {readableBody || "Icerik bulunamadi."}
        </p>
      </div>
    </section>
  );
}

function MailStatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export function MailCenterPage() {
  const { user } = useCurrentUser();
  const { data: tenantUsers = [] } = useTenantUsers();
  const { data: mailTemplates = [] } = useMailTemplates();
  const { data: mailSummary } = useMailSummary();
  const { data: templateLifecycle } = useMailTemplateLifecycle();
  const sendBulkMail = useSendBulkMail();
  const renderTemplate = useRenderMailTemplate();
  const createAiDraft = useCreateAiMailDraft();
  const createTemplate = useCreateMailTemplate();
  const updateTemplate = useUpdateMailTemplate();
  const approveTemplate = useApproveMailTemplate();
  const deleteTemplate = useDeleteMailTemplate();
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<MailDirection | "">("");
  const [status, setStatus] = useState<MailDeliveryStatus | "">("");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [replyTo, setReplyTo] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MailAttachmentDraft[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    MailTemplateId | ""
  >("");
  const [templateVariables, setTemplateVariables] =
    useState<MailTemplateVariables>({});
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiTone, setAiTone] = useState<MailDraftTone>("formal");
  const [aiAudience, setAiAudience] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      ...(direction && { direction }),
      ...(status && { status }),
      ...(search.trim() && { search: search.trim() }),
    }),
    [direction, page, search, status],
  );

  const { data, isLoading } = useMailHistory(params);
  const { data: detail } = useMailMessage(detailId);
  const availableMailTemplates = useMemo(
    () => mailTemplates.filter((template) => template.scope === "SYSTEM" || template.approved),
    [mailTemplates],
  );
  const selectedTemplate = useMemo(
    () => availableMailTemplates.find((template) => template.id === selectedTemplateId),
    [availableMailTemplates, selectedTemplateId],
  );
  const recipients = parseRecipients(recipientsText);
  const tenantTemplates = mailTemplates.filter((template) => template.scope === "TENANT");
  const canSaveTemplate = Boolean(
    templateForm.name.trim() &&
      templateForm.category.trim() &&
      templateForm.subject.trim() &&
      templateForm.body.trim(),
  );
  const canSend =
    recipients.length > 0 &&
    Boolean(subject.trim() && body.trim()) &&
    !isReadingFiles &&
    !sendBulkMail.isPending;

  const resetCompose = () => {
    setRecipientsText("");
    setReplyTo(user?.email ?? "");
    setSubject("");
    setBody("");
    setAttachments([]);
    setFileError(null);
    setIsReadingFiles(false);
    setSelectedTemplateId("");
    setTemplateVariables({});
    setAiPanelOpen(false);
    setAiTone("formal");
    setAiAudience("");
    setAiNotes("");
    setComposeOpen(false);
  };

  const resetTemplateForm = () => {
    setTemplateForm(EMPTY_TEMPLATE_FORM);
  };

  const updateTemplateForm = <K extends keyof TemplateFormState>(
    key: K,
    value: TemplateFormState[K],
  ) => {
    setTemplateForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTemplateVariable = (key: MailTemplateVariableKey) => {
    setTemplateForm((prev) => {
      const enabled = prev.enabledVariables.includes(key);
      return {
        ...prev,
        enabledVariables: enabled
          ? prev.enabledVariables.filter((item) => item !== key)
          : [...prev.enabledVariables, key],
        requiredVariables: enabled
          ? prev.requiredVariables.filter((item) => item !== key)
          : prev.requiredVariables,
      };
    });
  };

  const toggleRequiredVariable = (key: MailTemplateVariableKey) => {
    setTemplateForm((prev) => ({
      ...prev,
      requiredVariables: prev.requiredVariables.includes(key)
        ? prev.requiredVariables.filter((item) => item !== key)
        : [...prev.requiredVariables, key],
    }));
  };

  const saveTemplate = async () => {
    const payload = buildTemplatePayload(templateForm);
    if (templateForm.id) {
      await updateTemplate.mutateAsync({ id: templateForm.id, data: payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    resetTemplateForm();
  };

  const addTenantUser = (email: string) => {
    setRecipientsText((prev) =>
      parseRecipients(`${prev}\n${email}`).join("\n"),
    );
  };

  const selectTemplate = (value: string) => {
    const template = availableMailTemplates.find((item) => item.id === value);
    if (!template) {
      setSelectedTemplateId("");
      setTemplateVariables({});
      return;
    }

    setSelectedTemplateId(template.id);
    setTemplateVariables((prev) =>
      template.variables.reduce<MailTemplateVariables>((acc, variable) => {
        acc[variable.key] = prev[variable.key] ?? "";
        return acc;
      }, {}),
    );
  };

  const updateTemplateVariable = (
    key: MailTemplateVariableKey,
    value: string,
  ) => {
    setTemplateVariables((prev) => ({ ...prev, [key]: value }));
  };

  const applySelectedTemplate = async () => {
    if (!selectedTemplate) return;
    const rendered = await renderTemplate.mutateAsync({
      templateId: selectedTemplate.id,
      variables: templateVariables,
    });
    setSubject(rendered.subject);
    setBody(rendered.body);
  };

  const createDraftWithAi = async () => {
    if (!selectedTemplate) return;
    const draft = await createAiDraft.mutateAsync({
      templateId: selectedTemplate.id,
      variables: templateVariables,
      tone: aiTone,
      ...(aiAudience.trim() && { audience: aiAudience.trim() }),
      ...(aiNotes.trim() && { notes: aiNotes.trim() }),
    });
    setSubject(draft.subject);
    setBody(draft.body);
    setAiPanelOpen(false);
  };

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
      setFileError(`${tooLarge.name} 5 MB sinirini asiyor.`);
      return;
    }

    const currentSize = attachments.reduce((sum, item) => sum + item.size, 0);
    const nextSize = files.reduce((sum, file) => sum + file.size, currentSize);
    if (nextSize > 10 * 1024 * 1024) {
      setFileError("Toplam dosya eki boyutu 10 MB sinirini asiyor.");
      return;
    }

    setIsReadingFiles(true);
    try {
      const nextAttachments = await Promise.all(
        files.map(readFileAsAttachment),
      );
      setAttachments((prev) => [...prev, ...nextAttachments]);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Dosya okunamadi.");
    } finally {
      setIsReadingFiles(false);
    }
  };

  const handleSend = async () => {
    await sendBulkMail.mutateAsync({
      recipients,
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
    resetCompose();
  };

  return (
    <FeaturePageShell
      contentClassName="space-y-6"
      title="Mail Merkezi"
        subtitle="Giden mailler, ekler ve toplu gönderimler"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTemplateManagerOpen(true)}
              leftIcon={<FileText className="h-4 w-4" />}
            >
              Sablonlar
            </Button>
            <Button
              size="sm"
              onClick={() => setComposeOpen(true)}
              leftIcon={<Send className="h-4 w-4" />}
            >
              Toplu mail
            </Button>
          </div>
        }
    >

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MailStatCard label="Giden" value={String(mailSummary?.outboundCount ?? 0)} hint="Gonderim kaydi" />
        <MailStatCard label="Bekleyen" value={String(mailSummary?.pendingCount ?? 0)} hint="Batch kuyrugu" />
        <MailStatCard label="Basarili" value={String(mailSummary?.sentCount ?? 0)} hint="Teslimat kaydi" />
        <MailStatCard label="Hatali" value={String(mailSummary?.failedCount ?? 0)} hint="Delivery/reply takip" />
        <MailStatCard label="Tenant sablon" value={String(templateLifecycle?.tenantCount ?? 0)} hint={`${templateLifecycle?.approvedTenantCount ?? 0} onayli`} />
        <MailStatCard label="Taslak sablon" value={String(templateLifecycle?.draftTenantCount ?? 0)} hint={`Son v${templateLifecycle?.latestTenantVersion ?? 0}`} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <MailCenterFilters
          search={search}
          direction={direction}
          status={status}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onDirectionChange={(value) => {
            setDirection(value);
            setPage(1);
          }}
          onStatusChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Mail</th>
                <th className="px-4 py-3">Alicilar</th>
                <th className="px-4 py-3">Ek</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Yukleniyor...
                  </td>
                </tr>
              )}
              {!isLoading && (data?.data.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Mail kaydi bulunamadi.
                  </td>
                </tr>
              )}
              {data?.data.map((mail) => (
                <MailRow key={mail.id} mail={mail} onOpen={setDetailId} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
          <span>{data?.meta.total ?? 0} kayit</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Onceki
            </Button>
            <span>Sayfa {page}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!data || page >= data.meta.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      </section>

      <Modal
        isOpen={composeOpen}
        onClose={resetCompose}
        title="Toplu mail gonder"
        description="Ayni maili birden fazla aliciya ayri kayitlarla gonderir"
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={resetCompose}>
              Iptal
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!canSend}
              loading={sendBulkMail.isPending}
            >
              {isReadingFiles
                ? "Dosya okunuyor"
                : `${recipients.length || 0} aliciya gonder`}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-300">
                Alicilar
              </span>
              <span className="text-[11px] text-slate-600">
                Virgul, noktalı virgul veya yeni satir kullanin
              </span>
            </div>
            <textarea
              value={recipientsText}
              onChange={(event) => setRecipientsText(event.target.value)}
              rows={4}
              placeholder="ornek@sirket.com"
              className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {tenantUsers.slice(0, 8).map((tenantUser) => (
                <button
                  key={tenantUser.user.email}
                  type="button"
                  onClick={() => addTenantUser(tenantUser.user.email)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:border-sky-500/50 hover:text-sky-300"
                >
                  <Users className="h-3 w-3" />
                  {tenantUser.user.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Kimden</span>
              <input
                value={user?.name ?? ""}
                readOnly
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 text-sm text-slate-200 outline-none"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-400">
                Yanit adresi
              </span>
              <input
                value={replyTo}
                onChange={(event) => setReplyTo(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-sky-400" />
                <span className="text-xs font-semibold text-slate-300">
                  Sablon ve AI taslak
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={applySelectedTemplate}
                  disabled={!selectedTemplate || renderTemplate.isPending}
                  loading={renderTemplate.isPending}
                  leftIcon={<FileText className="h-3.5 w-3.5" />}
                >
                  Sablondan olustur
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAiPanelOpen((prev) => !prev)}
                  disabled={!selectedTemplate}
                  leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  AI ile taslak
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">
                  Sablon kutuphanesi
                </span>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => selectTemplate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
                >
                  <option value="">Sablon secin</option>
                  {availableMailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.category} - {template.name}
                      {template.scope === "TENANT" ? ` (v${template.version}${template.approved ? "" : ", taslak"})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTemplate && (
                <div className="self-end rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                  <p className="text-[11px] font-medium text-slate-300">
                    {selectedTemplate.name}
                  </p>
                  <p className="max-w-64 truncate text-[11px] text-slate-500">
                    {selectedTemplate.description}
                  </p>
                </div>
              )}
            </div>

            {selectedTemplate && selectedTemplate.variables.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {selectedTemplate.variables.map((variable) => (
                  <label key={variable.key} className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-400">
                      {variable.label}
                      {variable.required ? " *" : ""}
                    </span>
                    <input
                      value={templateVariables[variable.key] ?? ""}
                      onChange={(event) =>
                        updateTemplateVariable(variable.key, event.target.value)
                      }
                      placeholder={variable.example}
                      className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
                    />
                  </label>
                ))}
              </div>
            )}

            {aiPanelOpen && selectedTemplate && (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-400">
                      Ton
                    </span>
                    <select
                      value={aiTone}
                      onChange={(event) => {
                        const nextTone = AI_TONES.find(
                          (tone) => tone === event.target.value,
                        );
                        if (nextTone) setAiTone(nextTone);
                      }}
                      className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500/60"
                    >
                      {AI_TONES.map((tone) => (
                        <option key={tone} value={tone}>
                          {AI_TONE_LABELS[tone]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-400">
                      Baglam / hedef kitle
                    </span>
                    <input
                      value={aiAudience}
                      onChange={(event) => setAiAudience(event.target.value)}
                      placeholder="Orn. vadesi gecen B2B musterileri"
                      className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
                    />
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-400">
                    Ek not
                  </span>
                  <textarea
                    value={aiNotes}
                    onChange={(event) => setAiNotes(event.target.value)}
                    rows={3}
                    placeholder="AI taslakta dikkate alinacak kisa not"
                    className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={createDraftWithAi}
                    disabled={createAiDraft.isPending}
                    loading={createAiDraft.isPending}
                    leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                  >
                    Taslak uret
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Konu</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              />
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">
                Aciklama
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-sky-500/60"
              />
            </label>
          </div>

          <div className="space-y-2 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:border-sky-500/50 hover:text-sky-300">
                <Paperclip className="h-3.5 w-3.5" />
                Dosya ekle
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                />
              </label>
              <span className="text-[11px] text-slate-600">
                5 dosya, toplam 10 MB
              </span>
            </div>
            {isReadingFiles && (
              <p className="text-xs text-sky-300">Dosya eki hazirlaniyor...</p>
            )}
            {fileError && <p className="text-xs text-red-400">{fileError}</p>}
            {attachments.map((attachment) => (
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
                    setAttachments((prev) =>
                      prev.filter((item) => item !== attachment),
                    )
                  }
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={templateManagerOpen}
        onClose={() => {
          setTemplateManagerOpen(false);
          resetTemplateForm();
        }}
        title="Mail sablonlari"
        description="Tenant ozel sablon, versiyon ve onay durumunu yonetin"
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={resetTemplateForm}>
              Yeni form
            </Button>
            <Button
              size="sm"
              onClick={saveTemplate}
              disabled={!canSaveTemplate}
              loading={createTemplate.isPending || updateTemplate.isPending}
            >
              {templateForm.id ? "Versiyonla" : "Kaydet"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">
                Tenant sablonlari
              </p>
              <Badge variant="neutral">{tenantTemplates.length}</Badge>
            </div>
            <div className="max-h-[32rem] space-y-2 overflow-auto pr-1">
              {tenantTemplates.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                  Henuz tenant ozel sablon yok.
                </div>
              )}
              {tenantTemplates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {template.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        v{template.version} · {template.category}
                      </p>
                    </div>
                    <Badge variant={template.approved ? "success" : "warning"}>
                      {template.approved ? "Onayli" : "Taslak"}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                    {template.description || template.subject}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setTemplateForm(templateToForm(template))}
                      leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                    >
                      Duzenle
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={approveTemplate.isPending}
                      onClick={() =>
                        approveTemplate.mutate({
                          id: template.id,
                          data: { approved: !template.approved },
                        })
                      }
                      leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    >
                      {template.approved ? "Onayi kaldir" : "Onayla"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={deleteTemplate.isPending}
                      onClick={() => deleteTemplate.mutate(template.id)}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">
                  Sablon adi
                </span>
                <input
                  value={templateForm.name}
                  onChange={(event) => updateTemplateForm("name", event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">
                  Kategori
                </span>
                <input
                  value={templateForm.category}
                  onChange={(event) => updateTemplateForm("category", event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
                />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">
                Aciklama
              </span>
              <input
                value={templateForm.description}
                onChange={(event) => updateTemplateForm("description", event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Konu</span>
              <input
                value={templateForm.subject}
                onChange={(event) => updateTemplateForm("subject", event.target.value)}
                placeholder="{{customerName}} odeme hatirlatmasi"
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">
                Sablon metni
              </span>
              <textarea
                value={templateForm.body}
                onChange={(event) => updateTemplateForm("body", event.target.value)}
                rows={7}
                placeholder="Merhaba {{customerName}},"
                className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
              />
            </label>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-300">
                Degisken semasi
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEMPLATE_VARIABLES.map((variable) => {
                  const enabled = templateForm.enabledVariables.includes(variable.key);
                  return (
                    <div
                      key={variable.key}
                      className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5"
                    >
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleTemplateVariable(variable.key)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
                        />
                        {variable.label}
                      </label>
                      <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                        <input
                          type="checkbox"
                          checked={templateForm.requiredVariables.includes(variable.key)}
                          disabled={!enabled}
                          onChange={() => toggleRequiredVariable(variable.key)}
                          className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-sky-500 disabled:opacity-50"
                        />
                        Zorunlu
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={templateForm.approved}
                onChange={(event) => updateTemplateForm("approved", event.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              Onayli sablon olarak kullanima ac
            </label>
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title="Mail detayi"
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Mail className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">
                  {detail.subject}
                </h3>
              </div>
              <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                <p>
                  <span className="text-slate-600">Durum:</span>{" "}
                  {STATUS_LABELS[detail.status]}
                </p>
                <p>
                  <span className="text-slate-600">Yon:</span>{" "}
                  {DIRECTION_LABELS[detail.direction]}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-600">Alicilar:</span>{" "}
                  {detail.to.join(", ")}
                </p>
                {detail.replyTo && (
                  <p className="sm:col-span-2">
                    <span className="text-slate-600">Yanit:</span>{" "}
                    {detail.replyTo}
                  </p>
                )}
                {detail.error && (
                  <p className="sm:col-span-2 text-red-300">{detail.error}</p>
                )}
              </div>
            </div>

            {(detail.attachments?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="mb-2 text-xs font-semibold text-slate-300">
                  Ekler
                </p>
                <div className="space-y-2">
                  {detail.attachments?.map((attachment) => (
                    <div
                      key={`${attachment.filename}-${attachment.sizeBytes}`}
                      className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-300"
                    >
                      <span>{attachment.filename}</span>
                      <span className="text-slate-500">
                        {formatFileSize(attachment.sizeBytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <MailBodyPreview html={detail.html} />
          </div>
        )}
      </Modal>
    </FeaturePageShell>
  );
}
