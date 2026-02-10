<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="Introduction to SEO - Video Tutorial"
  description="Watch our comprehensive video tutorial on SEO fundamentals. Learn the basics of search engine optimization in just 15 minutes."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'VideoObject',
    data: {
      name: 'Introduction to SEO - Complete Beginner Guide',
      description: 'Learn the fundamentals of SEO in this comprehensive video tutorial. Covers keywords, on-page optimization, link building, and more.',
      thumbnailUrl: [`${DOMAIN}/images/video-thumb-seo-intro.jpg`],
      uploadDate: '2024-01-01T10:00:00Z',
      duration: 'PT15M30S',
      contentUrl: `${DOMAIN}/videos/seo-intro.mp4`,
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      interactionStatistic: {
        watchCount: 125000,
        likeCount: 8500,
        commentCount: 420,
      },
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: '15 min video • 125K views',
  }}
/>

<h1>Introduction to SEO - Video Tutorial</h1>

<section>
  <h2>VideoObject JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>VideoObject</code> structured data type.
    Google may show video rich results with thumbnails, duration, and view counts.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Video name and description</li>
    <li>Thumbnail images</li>
    <li>Upload date (ISO 8601)</li>
    <li>Duration (ISO 8601)</li>
    <li>Content URL and embed URL</li>
    <li>Interaction statistics (views, likes, comments)</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; border-radius: 12px;">
    <iframe
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
      title="Introduction to SEO"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  </div>
</section>

<section style="margin-top: 2rem;">
  <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
    <div style="flex: 1; min-width: 200px;">
      <h3>Video Details</h3>
      <ul>
        <li><strong>Duration:</strong> 15:30</li>
        <li><strong>Uploaded:</strong> January 1, 2024</li>
        <li><strong>Category:</strong> Education</li>
      </ul>
    </div>
    <div style="flex: 1; min-width: 200px;">
      <h3>Statistics</h3>
      <ul>
        <li>👁️ <strong>Views:</strong> 125,000</li>
        <li>👍 <strong>Likes:</strong> 8,500</li>
        <li>💬 <strong>Comments:</strong> 420</li>
      </ul>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>What You'll Learn</h3>
  <ol>
    <li>What is SEO and why it matters</li>
    <li>How search engines work</li>
    <li>Keyword research basics</li>
    <li>On-page optimization techniques</li>
    <li>Link building fundamentals</li>
    <li>Measuring SEO success</li>
  </ol>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=Introduction to SEO - Video Tutorial&type=website&subtitle=15 min video" target="_blank">
      View OG Image
    </a>
  </p>
</section>
