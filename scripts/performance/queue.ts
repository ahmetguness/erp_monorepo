import { object } from './validation.js';

export function queueHealthy(value: unknown): boolean {
  const queue = object(value);
  return queue.deadLetter === 0 && queue.failed === 0 && typeof queue.oldestSeconds === 'number'
    && Number.isFinite(queue.oldestSeconds) && queue.oldestSeconds >= 0 && queue.oldestSeconds <= 30;
}
