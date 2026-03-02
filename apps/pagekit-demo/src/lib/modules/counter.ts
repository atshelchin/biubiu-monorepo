import { defineModule } from '@shelchin/pagekit';
import { z } from 'zod';

export const counterModule = defineModule({
  name: 'counter',
  description: 'A simple counter with increment, decrement, and reset',

  context: {
    count: 0,
    history: [] as number[],
  },

  actions: {
    increment: {
      description: 'Increment the counter by a given amount (simulates async work)',
      input: z.object({
        amount: z.number().min(1).default(1).describe('Amount to add'),
      }),
      output: z.object({
        newValue: z.number(),
      }),
      async execute({ input, ctx }) {
        // Simulate async work (API call, computation, etc.)
        await new Promise((r) => setTimeout(r, 3000));
        ctx.count += input.amount;
        ctx.history.push(ctx.count);
        return { newValue: ctx.count };
      },
    },

    decrement: {
      description: 'Decrement the counter by a given amount',
      input: z.object({
        amount: z.number().min(1).default(1).describe('Amount to subtract'),
      }),
      execute({ input, ctx }) {
        ctx.count -= input.amount;
        ctx.history.push(ctx.count);
      },
    },

    reset: {
      description: 'Reset counter to zero and clear history',
      input: z.object({}),
      execute({ ctx }) {
        ctx.count = 0;
        ctx.history = [];
      },
    },
  },
});
