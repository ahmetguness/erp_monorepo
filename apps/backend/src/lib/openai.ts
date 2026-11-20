import OpenAI from 'openai';
import { logger } from './logger.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  logger.warn('AI provider is not configured', { operation: 'ai.configure', errorCode: 'PROVIDER_NOT_CONFIGURED' });
}

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY || 'disabled',
});
