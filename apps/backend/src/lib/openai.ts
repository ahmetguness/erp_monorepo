import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY ortam değişkeni tanımlı değil. Chatbot çalışmayacak.');
}

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY ?? '',
});
