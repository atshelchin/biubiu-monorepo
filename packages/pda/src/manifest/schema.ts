import { z } from 'zod';
import type { FieldUIHints } from '../types.js';

/**
 * Helper to create a Zod schema with UI hints
 * Uses the describe metadata to attach hints as JSON
 */
export function withUIHints<T extends z.ZodType>(schema: T, hints: FieldUIHints): T {
  return schema.describe(JSON.stringify(hints)) as T;
}

/**
 * Extract UI hints from a Zod schema description
 */
export function extractUIHints(schema: z.ZodType): FieldUIHints | null {
  const description = schema.description;
  if (!description) return null;

  try {
    return JSON.parse(description);
  } catch {
    // If not JSON, treat as plain label
    return { label: description };
  }
}

/**
 * FileRef schema for output validation
 */
export const FileRefSchema = z.object({
  handle: z.string(),
  mimeType: z.string(),
  filename: z.string().optional(),
  size: z.number(),
  temporary: z.boolean().optional(),
});

/**
 * Manifest schema for validation
 */
export const ManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional(),
  inputSchema: z.custom<z.ZodType>((val) => val instanceof z.ZodType),
  outputSchema: z.custom<z.ZodType>((val) => val instanceof z.ZodType),
  uiHints: z
    .object({
      icon: z.string().optional(),
      category: z.string().optional(),
      submitLabel: z.string().optional(),
    })
    .optional(),
});

/**
 * Convert a Zod schema to JSON Schema (for MCP tool definitions)
 */
export function zodToJsonSchema(
  schema: z.ZodType,
  hints?: FieldUIHints | null
): Record<string, unknown> {
  // Handle wrapped types first
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType, hints);
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType, hints);
    return { ...inner, default: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType, hints);
    return { ...inner, nullable: true };
  }

  // Base types
  if (schema instanceof z.ZodString) {
    return { type: 'string', description: hints?.label };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number', description: hints?.label };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: hints?.label };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema._def.values, description: hints?.label };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
      description: hints?.label,
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType;
      const fieldHints = extractUIHints(fieldSchema);
      properties[key] = zodToJsonSchema(fieldSchema, fieldHints);

      // Check if required
      if (!(fieldSchema instanceof z.ZodOptional) && !(fieldSchema instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      description: hints?.label,
    };
  }

  // Fallback
  return { type: 'string', description: hints?.label };
}

/**
 * Get field names and their schemas from a Zod object schema
 */
export function getSchemaFields(
  schema: z.ZodType
): Array<{ name: string; schema: z.ZodType; hints: FieldUIHints | null }> {
  if (!(schema instanceof z.ZodObject)) {
    return [];
  }

  const shape = schema.shape;
  const fields: Array<{ name: string; schema: z.ZodType; hints: FieldUIHints | null }> = [];

  for (const [name, fieldSchema] of Object.entries(shape)) {
    const s = fieldSchema as z.ZodType;
    fields.push({
      name,
      schema: s,
      hints: extractUIHints(s),
    });
  }

  return fields;
}
