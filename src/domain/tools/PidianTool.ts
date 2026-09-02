export interface JsonSchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ToolImage {
  mimeType: string;
  bytes: Uint8Array;
}

export interface ToolExecuteResult {
  content: string;
  images?: ToolImage[];
  isError?: boolean;
}

export interface PidianTool {
  name: string;
  label: string;
  description: string;
  parameters: JsonSchemaObject;
  execute: (args: unknown) => Promise<ToolExecuteResult>;
}
