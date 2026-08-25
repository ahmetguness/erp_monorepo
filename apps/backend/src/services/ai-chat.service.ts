import { openai } from '../lib/openai';
import { ChatDataService } from './chat-data.service';
import { ChatContextService, type ChatPageContext, type LoadedChatEntityContext } from './chat-context.service';
import { logger } from '../lib/logger';
import { AI_MODELS, AI_PROMPT_VERSIONS, type AiTokenUsage } from './ai-governance.service';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';

// ─────────────────────────────────────────────
import { addToConversation, clearConversation, getConversation } from './ai-chat/conversation-store.js';
import { getPrivateSystemPrompt, PUBLIC_SYSTEM_PROMPT, PUBLIC_TOOLS } from './ai-chat/prompts.js';
import { executeFunctionCall, getAccessibleTools, type UserPermissions } from './ai-chat/tool-runtime.js';
export type { UserPermissions } from './ai-chat/tool-runtime.js';

// Model config — tek yerden değiştir
// ─────────────────────────────────────────────

const CHAT_MODEL = AI_MODELS.CHAT;
const purchaseRequestPreviewSessions = new Set<string>();
// OpenAI Function Definitions — ERP veri araçları
// Üç katmanlı erişim: Plan + Modül + Kullanıcı Rolü
// ─────────────────────────────────────────────

function buildContextMessages(
  context: ChatPageContext | undefined,
  entityContext: LoadedChatEntityContext | null,
): ChatCompletionMessageParam[] {
  if (!context && !entityContext) return [];

  const payload = {
    activePage: context
      ? {
          path: context.path,
          title: context.title,
          entityType: context.entityType,
          entityId: context.entityId,
          entityLabel: context.entityLabel,
        }
      : null,
    recentRecords: context?.recentRecords ?? [],
    activeRecord: entityContext,
  };

  return [{
    role: 'system',
    content:
      'Aktif sayfa/kayit baglami asagidadir. Bu veriler backend tarafindan tenant ve izin kontrolunden gecirilmistir. ' +
      'Yetkisiz veya bulunamayan aktif kayit icin veri uydurma; kullaniciya yetki/kayit durumunu sade bicimde soyle. ' +
      'Kullanicinin "bu kayit", "bu musteri", "bu teklif", "bu fatura", "bu personel" gibi ifadelerinde activeRecord bilgisini onceliklendir.\n' +
      JSON.stringify(payload),
  }];
}

export interface PrivateChatParams {
  message: string;
  tenantId: string;
  userId: string;
  userName: string;
  tenantName: string;
  plan: string;
  permissions: UserPermissions;
  tenantModules: string[];
  context?: ChatPageContext;
}

export interface PrivateChatResult {
  output: string;
  usedTools: boolean;
  governance: {
    promptVersion: string;
    model: string;
    entityContext: Record<string, unknown>;
    permissionCheckResult: 'ALLOWED' | 'PARTIAL' | 'DENIED';
    tokenUsage: AiTokenUsage;
  };
}

function addUsage(total: AiTokenUsage, response: ChatCompletion): AiTokenUsage {
  const usage = response.usage;
  return {
    prompt: (total.prompt ?? 0) + (usage?.prompt_tokens ?? 0),
    completion: (total.completion ?? 0) + (usage?.completion_tokens ?? 0),
    total: (total.total ?? 0) + (usage?.total_tokens ?? 0),
  };
}

function buildGovernanceEntityContext(
  context: ChatPageContext | undefined,
  entityContext: LoadedChatEntityContext | null,
): Record<string, unknown> {
  return {
    activePage: context
      ? {
          path: context.path,
          title: context.title ?? null,
          entityType: context.entityType ?? null,
          entityId: context.entityId ?? null,
          entityLabel: context.entityLabel ?? null,
        }
      : null,
    recentRecordCount: context?.recentRecords.length ?? 0,
    activeRecord: entityContext
      ? {
          allowed: entityContext.allowed,
          entityType: entityContext.entityType ?? null,
          suggestedActions: entityContext.suggestedActions,
          hasSummary: Boolean(entityContext.summary),
          message: entityContext.message ?? null,
        }
      : null,
  };
}

