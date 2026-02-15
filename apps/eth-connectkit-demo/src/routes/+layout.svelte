<script>
  let { children } = $props();
</script>

<svelte:head>
  <title>ETH ConnectKit Demo</title>
</svelte:head>

{@render children()}

<style>
  :global(body) {
    margin: 0;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Roboto,
      sans-serif;
    background: #0a0a0a;
    color: #fafafa;
    min-height: 100vh;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(button) {
    font-family: inherit;
  }
</style>
