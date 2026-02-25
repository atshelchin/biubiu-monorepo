<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="app">
  <header>
    <nav>
      <a href="/" class="logo">PDA Demo</a>
      <div class="nav-links">
        <a href="/batch-balance">Batch Balance</a>
      </div>
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
    max-width: 1200px;
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
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    gap: 24px;
  }

  .nav-links a {
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
    font-size: 14px;
    transition: color 0.2s;
  }

  .nav-links a:hover {
    color: #fff;
  }

  main {
    flex: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px;
    width: 100%;
    box-sizing: border-box;
  }
</style>
