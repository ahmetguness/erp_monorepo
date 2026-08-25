import type { BackendModule } from '../shared/module.js';
import { collectionReminderRoutes } from '../../routes/collection-reminder.routes.js';
import { contactRoutes } from '../../routes/contact.routes.js';
import { deliveryNoteRoutes } from '../../routes/delivery-note.routes.js';
import { eDocumentRoutes } from '../../routes/e-document.routes.js';
import { invoiceRoutes } from '../../routes/invoice.routes.js';
import { salesOrderRoutes } from '../../routes/sales-order.routes.js';
import { salesTargetRoutes } from '../../routes/sales-target.routes.js';

export const salesModule: BackendModule = {
  name: 'sales',
  register(app) {
    app.route('/contacts', contactRoutes);
    app.route('/invoices', invoiceRoutes);
    app.route('/sales-orders', salesOrderRoutes);
    app.route('/sales-targets', salesTargetRoutes);
    app.route('/collection-reminders', collectionReminderRoutes);
    app.route('/delivery-notes', deliveryNoteRoutes);
    app.route('/e-documents', eDocumentRoutes);
  },
};
