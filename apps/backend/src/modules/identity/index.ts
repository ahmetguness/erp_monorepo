import type { BackendModule } from '../shared/index.js';
import { userRoutes } from '../../routes/user.routes.js';
import { roleRoutes } from '../../routes/role.routes.js';
import { apiKeyRoutes } from '../../routes/api-key.routes.js';
import { invitationRoutes } from '../../routes/invitation.routes.js';

export const identityModule: BackendModule = {
  name: 'identity',
  register(app) {
    app.route('/users', userRoutes);
    app.route('/roles', roleRoutes);
    app.route('/api-keys', apiKeyRoutes);
    app.route('/invitations', invitationRoutes);
  },
};
