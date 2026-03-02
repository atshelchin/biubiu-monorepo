import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { defineModule } from '../module.js';

describe('defineModule', () => {
  test('creates a module with name, description, context, and actions', () => {
    const mod = defineModule({
      name: 'counter',
      description: 'A simple counter',
      context: { count: 0 },
      actions: {
        increment: {
          description: 'Increment the counter',
          input: z.object({}),
          async execute({ ctx }) {
            ctx.count += 1;
          },
        },
      },
    });

    expect(mod.name).toBe('counter');
    expect(mod.description).toBe('A simple counter');
    expect(mod.context).toEqual({ count: 0 });
    expect(mod.actions.increment).toBeDefined();
    expect(mod.actions.increment.description).toBe('Increment the counter');
  });

  test('throws if name is empty', () => {
    expect(() =>
      defineModule({
        name: '',
        description: 'test',
        context: {},
        actions: {},
      }),
    ).toThrow('Module name is required');
  });

  test('throws if description is empty', () => {
    expect(() =>
      defineModule({
        name: 'test',
        description: '',
        context: {},
        actions: {},
      }),
    ).toThrow('Module description is required');
  });

  test('action execute can mutate context directly', async () => {
    const mod = defineModule({
      name: 'cart',
      description: 'Shopping cart',
      context: {
        items: [] as string[],
        total: 0,
      },
      actions: {
        add: {
          description: 'Add item',
          input: z.object({ item: z.string() }),
          output: z.object({ count: z.number() }),
          async execute({ input, ctx }) {
            ctx.items.push(input.item);
            ctx.total = ctx.items.length;
            return { count: ctx.items.length };
          },
        },
        clear: {
          description: 'Clear cart',
          input: z.object({}),
          async execute({ ctx }) {
            ctx.items = [];
            ctx.total = 0;
          },
        },
      },
    });

    // Test with a plain object (no $state, like in unit tests)
    const ctx = { items: [] as string[], total: 0 };

    const result = await mod.actions.add.execute({
      input: { item: 'apple' },
      ctx,
    });

    expect(ctx.items).toEqual(['apple']);
    expect(ctx.total).toBe(1);
    expect(result).toEqual({ count: 1 });

    await mod.actions.add.execute({ input: { item: 'banana' }, ctx });
    expect(ctx.items).toEqual(['apple', 'banana']);
    expect(ctx.total).toBe(2);

    await mod.actions.clear.execute({ input: {}, ctx });
    expect(ctx.items).toEqual([]);
    expect(ctx.total).toBe(0);
  });

  test('preserves const literal type for name', () => {
    const mod = defineModule({
      name: 'myModule',
      description: 'Test',
      context: { value: 0 },
      actions: {},
    });

    // TypeScript: mod.name should be 'myModule', not string
    const name: 'myModule' = mod.name;
    expect(name).toBe('myModule');
  });
});