function permissionCheckResult(entityContext: LoadedChatEntityContext | null): 'ALLOWED' | 'PARTIAL' | 'DENIED' {
  if (!entityContext) return 'ALLOWED';
  if (entityContext.allowed && entityContext.summary) return 'ALLOWED';
  if (entityContext.allowed) return 'PARTIAL';
  return 'DENIED';
}

/**
 * Dashboard chatbot — ERP verilerine erişimli, function calling ile.
 */
export async function handlePrivateChat(params: PrivateChatParams): Promise<PrivateChatResult> {
  const { message, tenantId, userId, userName, tenantName, plan, permissions, tenantModules, context } = params;
  const sessionId = `private:${tenantId}:${userId}`;
  const planTools = getAccessibleTools(plan, permissions, tenantModules);
  const entityContext = await ChatContextService.loadEntityContext(tenantId, permissions, tenantModules, context);
  let tokenUsage: AiTokenUsage = {};

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: getPrivateSystemPrompt(tenantName, userName, plan),
  };

  const history = getConversation(sessionId);
  const userMessage: ChatCompletionMessageParam = {
    role: 'user',
    content: message,
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    ...buildContextMessages(context, entityContext),
    ...history,
    userMessage,
  ];

  let usedTools = Boolean(entityContext?.summary);

  // İlk çağrı
  let response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    ...(planTools.length > 0 && { tools: planTools }),
    temperature: 0.3,
    max_tokens: 1000,
  });
  tokenUsage = addUsage(tokenUsage, response);

  let choice = response.choices[0];

  // Function calling loop (max 3 iterasyon — güvenlik)
  let iterations = 0;
  while (choice.message.tool_calls && choice.message.tool_calls.length > 0 && iterations < 3) {
    usedTools = true;
    iterations++;

    messages.push(choice.message as ChatCompletionMessageParam);

    const toolResults = await Promise.all(
      choice.message.tool_calls
        .filter((tc): tc is ChatCompletionMessageFunctionToolCall => tc.type === 'function')
        .map(async (toolCall) => {
        const fnName = toolCall.function.name;
        let fnArgs: Record<string, unknown> = {};
        try { fnArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch { /* */ }
        const result = await executeFunctionCall(fnName, fnArgs, tenantId, sessionId, plan, permissions, tenantModules);
        return {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: result,
        };
      }),
    );

    messages.push(...toolResults);

    response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      ...(planTools.length > 0 && { tools: planTools }),
      temperature: 0.3,
      max_tokens: 1000,
    });
    tokenUsage = addUsage(tokenUsage, response);

    choice = response.choices[0];
  }

  const output = choice.message.content ?? 'Yanıt üretilemedi.';

  // Konuşma geçmişine ekle (sadece user + assistant)
  addToConversation(sessionId, [
    userMessage,
    { role: 'assistant', content: output },
  ]);

  return {
    output,
    usedTools,
    governance: {
      promptVersion: AI_PROMPT_VERSIONS.PRIVATE_CHAT,
      model: CHAT_MODEL,
      entityContext: buildGovernanceEntityContext(context, entityContext),
      permissionCheckResult: permissionCheckResult(entityContext),
      tokenUsage,
    },
  };
}

export interface PublicChatParams {
  message: string;
  sessionId: string;
}

export interface PublicChatResult {
  output: string;
  governance: {
    promptVersion: string;
    model: string;
    tokenUsage: AiTokenUsage;
  };
}

/**
 * Landing page chatbot — satış asistanı, demo talebi oluşturma.
 */
