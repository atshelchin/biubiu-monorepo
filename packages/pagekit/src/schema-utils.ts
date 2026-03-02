import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema (for WebMCP tool definitions).
 *
 * Supports: ZodObject, ZodString, ZodNumber, ZodBoolean, ZodEnum,
 * ZodArray, ZodOptional, ZodDefault, ZodNullable.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Unwrap wrapper types
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { ...inner, default: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { ...inner, nullable: true };
  }

  const description = schema.description || undefined;

  // Base types
  if (schema instanceof z.ZodString) {
    return { type: 'string', description };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number', description };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema._def.values, description };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
      description,
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType;
      properties[key] = zodToJsonSchema(fieldSchema);

      if (
        !(fieldSchema instanceof z.ZodOptional) &&
        !(fieldSchema instanceof z.ZodDefault)
      ) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      description,
    };
  }

  // Fallback
  return { type: 'string', description };
}
