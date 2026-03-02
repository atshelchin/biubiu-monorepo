<script lang="ts">
  import { usePage } from '@shelchin/pagekit/svelte';
  import { ActionBusyError } from '@shelchin/pagekit';
  import { demoPage } from '$lib/page.js';

  const page = usePage(demoPage);

  // Toast notification for dropped actions
  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showBusyToast(actionName: string) {
    if (toastTimer) clearTimeout(toastTimer);
    toast = `"${actionName}" is busy — request dropped`;
    toastTimer = setTimeout(() => { toast = ''; }, 2000);
  }

  // Local UI state for the todo input
  let newTodoText = $state('');

  // Derived: filtered todos based on current filter
  let filteredTodos = $derived(
    page.todos.ctx.filter === 'all'
      ? page.todos.ctx.items
      : page.todos.ctx.filter === 'active'
        ? page.todos.ctx.items.filter((t) => !t.done)
        : page.todos.ctx.items.filter((t) => t.done),
  );

  let doneCount = $derived(page.todos.ctx.items.filter((t) => t.done).length);

  async function handleAddTodo() {
    if (!newTodoText.trim()) return;
    const text = newTodoText.trim();
    newTodoText = '';
    try {
      await page.todos.add({ text });
    } catch (e) {
      if (e instanceof ActionBusyError) { showBusyToast('add'); return; }
      throw e;
    }
  }

  async function handleIncrement(amount: number) {
    try {
      await page.counter.increment({ amount });
    } catch (e) {
      if (e instanceof ActionBusyError) { showBusyToast('increment'); return; }
      throw e;
    }
  }
</script>

