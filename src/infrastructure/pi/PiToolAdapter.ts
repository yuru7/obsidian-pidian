import { Type, type TSchema } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { JsonSchemaObject, JsonSchemaProperty, PidianTool } from "../../domain/tools/PidianTool";
import { toPiToolContent } from "./prepareToolImage";

function toTypeBox(schema: JsonSchemaProperty): TSchema {
  switch (schema.type) {
    case "string":
      return Type.String({ description: schema.description });
    case "number":
      return Type.Number({ description: schema.description });
    case "boolean":
      return Type.Boolean({ description: schema.description });
    case "array":
      return Type.Array(toTypeBox(schema.items ?? { type: "string" }), {
        description: schema.description,
      });
    case "object":
      return toObjectSchema({
        type: "object",
        properties: schema.properties ?? {},
        required: schema.required,
      });
    default:
      return Type.String();
  }
}

function toObjectSchema(schema: JsonSchemaObject) {
  const required = new Set(schema.required ?? []);
  const properties: Record<string, TSchema> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    const boxed = toTypeBox(value);
    properties[key] = required.has(key) ? boxed : Type.Optional(boxed);
  }
  return Type.Object(properties);
}

export function toPiTools(tools: PidianTool[]) {
  return tools.map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      promptSnippet: `${tool.name}: ${tool.description}`,
      parameters: toObjectSchema(tool.parameters),
      execute: async (_toolCallId, params) => {
        const result = await tool.execute(params);
        return {
          content: await toPiToolContent(result),
          details: { isError: Boolean(result.isError) },
        };
      },
    }),
  );
}
