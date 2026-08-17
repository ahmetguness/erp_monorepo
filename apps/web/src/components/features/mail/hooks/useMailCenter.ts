"use client";

import { useMemo, useState } from "react";
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
import { useCurrentUser } from "@/hooks/useAuth";
import { useTenantUsers } from "@/hooks/useUsers";
import type { TenantUser } from "@/services/user.service";
import type {
  MailDeliveryStatus,
  MailDraftTone,
  MailDirection,
  MailTemplate,
  MailTemplateId,
  MailTemplateVariableKey,
  MailTemplateVariables,
  UpsertMailTemplateDTO,
} from "@/services/mail.service";

// ─────────────────────────────────────────────────────────────────────────────
// Types (shared between hook and page)
// ─────────────────────────────────────────────────────────────────────────────

export interface MailAttachmentDraft {
  filename: string;
  content: string;
  contentType?: string;
  size: number;
}

export interface TemplateFormState {
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

export const EMPTY_TEMPLATE_FORM: TemplateFormState = {
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

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper functions
// ─────────────────────────────────────────────────────────────────────────────

export function textToHtml(value: string): string {
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

export function htmlToReadableText(value: string): string {
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

export function parseRecipients(value: string): string[] {
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

export function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function readFileAsAttachment(file: File): Promise<MailAttachmentDraft> {
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

export function templateToForm(template: MailTemplate): TemplateFormState {
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

export function buildTemplatePayload(form: TemplateFormState): UpsertMailTemplateDTO {
  const TEMPLATE_VARIABLES_KEYS: MailTemplateVariableKey[] = [
    "customerName",
    "invoiceNo",
    "dueDate",
    "amount",
    "employeeName",
    "quoteNo",
    "serviceNo",
  ];
  const variables = TEMPLATE_VARIABLES_KEYS.filter((key) =>
    form.enabledVariables.includes(key),
  ).map((key) => ({
    key,
    label: key,
    required: form.requiredVariables.includes(key),
    example: "",
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

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseMailCenterReturn {
  // Data
  user: ReturnType<typeof useCurrentUser>["user"];
  tenantUsers: TenantUser[];
  mailTemplates: MailTemplate[];
  mailSummary: ReturnType<typeof useMailSummary>["data"];
  templateLifecycle: ReturnType<typeof useMailTemplateLifecycle>["data"];
  data: ReturnType<typeof useMailHistory>["data"];
  isLoading: boolean;
  detail: ReturnType<typeof useMailMessage>["data"];
  availableMailTemplates: MailTemplate[];
  selectedTemplate: MailTemplate | undefined;
  tenantTemplates: MailTemplate[];

  // Mutations
  sendBulkMail: ReturnType<typeof useSendBulkMail>;
  renderTemplate: ReturnType<typeof useRenderMailTemplate>;
  createAiDraft: ReturnType<typeof useCreateAiMailDraft>;
  createTemplate: ReturnType<typeof useCreateMailTemplate>;
  updateTemplate: ReturnType<typeof useUpdateMailTemplate>;
  approveTemplate: ReturnType<typeof useApproveMailTemplate>;
  deleteTemplate: ReturnType<typeof useDeleteMailTemplate>;

  // List/filter state
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  direction: MailDirection | "";
  setDirection: React.Dispatch<React.SetStateAction<MailDirection | "">>;
  status: MailDeliveryStatus | "";
  setStatus: React.Dispatch<React.SetStateAction<MailDeliveryStatus | "">>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;

  // Compose state
  composeOpen: boolean;
  setComposeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  detailId: string | null;
  setDetailId: React.Dispatch<React.SetStateAction<string | null>>;
  recipientsText: string;
  setRecipientsText: React.Dispatch<React.SetStateAction<string>>;
  replyTo: string;
  setReplyTo: React.Dispatch<React.SetStateAction<string>>;
  subject: string;
  setSubject: React.Dispatch<React.SetStateAction<string>>;
  body: string;
  setBody: React.Dispatch<React.SetStateAction<string>>;
  attachments: MailAttachmentDraft[];
  setAttachments: React.Dispatch<React.SetStateAction<MailAttachmentDraft[]>>;
  fileError: string | null;
  setFileError: React.Dispatch<React.SetStateAction<string | null>>;
  isReadingFiles: boolean;
  recipients: string[];
  selectedTemplateId: MailTemplateId | "";
  templateVariables: MailTemplateVariables;

  // AI draft state
  aiPanelOpen: boolean;
  setAiPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  aiTone: MailDraftTone;
  setAiTone: React.Dispatch<React.SetStateAction<MailDraftTone>>;
  aiAudience: string;
  setAiAudience: React.Dispatch<React.SetStateAction<string>>;
  aiNotes: string;
  setAiNotes: React.Dispatch<React.SetStateAction<string>>;

  // Template manager state
  templateManagerOpen: boolean;
  setTemplateManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  templateForm: TemplateFormState;
  setTemplateForm: React.Dispatch<React.SetStateAction<TemplateFormState>>;

  // Derived flags
  canSaveTemplate: boolean;
  canSend: boolean;

  // Actions
  resetCompose: () => void;
  resetTemplateForm: () => void;
  updateTemplateFormField: <K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) => void;
  updateTemplateForm: <K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) => void;
  toggleTemplateVariable: (key: MailTemplateVariableKey) => void;
  toggleRequiredVariable: (key: MailTemplateVariableKey) => void;
  saveTemplate: () => Promise<void>;
  addTenantUser: (email: string) => void;
  selectTemplate: (value: string) => void;
  updateTemplateVariable: (key: MailTemplateVariableKey, value: string) => void;
  applySelectedTemplate: () => Promise<void>;
  createDraftWithAi: () => Promise<void>;
  handleFiles: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSend: () => Promise<void>;
}

export function useMailCenter(): UseMailCenterReturn {
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

  // ── List / filter state ─────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<MailDirection | "">("");
  const [status, setStatus] = useState<MailDeliveryStatus | "">("");
  const [search, setSearch] = useState("");

  // ── Compose state ────────────────────────────────────────────────────────
  const [composeOpen, setComposeOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [replyTo, setReplyTo] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MailAttachmentDraft[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<MailTemplateId | "">("");
  const [templateVariables, setTemplateVariables] = useState<MailTemplateVariables>({});

  // ── AI draft state ───────────────────────────────────────────────────────
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiTone, setAiTone] = useState<MailDraftTone>("formal");
  const [aiAudience, setAiAudience] = useState("");
  const [aiNotes, setAiNotes] = useState("");

  // ── Template manager state ───────────────────────────────────────────────
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);

  // ── Derived ──────────────────────────────────────────────────────────────
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
    () => mailTemplates.filter((t) => t.scope === "SYSTEM" || t.approved),
    [mailTemplates],
  );
  const selectedTemplate = useMemo(
    () => availableMailTemplates.find((t) => t.id === selectedTemplateId),
    [availableMailTemplates, selectedTemplateId],
  );

  const recipients = parseRecipients(recipientsText);
  const tenantTemplates = mailTemplates.filter((t) => t.scope === "TENANT");

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

  // ── Actions ──────────────────────────────────────────────────────────────

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

  const resetTemplateForm = () => setTemplateForm(EMPTY_TEMPLATE_FORM);

  const updateTemplateFormField = <K extends keyof TemplateFormState>(
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
    setRecipientsText((prev) => parseRecipients(`${prev}\n${email}`).join("\n"));
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

  const updateTemplateVariable = (key: MailTemplateVariableKey, value: string) => {
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
      const nextAttachments = await Promise.all(files.map(readFileAsAttachment));
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

  return {
    user,
    tenantUsers: tenantUsers as TenantUser[],
    mailTemplates,
    mailSummary,
    templateLifecycle,
    data,
    isLoading,
    detail,
    availableMailTemplates,
    selectedTemplate,
    tenantTemplates,
    sendBulkMail,
    renderTemplate,
    createAiDraft,
    createTemplate,
    updateTemplate,
    approveTemplate,
    deleteTemplate,
    page,
    setPage,
    direction,
    setDirection,
    status,
    setStatus,
    search,
    setSearch,
    composeOpen,
    setComposeOpen,
    detailId,
    setDetailId,
    recipientsText,
    setRecipientsText,
    replyTo,
    setReplyTo,
    subject,
    setSubject,
    body,
    setBody,
    attachments,
    setAttachments,
    fileError,
    setFileError,
    isReadingFiles,
    recipients,
    selectedTemplateId,
    templateVariables,
    aiPanelOpen,
    setAiPanelOpen,
    aiTone,
    setAiTone,
    aiAudience,
    setAiAudience,
    aiNotes,
    setAiNotes,
    templateManagerOpen,
    setTemplateManagerOpen,
    templateForm,
    setTemplateForm,
    canSaveTemplate,
    canSend,
    resetCompose,
    resetTemplateForm,
    updateTemplateFormField,
    updateTemplateForm: updateTemplateFormField,
    toggleTemplateVariable,
    toggleRequiredVariable,
    saveTemplate,
    addTenantUser,
    selectTemplate,
    updateTemplateVariable,
    applySelectedTemplate,
    createDraftWithAi,
    handleFiles,
    handleSend,
  };
}