export async function handlePublicChat(
  params: PublicChatParams,
  createDemoFn: (data: { fullName: string; companyName: string; email: string; phone: string; plan: string }) => Promise<{ success: boolean; message?: string }>,
  checkEmailFn: (email: string) => Promise<{ available: boolean; message: string }>,
): Promise<PublicChatResult> {
  const { message, sessionId } = params;
  let tokenUsage: AiTokenUsage = {};

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: PUBLIC_SYSTEM_PROMPT,
  };

  const history = getConversation(sessionId);
  const userMessage: ChatCompletionMessageParam = {
    role: 'user',
    content: message,
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    ...history,
    userMessage,
  ];

  let response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    tools: PUBLIC_TOOLS,
    temperature: 0.7,
    max_tokens: 500,
  });
  tokenUsage = addUsage(tokenUsage, response);

  let choice = response.choices[0];

  // Function calling loop (max 3 iterasyon — email check + demo create)
  let iterations = 0;
  while (choice.message.tool_calls && choice.message.tool_calls.length > 0 && iterations < 3) {
    iterations++;
    const toolCallRaw = choice.message.tool_calls[0];
    if (toolCallRaw.type !== 'function') continue;
    const toolCall = toolCallRaw;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch { /* */ }

    let toolResult: string;

    if (toolCall.function.name === 'check_email_availability') {
      const email = String(args.email ?? '').trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email || !emailRegex.test(email)) {
        toolResult = JSON.stringify({ available: false, message: 'Geçersiz e-posta formatı.' });
      } else {
        try {
          const result = await checkEmailFn(email);
          toolResult = JSON.stringify(result);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Public chat email check error: ${errMsg}`);
          toolResult = JSON.stringify({ available: true, message: 'Kontrol yapılamadı, devam edebilirsiniz.' });
        }
      }
    } else if (toolCall.function.name === 'create_demo_request') {
      const email = String(args.email ?? '').trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!args.fullName || !args.companyName || !email || !emailRegex.test(email)) {
        toolResult = JSON.stringify({ success: false, message: 'Geçersiz veya eksik bilgi. Lütfen tekrar deneyin.' });
      } else {
        try {
          const planStr = String(args.plan ?? 'STARTER');
          const demoResult = await createDemoFn({
            fullName: String(args.fullName).slice(0, 100),
            companyName: String(args.companyName).slice(0, 100),
            email: email.slice(0, 254),
            phone: String(args.phone ?? '').slice(0, 20),
            plan: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(planStr) ? planStr : 'STARTER',
          });

          if (demoResult && demoResult.success === false) {
            toolResult = JSON.stringify({ success: false, message: demoResult.message ?? 'Demo talebi oluşturulamadı.' });
          } else {
            toolResult = JSON.stringify({ success: true, message: 'Demo talebi başarıyla oluşturuldu.' });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Public chat demo request error: ${errMsg}`);
          toolResult = JSON.stringify({ success: false, message: 'Demo talebi oluşturulamadı.' });
        }
      }
    } else {
      toolResult = JSON.stringify({ error: 'Bilinmeyen işlem.' });
    }

    messages.push(choice.message as ChatCompletionMessageParam);
    messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });

    response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools: PUBLIC_TOOLS,
      temperature: 0.7,
      max_tokens: 500,
    });
    tokenUsage = addUsage(tokenUsage, response);

    choice = response.choices[0];
  }

  const output = choice.message.content ?? 'Yanıt üretilemedi.';

  addToConversation(sessionId, [
    userMessage,
    { role: 'assistant', content: output },
  ]);

  return {
    output,
    governance: {
      promptVersion: AI_PROMPT_VERSIONS.PUBLIC_CHAT,
      model: CHAT_MODEL,
      tokenUsage,
    },
  };
}

/** Konuşma geçmişini temizle */
export { clearConversation };

// ─────────────────────────────────────────────
// Streaming — Public Chat
// ─────────────────────────────────────────────

type CreateDemoFn = (data: { fullName: string; companyName: string; email: string; phone: string; plan: string }) => Promise<{ success: boolean; message?: string }>;
type CheckEmailFn = (email: string) => Promise<{ available: boolean; message: string }>;

