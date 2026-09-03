import type { BackendModule } from '../shared/index.js';
import { recordCollaborationRoutes } from '../../routes/record-collaboration.routes.js';

export const collaborationModule: BackendModule = {
  name: 'collaboration',
  register(app) { app.route('/record-collaboration', recordCollaborationRoutes); },
};
