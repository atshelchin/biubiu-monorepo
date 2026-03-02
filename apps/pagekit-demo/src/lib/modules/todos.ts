import { defineModule } from '@shelchin/pagekit';
import { z } from 'zod';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export const todosModule = defineModule({
  name: 'todos',
  description: 'Todo list — add, toggle, and remove tasks',

  context: {
    items: [] as Todo[],
    filter: 'all' as 'all' | 'active' | 'done',
  },

  actions: {
    add: {
      description: 'Add a new todo item (simulates async save)',
      input: z.object({
        text: z.string().min(1).describe('Todo text'),
      }),
      output: z.object({
        id: z.string(),
        totalCount: z.number(),
      }),
      async execute({ input, ctx }) {
        // Simulate saving to server
        await new Promise((r) => setTimeout(r, 3000));
        const id = crypto.randomUUID();
        ctx.items.push({ id, text: input.text, done: false });
        return { id, totalCount: ctx.items.length };
      },
    },

    toggle: {
      description: 'Toggle a todo item between done and not done',
      input: z.object({
        id: z.string().describe('Todo ID to toggle'),
      }),
      execute({ input, ctx }) {
        const item = ctx.items.find((t) => t.id === input.id);
        if (item) item.done = !item.done;
      },
    },

    remove: {
      description: 'Remove a todo item',
      input: z.object({
        id: z.string().describe('Todo ID to remove'),
      }),
      execute({ input, ctx }) {
        const idx = ctx.items.findIndex((t) => t.id === input.id);
        if (idx !== -1) ctx.items.splice(idx, 1);
      },
    },

    setFilter: {
      description: 'Filter displayed todos: all, active, or done',
      input: z.object({
        filter: z.enum(['all', 'active', 'done']).describe('Filter type'),
      }),
      execute({ input, ctx }) {
        ctx.filter = input.filter;
      },
    },

    clearDone: {
      description: 'Remove all completed todos',
      input: z.object({}),
      output: z.object({
        removedCount: z.number(),
      }),
      execute({ ctx }) {
        const before = ctx.items.length;
        ctx.items = ctx.items.filter((t) => !t.done);
        return { removedCount: before - ctx.items.length };
      },
    },
  },
});
