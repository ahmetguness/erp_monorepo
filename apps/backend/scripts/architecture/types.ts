export type ProjectKind = 'backend' | 'web';

export interface SourceProject {
  kind: ProjectKind;
  root: string;
  files: readonly string[];
}

export interface ImportEdge {
  importer: string;
  imported: string;
  specifier: string;
}

export interface ArchitectureIssue {
  file: string;
  message: string;
}
