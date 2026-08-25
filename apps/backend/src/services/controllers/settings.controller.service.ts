import { generalSettingsController } from './settings.controller/general.js';
import { brandingSettingsController } from './settings.controller/branding.js';
import { securitySettingsController } from './settings.controller/security.js';
import { complianceSettingsController } from './settings.controller/compliance.js';
import { deploymentSettingsController } from './settings.controller/deployment.js';

export const SettingsController = {
  ...generalSettingsController,
  ...brandingSettingsController,
  ...securitySettingsController,
  ...complianceSettingsController,
  ...deploymentSettingsController,
} as const;
