import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { defineModule } from '../module.js';
import { definePage } from '../page.js';

const moduleA = defineModule({
  name: 'moduleA',
  description: 'Module A',
  context: { a: 1 },
  actions: {
    doA: {
      description: 'Do A',
      input: z.object({}),
      async execute() {},
    },
  },
});

const moduleB = defineModule({
  name: 'moduleB',
  description: 'Module B',
  context: { b: 'hello' },
  actions: {},
});

describe('definePage', () => {
  test('creates a page with name, description, and modules', () => {
    const page = definePage({
      name: 'testPage',
      description: 'A test page',
      modules: [moduleA, moduleB],
    });

    expect(page.name).toBe('testPage');
    expect(page.description).toBe('A test page');
    expect(page.modules).toHaveLength(2);
    expect(page.modules[0].name).toBe('moduleA');
    expect(page.modules[1].name).toBe('moduleB');
  });

  test('throws if name is empty', () => {
    expect(() =>
      definePage({
        name: '',
        description: 'test',
        modules: [],
      }),
    ).toThrow('Page name is required');
  });

  test('throws if description is empty', () => {
    expect(() =>
      definePage({
        name: 'test',
        description: '',
        modules: [],
      }),
    ).toThrow('Page description is required');
  });

  test('throws on duplicate module names', () => {
    const dup = defineModule({
      name: 'moduleA',
      description: 'Duplicate of A',
      context: {},
      actions: {},
    });

    expect(() =>
      definePage({
        name: 'dupPage',
        description: 'Has duplicates',
        modules: [moduleA, dup],
      }),
    ).toThrow('Duplicate module name: "moduleA"');
  });

  test('allows empty modules array', () => {
    const page = definePage({
      name: 'empty',
      description: 'Empty page',
      modules: [],
    });

    expect(page.modules).toHaveLength(0);
  });
});