{#if toast}
  <div class="toast">{toast}</div>
{/if}

<div class="grid">
  <!-- Counter Module -->
  <section class="card">
    <h2>Counter</h2>
    <p class="description">counterModule — {page.counter.ctx.count}</p>

    <div class="counter-display" class:busy={page.counter.pending.increment}>
      {page.counter.ctx.count}
      {#if page.counter.pending.increment}
        <span class="spinner"></span>
      {/if}
    </div>

    <div class="button-row">
      <button class="secondary" onclick={() => page.counter.decrement({ amount: 1 })}>
        -1
      </button>
      <button class="primary" onclick={() => handleIncrement(1)}>
        {page.counter.pending.increment ? 'Adding...' : '+1'}
      </button>
      <button class="secondary" onclick={() => handleIncrement(10)}>
        {page.counter.pending.increment ? '...' : '+10'}
      </button>
      <button class="danger" onclick={() => page.counter.reset({})}>
        Reset
      </button>
    </div>

    <p class="hint">
      Buttons stay clickable during async work. Try clicking +1 rapidly
      — duplicates are dropped and you'll see a toast notification.
    </p>

    {#if page.counter.ctx.history.length > 0}
      <div class="history">
        <span class="label">History:</span>
        {page.counter.ctx.history.join(' → ')}
      </div>
    {/if}
  </section>

  <!-- Todos Module -->
  <section class="card">
    <h2>Todos</h2>
    <p class="description">todosModule — {page.todos.ctx.items.length} items, {doneCount} done</p>

    <form class="todo-input" onsubmit={(e) => { e.preventDefault(); handleAddTodo(); }}>
      <input
        type="text"
        placeholder="What needs to be done?"
        bind:value={newTodoText}
      />
      <button class="primary" type="submit">
        {page.todos.pending.add ? 'Saving...' : 'Add'}
      </button>
    </form>

    <div class="filter-row">
      {#each ['all', 'active', 'done'] as f}
        <button
          class={page.todos.ctx.filter === f ? 'filter-active' : 'filter'}
          onclick={() => page.todos.setFilter({ filter: f as 'all' | 'active' | 'done' })}
        >
          {f}
        </button>
      {/each}
      {#if doneCount > 0}
        <button class="danger-text" onclick={() => page.todos.clearDone({})}>
          Clear done
        </button>
      {/if}
    </div>

    <ul class="todo-list">
      {#each filteredTodos as todo (todo.id)}
        <li class:done={todo.done}>
          <button class="checkbox" onclick={() => page.todos.toggle({ id: todo.id })}>
            {todo.done ? '✓' : ''}
          </button>
          <span class="todo-text">{todo.text}</span>
          <button class="remove" onclick={() => page.todos.remove({ id: todo.id })}>
            ×
          </button>
        </li>
      {/each}
    </ul>

    {#if page.todos.ctx.items.length === 0}
      <p class="empty">No todos yet. Add one above, or let AI add some!</p>
    {/if}
  </section>
</div>

<section class="card info-card">
  <h2>How it works</h2>
  <p>This page uses <code>usePage(demoPage)</code> which:</p>
  <ol>
    <li>Wraps each module's context in <code>$state()</code> for reactivity</li>
    <li>Each action has a <strong>drop lock</strong> — calling while busy throws <code>ActionBusyError</code></li>
    <li><code>page.module.pending.action</code> — reactive boolean for UI feedback</li>
    <li>Registers WebMCP tools on mount (AI gets friendly "busy" message, not an error)</li>
  </ol>
  <p class="tools-list">
    <strong>Registered tools:</strong>
    get_counter_state, counter_increment, counter_decrement, counter_reset,
    get_todos_state, todos_add, todos_toggle, todos_remove, todos_setFilter, todos_clearDone
  </p>
</section>

<style>
  .toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 149, 0, 0.9);
    color: #fff;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  @media (max-width: 700px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .description {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 20px;
  }

  .counter-display {
    font-size: 64px;
    font-weight: 700;
    text-align: center;
    padding: 24px 0;
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    transition: opacity 0.2s;
  }

  .counter-display.busy {
    opacity: 0.5;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .button-row {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .danger {
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
    border: 1px solid rgba(255, 69, 58, 0.2);
    font-size: 14px;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
  }

  .danger:hover:not(:disabled) {
    background: rgba(255, 69, 58, 0.25);
  }

  .hint {
    margin-top: 12px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    text-align: center;
    font-style: italic;
  }

  .history {
    margin-top: 12px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    text-align: center;
    word-break: break-all;
  }

  .history .label {
    color: rgba(255, 255, 255, 0.6);
  }

  .todo-input {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .todo-input input {
    flex: 1;
  }

  .filter-row {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
  }

  .filter, .filter-active {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    text-transform: capitalize;
  }

  .filter {
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
  }

  .filter:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .filter-active {
    background: rgba(10, 132, 255, 0.15);
    color: #0a84ff;
  }

  .danger-text {
    margin-left: auto;
    background: transparent;
    color: #ff453a;
    border: none;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .danger-text:hover {
    background: rgba(255, 69, 58, 0.1);
  }

  .todo-list {
    list-style: none;
    padding: 0;
  }

  .todo-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .todo-list li:last-child {
    border-bottom: none;
  }

  .checkbox {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    color: #30d158;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0;
  }

  .done .checkbox {
    border-color: #30d158;
    background: rgba(48, 209, 88, 0.15);
  }

  .todo-text {
    flex: 1;
    font-size: 14px;
  }

  .done .todo-text {
    text-decoration: line-through;
    color: rgba(255, 255, 255, 0.3);
  }

  .remove {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.2);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .remove:hover {
    color: #ff453a;
  }

  .empty {
    text-align: center;
    color: rgba(255, 255, 255, 0.3);
    font-size: 14px;
    padding: 24px 0;
  }

  .info-card {
    margin-top: 24px;
  }

  .info-card p, .info-card ol {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.7;
  }

  .info-card ol {
    padding-left: 20px;
    margin: 8px 0;
  }

  .info-card code {
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    color: #0a84ff;
  }

  .tools-list {
    margin-top: 12px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
  }

  .tools-list strong {
    color: rgba(255, 255, 255, 0.6);
  }
</style>
