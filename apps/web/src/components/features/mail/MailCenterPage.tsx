"use client";

import { useMemo, useState } from "react";
import { Eye, Mail, Paperclip, Send, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  useMailHistory,
  useMailMessage,
  useSendBulkMail,
} from "@/hooks/useMail";
import { useTenantUsers } from "@/hooks/useUsers";
import { formatDate } from "@/lib/utils";
import type {
  MailDeliveryStatus,
  MailDirection,
  MailMessageListItem,
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

export function MailCenterPage() {
  const { user } = useCurrentUser();
  const { data: tenantUsers = [] } = useTenantUsers();
  const sendBulkMail = useSendBulkMail();
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
  const recipients = parseRecipients(recipientsText);
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
    setComposeOpen(false);
  };

  const addTenantUser = (email: string) => {
    setRecipientsText((prev) =>
      parseRecipients(`${prev}\n${email}`).join("\n"),
    );
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
    <div className="space-y-6">
      <PageHeader
        title="Mail Merkezi"
        subtitle="Giden mailler, ekler ve toplu gönderimler"
        action={
          <Button
            size="sm"
            onClick={() => setComposeOpen(true)}
            leftIcon={<Send className="h-4 w-4" />}
          >
            Toplu mail
          </Button>
        }
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-4">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Konu, alici veya gonderen ara"
            className="h-9 min-w-64 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
          />
          <select
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value as MailDirection | "");
              setPage(1);
            }}
            className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500/60"
          >
            <option value="">Tum yonler</option>
            <option value="OUTBOUND">Giden</option>
            <option value="INBOUND">Gelen</option>
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as MailDeliveryStatus | "");
              setPage(1);
            }}
            className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500/60"
          >
            <option value="">Tum durumlar</option>
            <option value="SENT">Gonderildi</option>
            <option value="FAILED">Hatali</option>
            <option value="PENDING">Bekliyor</option>
          </select>
        </div>

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
    </div>
  );
}