/**
 * Landing page chatbot — streaming versiyonu.
 * Tool call'lar (email check, demo create) non-streaming; son metin yanıtı stream edilir.
 */
export async function handlePublicChatStream(
  params: PublicChatParams,
  createDemoFn: CreateDemoFn,
  checkEmailFn: CheckEmailFn,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { message, sessionId } = params;

  const systemMessage: ChatCompletionMessageParam = { role: 'system', content: PUBLIC_SYSTEM_PROMPT };
  const history = getConversation(sessionId);
  const userMessage: ChatCompletionMessageParam = { role: 'user', content: message };
  const messages: ChatCompletionMessageParam[] = [systemMessage, ...history, userMessage];

  let fullText = '';

  try {
    // Tool call aşaması — non-streaming (tool call'lar stream edilemez)
    let response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools: PUBLIC_TOOLS,
      temperature: 0.7,
      max_tokens: 500,
    });

    let choice = response.choices[0];
    let iterations = 0;

    while (choice.message.tool_calls && choice.message.tool_calls.length > 0 && iterations < 3) {
      iterations++;
      const toolCallRaw = choice.message.tool_calls[0];
      if (toolCallRaw.type !== 'function') break;
      const toolCall = toolCallRaw;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch { /* */ }

      let toolResult: string;

      if (toolCall.function.name === 'check_email_availability') {
        const email = String(args.email ?? '').trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          toolResult = JSON.stringify({ available: false, message: 'Geçersiz e-posta formatı.' });
        } else {
          try {
            const result = await checkEmailFn(email);
            toolResult = JSON.stringify(result);
          } catch (err) {
            logger.error(`Public chat stream email check error: ${err instanceof Error ? err.message : String(err)}`);
            toolResult = JSON.stringify({ available: true, message: 'Kontrol yapılamadı, devam edebilirsiniz.' });
          }
        }
      } else if (toolCall.function.name === 'create_demo_request') {
        const email = String(args.email ?? '').trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!args.fullName || !args.companyName || !email || !emailRegex.test(email)) {
          toolResult = JSON.stringify({ success: false, message: 'Geçersiz veya eksik bilgi. Lütfen tekrar deneyin.' });
        } else {
          try {
            const planStr = String(args.plan ?? 'STARTER');
            const demoResult = await createDemoFn({
              fullName: String(args.fullName).slice(0, 100),
              companyName: String(args.companyName).slice(0, 100),
              email: email.slice(0, 254),
              phone: String(args.phone ?? '').slice(0, 20),
              plan: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(planStr) ? planStr : 'STARTER',
            });
            toolResult = demoResult?.success === false
              ? JSON.stringify({ success: false, message: demoResult.message ?? 'Demo talebi oluşturulamadı.' })
              : JSON.stringify({ success: true, message: 'Demo talebi başarıyla oluşturuldu.' });
          } catch (err) {
            logger.error(`Public chat stream demo request error: ${err instanceof Error ? err.message : String(err)}`);
            toolResult = JSON.stringify({ success: false, message: 'Demo talebi oluşturulamadı.' });
          }
        }
      } else {
        toolResult = JSON.stringify({ error: 'Bilinmeyen işlem.' });
      }

      messages.push(choice.message as ChatCompletionMessageParam);
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });

      response = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        tools: PUBLIC_TOOLS,
        temperature: 0.7,
        max_tokens: 500,
      });

      choice = response.choices[0];
    }

    // Tool call bitti — son yanıtı stream et
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      const stream = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [...messages, choice.message as ChatCompletionMessageParam],
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          await callbacks.onToken(delta);
        }
      }
    }

    if (!fullText) {
      fullText = choice.message.content ?? 'Yanıt üretilemedi.';
      if (fullText) await callbacks.onToken(fullText);
    }

    addToConversation(sessionId, [userMessage, { role: 'assistant', content: fullText }]);
    await callbacks.onDone(fullText, false);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await callbacks.onError(errMsg);
  }
}

