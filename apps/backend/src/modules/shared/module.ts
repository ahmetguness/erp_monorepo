import type { Hono } from 'hono';

/**
 * A domain module owns the registration of its HTTP surface.
 * Keeping this contract deliberately small prevents modules from depending on
 * application bootstrap details.
 */
export interface BackendModule {
  readonly name: string;
  register(app: Hono): void;
}
