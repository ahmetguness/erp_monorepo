import type { BackendModule } from '../shared/index.js';
import { recordCollaborationRoutes } from '../../routes/record-collaboration.routes.js';
import { chatRoutes } from './chat/http/index.js';

export {
  injectChatWebSocket,
  registerChatWebSocket,
} from './chat/infrastructure/realtime/node-websocket-gateway.js';

export const collaborationModule: BackendModule = {
  name: 'collaboration',
  register(app) {
    app.route('/record-collaboration', recordCollaborationRoutes);
    app.route('/chat', chatRoutes);
  },
};
