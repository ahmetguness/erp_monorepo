import { financeChatDataService } from './chat-data/finance.js';
import { inventoryChatDataService } from './chat-data/inventory.js';
import { operationsChatDataService } from './chat-data/operations.js';
import { workforceChatDataService } from './chat-data/workforce.js';

export const ChatDataService = {
  ...financeChatDataService,
  ...inventoryChatDataService,
  ...operationsChatDataService,
  ...workforceChatDataService,
} as const;
