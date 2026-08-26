import { createApp } from './bootstrap/http/create-app.js';
import { readRuntimeConfig } from './bootstrap/runtime-config.js';
import { assertValidStartupEnv } from './config/env.js';
import { startApi } from './entrypoints/api.js';
import { startWorkerProcess } from './entrypoints/worker.js';
import { logger } from './lib/logger.js';

assertValidStartupEnv();

if (!process.env.OPENAI_API_KEY) {
  logger.warn('[Startup] OPENAI_API_KEY tanımlı değil — AI chat devre dışı.');
}

const runtimeConfig = readRuntimeConfig();
export const app = createApp(runtimeConfig);

if (process.env.NODE_ENV !== 'test') {
  if (runtimeConfig.role === 'worker') startWorkerProcess();
  else startApi(app, runtimeConfig);
}
