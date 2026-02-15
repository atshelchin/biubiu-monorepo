/**
 * Schema Parser - Extract field definitions from Zod schemas
 */

import { z } from 'zod';
import type { FieldDefinition, FieldType } from './types.js';

/**
 * Extract UI hints from Zod schema description
 * Supports both JSON hints and plain text labels
 */
function extractHints(schema: z.ZodType): {
  label?: string;
  description?: string;
  placeholder?: string;
  uiHints?: Record<string, unknown>;
} {
  const description = schema.description;
  if (!description) return {};

  try {
    const parsed = JSON.parse(description);
    return {
      label: parsed.label,
      description: parsed.description,
      placeholder: parsed.placeholder,
      uiHints: parsed,
    };
  } catch {
    // Plain text description = label
    return { label: description };
  }
}

/**
 * Get the inner type, unwrapping Optional/Default/Nullable
 */
function unwrapSchema(schema: z.ZodType): {
  inner: z.ZodType;
  required: boolean;
  defaultValue?: unknown;
} {
  if (schema instanceof z.ZodOptional) {
    const result = unwrapSchema(schema._def.innerType);
    return { ...result, required: false };
  }

  if (schema instanceof z.ZodDefault) {
    const result = unwrapSchema(schema._def.innerType);
    return { ...result, required: false, defaultValue: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodNullable) {
    const result = unwrapSchema(schema._def.innerType);
    return { ...result, required: false };
  }

  return { inner: schema, required: true };
}

/**
 * Detect the field type from a Zod schema
 */
function detectFieldType(schema: z.ZodType): FieldType {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodEnum) return 'enum';
  if (schema instanceof z.ZodArray) return 'array';
  if (schema instanceof z.ZodObject) return 'object';

  // Handle wrapped types
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema instanceof z.ZodNullable) {
    return detectFieldType(unwrapSchema(schema).inner);
  }

  return 'unknown';
}

/**
 * Parse a single field schema into a FieldDefinition
 */
export function parseFieldSchema(name: string, schema: z.ZodType): FieldDefinition {
  const { inner, required, defaultValue } = unwrapSchema(schema);
  const hints = extractHints(schema);
  const type = detectFieldType(inner);

  const field: FieldDefinition = {
    name,
    type,
    schema,
    label: hints.label ?? formatFieldName(name),
    description: hints.description,
    placeholder: hints.placeholder,
    required,
    defaultValue,
    uiHints: hints.uiHints,
  };

  // Add type-specific properties
  if (inner instanceof z.ZodEnum) {
    field.enumValues = inner._def.values as string[];
  }

  if (inner instanceof z.ZodArray) {
    field.arrayItemType = detectFieldType(inner._def.type);
  }

  if (inner instanceof z.ZodObject) {
    field.objectFields = parseObjectSchema(inner);
  }

  return field;
}

/**
 * Parse a Zod object schema into field definitions
 */
export function parseObjectSchema(schema: z.ZodType): FieldDefinition[] {
  // Unwrap if needed
  const { inner } = unwrapSchema(schema);

  if (!(inner instanceof z.ZodObject)) {
    return [];
  }

  const shape = inner.shape;
  const fields: FieldDefinition[] = [];

  for (const [name, fieldSchema] of Object.entries(shape)) {
    fields.push(parseFieldSchema(name, fieldSchema as z.ZodType));
  }

  return fields;
}

/**
 * Format field name to human-readable label
 * e.g., 'firstName' -> 'First Name', 'user_email' -> 'User Email'
 */
function formatFieldName(name: string): string {
  return name
    // Split on camelCase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Split on underscores/dashes
    .replace(/[_-]/g, ' ')
    // Capitalize first letter of each word
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get default value for a field based on its type
 */
export function getDefaultValue(field: FieldDefinition): unknown {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  switch (field.type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'enum':
      return field.enumValues?.[0] ?? '';
    case 'array':
      return [];
    case 'object':
      const obj: Record<string, unknown> = {};
      for (const subField of field.objectFields ?? []) {
        obj[subField.name] = getDefaultValue(subField);
      }
      return obj;
    default:
      return undefined;
  }
}

/**
 * Create initial form values from field definitions
 */
export function createInitialValues(fields: FieldDefinition[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    values[field.name] = getDefaultValue(field);
  }
  return values;
}
