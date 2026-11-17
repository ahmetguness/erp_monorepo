export interface EnvValidationIssue {
  name: string;
  severity: 'error' | 'warn';
  message: string;
}
