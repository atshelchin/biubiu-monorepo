import { definePage } from '@shelchin/pagekit';
import { counterModule } from './modules/counter.js';
import { todosModule } from './modules/todos.js';

export const demoPage = definePage({
  name: 'demo',
  description: 'PageKit demo — counter and todo list with WebMCP integration',
  modules: [counterModule, todosModule],
});
