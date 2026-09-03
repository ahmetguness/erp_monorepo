import type { BackendModule } from '../shared/index.js';
import { operationRecoveryRoutes } from '../../routes/operation-recovery.routes.js';

export const recoveryModule: BackendModule = { name: 'recovery', register(app) { app.route('/operation-recovery', operationRecoveryRoutes); } };
