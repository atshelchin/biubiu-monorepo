<script lang="ts">
  let { children } = $props();
</script>

<nav style="padding: 1rem; background: #f5f5f5; margin-bottom: 1rem;">
  <a href="/">Home (WebSite)</a> |
  <a href="/tools/json-formatter">Tool (SoftwareApplication)</a> |
  <a href="/blog/getting-started">Article</a> |
  <a href="/faq">FAQ (FAQPage)</a> |
  <a href="/tutorials/setup-guide">HowTo</a> |
  <a href="/en">EN</a> |
  <a href="/zh">ZH</a>
</nav>

<main style="padding: 0 1rem;">
  {@render children()}
</main>

<footer style="margin-top: 2rem; padding: 1rem; background: #f5f5f5; text-align: center;">
  <p>SEO Demo - @shelchin/seo-sveltekit Package Showcase</p>
</footer>
