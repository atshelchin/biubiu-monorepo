import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { zodToJsonSchema } from '../schema-utils.js';

describe('zodToJsonSchema', () => {
  test('converts ZodString', () => {
    expect(zodToJsonSchema(z.string())).toEqual({
      type: 'string',
      description: undefined,
    });
  });

  test('converts ZodString with description', () => {
    expect(zodToJsonSchema(z.string().describe('A name'))).toEqual({
      type: 'string',
      description: 'A name',
    });
  });

  test('converts ZodNumber', () => {
    expect(zodToJsonSchema(z.number())).toEqual({
      type: 'number',
      description: undefined,
    });
  });

  test('converts ZodBoolean', () => {
    expect(zodToJsonSchema(z.boolean())).toEqual({
      type: 'boolean',
      description: undefined,
    });
  });

  test('converts ZodEnum', () => {
    expect(zodToJsonSchema(z.enum(['a', 'b', 'c']))).toEqual({
      type: 'string',
      enum: ['a', 'b', 'c'],
      description: undefined,
    });
  });

  test('converts ZodArray', () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: 'array',
      items: { type: 'string', description: undefined },
      description: undefined,
    });
  });

  test('converts ZodObject', () => {
    const schema = z.object({
      name: z.string().describe('User name'),
      age: z.number(),
    });

    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'User name' },
        age: { type: 'number', description: undefined },
      },
      required: ['name', 'age'],
      description: undefined,
    });
  });

  test('handles ZodOptional (not required)', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });

    const result = zodToJsonSchema(schema);
    expect(result.required).toEqual(['required']);
  });

  test('handles ZodDefault (not required, has default)', () => {
    const schema = z.object({
      count: z.number().default(1),
    });

    const result = zodToJsonSchema(schema);
    expect(result.required).toBeUndefined();
    expect((result.properties as any).count.default).toBe(1);
  });

  test('handles ZodNullable', () => {
    const result = zodToJsonSchema(z.string().nullable());
    expect(result).toEqual({
      type: 'string',
      description: undefined,
      nullable: true,
    });
  });

  test('handles nested objects', () => {
    const schema = z.object({
      address: z.object({
        street: z.string(),
        city: z.string(),
      }),
    });

    const result = zodToJsonSchema(schema);
    const addressProp = (result.properties as any).address;
    expect(addressProp.type).toBe('object');
    expect(addressProp.properties.street).toEqual({
      type: 'string',
      description: undefined,
    });
  });

  test('converts empty ZodObject (no input)', () => {
    const schema = z.object({});
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {},
      required: undefined,
      description: undefined,
    });
  });
});
