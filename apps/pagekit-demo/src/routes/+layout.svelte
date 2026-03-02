<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<div class="app">
  <header>
    <nav>
      <span class="logo">PageKit Demo</span>
      <span class="hint">Open WebMCP to see AI tools auto-registered</span>
    </nav>
  </header>
  <main>
    {@render children()}
  </main>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0 24px;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  nav {
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
  }

  .logo {
    font-weight: 600;
    font-size: 18px;
    color: #fff;
  }

  .hint {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
  }

  main {
    flex: 1;
    max-width: 960px;
    margin: 0 auto;
    padding: 32px 24px;
    width: 100%;
    box-sizing: border-box;
  }
</style>
