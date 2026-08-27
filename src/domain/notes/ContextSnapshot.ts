export interface SelectionContext {
  text: string;
  startLine: number;
  endLine: number;
  excerpt: string;
}

export interface ContextSnapshot {
  notePath: string;
  noteContent: string;
  selection?: SelectionContext;
}
