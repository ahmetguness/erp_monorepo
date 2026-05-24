import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

interface SmokeCheck {
  label: string;
  file: string;
  includes: readonly string[];
}

const repoRoot = path.resolve(__dirname, '../../..');

const checks: readonly SmokeCheck[] = [
  {
    label: 'login page is wired',
    file: 'apps/web/src/app/(auth)/login/page.tsx',
    includes: ['LoginForm'],
  },
  {
    label: 'dashboard page renders dashboard overview',
    file: 'apps/web/src/app/(dashboard)/dashboard/page.tsx',
    includes: ['DashboardOverview'],
  },
  {
    label: 'contacts list and detail routes exist',
    file: 'apps/web/src/app/(dashboard)/dashboard/contacts/page.tsx',
    includes: ['ContactsListPage'],
  },
  {
    label: 'contact detail route is wired',
    file: 'apps/web/src/app/(dashboard)/dashboard/contacts/[id]/page.tsx',
    includes: ['ContactDetailPage'],
  },
  {
    label: 'invoice create route is wired',
    file: 'apps/web/src/app/(dashboard)/dashboard/invoices/new/page.tsx',
    includes: ['InvoiceFormPage'],
  },
  {
    label: 'invoice create service uses typed API contract',
    file: 'apps/web/src/services/sales.service.ts',
    includes: ['CreateInvoiceDTO', "apiClient.post('/api/invoices'", 'safeParse(SingleResponseSchema(InvoiceSchema)'],
  },
  {
    label: 'document upload flow is visible and uses attachment upload',
    file: 'apps/web/src/components/features/documents/DocumentCenterPage.tsx',
    includes: ['useUploadAttachment', 'type="file"', 'submitUpload', 'metadata'],
  },
  {
    label: 'document upload service posts multipart data',
    file: 'apps/web/src/services/attachment.service.ts',
    includes: ['FormData', "apiClient.post('/api/attachments/upload'", 'multipart/form-data'],
  },
  {
    label: 'Ctrl+K command palette is mounted in header',
    file: 'apps/web/src/components/shared/Header.tsx',
    includes: ['GlobalSearch'],
  },
  {
    label: 'Ctrl+K command palette handles keyboard and recent records',
    file: 'apps/web/src/components/shared/GlobalSearch.tsx',
    includes: ['event.ctrlKey', "event.key.toLocaleLowerCase('tr-TR') === 'k'", 'useGlobalSearch', 'router.push', 'axon.commandPalette.recent'],
  },
  {
    label: 'mail template and AI draft UI is wired',
    file: 'apps/web/src/components/features/mail/MailCenterPage.tsx',
    includes: ['selectedTemplateId', 'templateVariables', 'createAiDraft', 'renderTemplate', 'AI ile taslak'],
  },
  {
    label: 'mail template and AI draft service contracts are typed',
    file: 'apps/web/src/services/mail.service.ts',
    includes: ['MailTemplateIdSchema', 'MailTemplateVariableKeySchema', "apiClient.get('/api/mail/templates'", "apiClient.post('/api/mail/ai-draft'"],
  },
];

async function assertFileExists(relativePath: string): Promise<void> {
  await access(path.join(repoRoot, relativePath));
}

async function runCheck(check: SmokeCheck): Promise<void> {
  const absolutePath = path.join(repoRoot, check.file);
  await assertFileExists(check.file);
  const content = await readFile(absolutePath, 'utf8');
  const missing = check.includes.filter((expected) => !content.includes(expected));
  if (missing.length > 0) {
    throw new Error(`${check.label}: ${check.file} icinde eksik isaretler: ${missing.join(', ')}`);
  }
}

async function main(): Promise<void> {
  for (const check of checks) {
    await runCheck(check);
  }
  console.log(`Web smoke flow checks: OK (${checks.length})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Web smoke flow checks failed');
  process.exit(1);
});