export interface StreamCallbacks {
  onToken: (token: string) => void | Promise<void>;
  onToolStart: () => void | Promise<void>;
  onDone: (fullText: string, usedTools: boolean) => void | Promise<void>;
  onError: (error: string) => void | Promise<void>;
}

/**
 * Dashboard chatbot — streaming versiyonu.
 * Token token gönderir, function calling aşamasında "veri çekiliyor" sinyali verir.
 */
export async function handlePrivateChatStream(
  params: PrivateChatParams,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { message, tenantId, userId, userName, tenantName, plan, permissions, tenantModules, context } = params;
  const sessionId = `private:${tenantId}:${userId}`;
  const entityContext = await ChatContextService.loadEntityContext(tenantId, permissions, tenantModules, context);

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: getPrivateSystemPrompt(tenantName, userName, plan),
  };

  const history = getConversation(sessionId);
  const userMessage: ChatCompletionMessageParam = { role: 'user', content: message };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    ...buildContextMessages(context, entityContext),
    ...history,
    userMessage,
  ];
  const planTools = getAccessibleTools(plan, permissions, tenantModules);

  let usedTools = Boolean(entityContext?.summary);
  let fullText = '';

  try {
    // Function calling aşaması — streaming olmadan (tool call'lar stream edilemez)
    let preResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      ...(planTools.length > 0 && { tools: planTools }),
      temperature: 0.3,
      max_tokens: 1000,
    });

    let preChoice = preResponse.choices[0];
    let iterations = 0;

    while (preChoice.message.tool_calls && preChoice.message.tool_calls.length > 0 && iterations < 3) {
      usedTools = true;
      iterations++;
      await callbacks.onToolStart();

      messages.push(preChoice.message as ChatCompletionMessageParam);

      const toolResults = await Promise.all(
        preChoice.message.tool_calls
          .filter((tc): tc is ChatCompletionMessageFunctionToolCall => tc.type === 'function')
          .map(async (toolCall) => {
          const fnName = toolCall.function.name;
          let fnArgs: Record<string, unknown> = {};
          try { fnArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch { /* */ }
          const result = await executeFunctionCall(fnName, fnArgs, tenantId, sessionId, plan, permissions, tenantModules);
          return { role: 'tool' as const, tool_call_id: toolCall.id, content: result };
        }),
      );

      messages.push(...toolResults);

      preResponse = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        ...(planTools.length > 0 && { tools: planTools }),
        temperature: 0.3,
        max_tokens: 1000,
      });

      preChoice = preResponse.choices[0];
    }

    // Tool call kalmadı — son yanıtı stream et
    if (!preChoice.message.tool_calls || preChoice.message.tool_calls.length === 0) {
      if (usedTools) {
        // Tool sonuçları zaten messages'ta — tools olmadan stream et
        const stream = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 1000,
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            await callbacks.onToken(delta);
          }
        }
      } else {
        // Tool kullanılmadı — ilk yanıt zaten var, onu kullan
        const content = preChoice.message.content ?? '';
        if (content) {
          // Küçük parçalar halinde gönder (streaming hissi)
          const chunkSize = 4;
          for (let i = 0; i < content.length; i += chunkSize) {
            const part = content.slice(i, i + chunkSize);
            fullText += part;
            await callbacks.onToken(part);
          }
        }
      }
    }

    // Eğer fullText hâlâ boşsa, preChoice.message.content'i kullan veya fallback
    if (!fullText) {
      fullText = preChoice.message.content ?? 'Yanıt üretilemedi. Lütfen tekrar deneyin.';
      // Boş olmayan fallback'i de token olarak gönder
      if (fullText) {
        await callbacks.onToken(fullText);
      }
    }

    // Konuşma geçmişine ekle
    addToConversation(sessionId, [userMessage, { role: 'assistant', content: fullText }]);

    await callbacks.onDone(fullText, usedTools);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await callbacks.onError(errMsg);
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/** Tarih string'ini validate et — geçersizse null döner */
function parseDate(str: string): string | null {
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}
