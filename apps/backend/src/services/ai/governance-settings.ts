export const AI_POLICY_MODULE = 'ai';

export const AI_POLICY_KEYS = {
  enabled: 'enabled',
  dataSharingPolicy: 'data_sharing_policy',
  logPrompts: 'log_prompts',
} as const;

export const AI_GOVERNANCE_INSIGHT_KEYS = {
  monthlyCostLimitUsd: 'monthly_cost_limit_usd',
  alertThresholdPercent: 'cost_alert_threshold_percent',
  blockOnLimit: 'block_on_cost_limit',
} as const;
