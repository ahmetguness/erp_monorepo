import { Hono } from 'hono';
import { SavedViewController } from '../modules/platform/http/controllers/index.js';

const savedViewRoutes = new Hono();

// Tenant API altında requireAuth zaten uygulanır. Paylaşımlı scope yetkisi controller'da owner kontrolüyle korunur.
savedViewRoutes.get('/', SavedViewController.list);
savedViewRoutes.post('/', SavedViewController.create);
savedViewRoutes.patch('/:id', SavedViewController.update);
savedViewRoutes.delete('/:id', SavedViewController.remove);

export { savedViewRoutes };
