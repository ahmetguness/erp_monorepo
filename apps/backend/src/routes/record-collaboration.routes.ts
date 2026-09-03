import { Hono } from 'hono';
import { requireRecordContextPermission } from '../middleware/requireRecordContextPermission.js';
import { RecordCollaborationController } from '../modules/collaboration/http/controllers/index.js';

export const recordCollaborationRoutes = new Hono();
recordCollaborationRoutes.get('/:entityType/:entityId', requireRecordContextPermission('READ'), RecordCollaborationController.get);
recordCollaborationRoutes.post('/:entityType/:entityId/entries', requireRecordContextPermission('READ'), RecordCollaborationController.createEntry);
recordCollaborationRoutes.put('/:entityType/:entityId/following', requireRecordContextPermission('READ'), RecordCollaborationController.follow);
