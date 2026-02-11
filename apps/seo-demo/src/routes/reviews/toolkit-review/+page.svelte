<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="SEO Toolkit Pro Review - Is It Worth It?"
  description="An in-depth review of SEO Toolkit Pro. We test all features and give our honest verdict on whether it's worth the investment."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="article"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'Review',
    data: {
      itemReviewed: {
        type: 'Product',
        name: 'SEO Toolkit Pro',
        image: `${DOMAIN}/images/seo-toolkit-pro.jpg`,
      },
      author: {
        type: 'Person',
        name: 'Alex Thompson',
        url: `${DOMAIN}/authors/alex-thompson`,
      },
      datePublished: '2024-01-12',
      reviewBody: 'After using SEO Toolkit Pro for 3 months on multiple client projects, I can confidently say it\'s one of the best SEO tools available. The keyword research features are exceptional, the site audit is thorough, and the rank tracking is accurate. The only downside is the learning curve for beginners, but the comprehensive documentation helps.',
      reviewRating: {
        ratingValue: 4.5,
        bestRating: 5,
        worstRating: 1,
      },
    },
  }}
  ogParams={{
    type: 'article',
    author: 'Alex Thompson',
    date: '2024-01-12',
  }}
/>

<h1>SEO Toolkit Pro Review</h1>

<section>
  <h2>Review JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>Review</code> structured data type.
    Google may show review snippets with star ratings in search results.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Item reviewed (Product, LocalBusiness, etc.)</li>
    <li>Reviewer information</li>
    <li>Publication date</li>
    <li>Review body text</li>
    <li>Star rating with best/worst scale</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="background: #f9f9f9; padding: 2rem; border-radius: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h3 style="margin: 0 0 0.5rem;">Overall Rating</h3>
        <div style="font-size: 2rem; color: #ffc107;">★★★★☆</div>
        <p style="font-size: 1.5rem; font-weight: bold; margin: 0.5rem 0;">4.5 / 5</p>
      </div>
      <div style="text-align: right;">
        <p style="margin: 0; color: #666;">Reviewed by</p>
        <p style="margin: 0; font-weight: bold;">Alex Thompson</p>
        <p style="margin: 0; color: #666;">January 12, 2024</p>
      </div>
    </div>
  </div>
</section>

<article style="margin-top: 2rem;">
  <h3>Summary</h3>
  <p>
    After using SEO Toolkit Pro for 3 months on multiple client projects, I can confidently
    say it's one of the best SEO tools available. The keyword research features are exceptional,
    the site audit is thorough, and the rank tracking is accurate.
  </p>

  <h3>What I Tested</h3>
  <ul>
    <li>Keyword research on 5 different niches</li>
    <li>Full site audits on 3 client websites</li>
    <li>Daily rank tracking for 100+ keywords</li>
    <li>Competitor analysis features</li>
    <li>Backlink monitoring</li>
  </ul>

  <h3>Pros</h3>
  <div style="background: #d4edda; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
    <ul style="margin: 0;">
      <li>Comprehensive keyword research with accurate volume data</li>
      <li>Fast and thorough site audits</li>
      <li>Accurate daily rank tracking</li>
      <li>Clean, intuitive interface</li>
      <li>Excellent customer support</li>
      <li>Regular feature updates</li>
    </ul>
  </div>

  <h3>Cons</h3>
  <div style="background: #f8d7da; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
    <ul style="margin: 0;">
      <li>Steep learning curve for beginners</li>
      <li>Higher price point than some competitors</li>
      <li>Mobile app could be improved</li>
    </ul>
  </div>

  <h3>Final Verdict</h3>
  <p>
    <strong>SEO Toolkit Pro is an excellent investment for serious SEO professionals.</strong>
    The comprehensive feature set, accuracy, and continuous improvements make it worth the
    price. While beginners might find it overwhelming at first, the documentation and
    support team make the learning process manageable.
  </p>
</article>

<section style="margin-top: 2rem;">
  <h3>Rating Breakdown</h3>
  <div style="display: grid; gap: 0.5rem;">
    <div style="display: flex; align-items: center; gap: 1rem;">
      <span style="min-width: 120px;">Features</span>
      <div style="flex: 1; background: #eee; border-radius: 4px; height: 8px;">
        <div style="width: 95%; background: #ffc107; height: 100%; border-radius: 4px;"></div>
      </div>
      <span>4.8</span>
    </div>
    <div style="display: flex; align-items: center; gap: 1rem;">
      <span style="min-width: 120px;">Ease of Use</span>
      <div style="flex: 1; background: #eee; border-radius: 4px; height: 8px;">
        <div style="width: 80%; background: #ffc107; height: 100%; border-radius: 4px;"></div>
      </div>
      <span>4.0</span>
    </div>
    <div style="display: flex; align-items: center; gap: 1rem;">
      <span style="min-width: 120px;">Value</span>
      <div style="flex: 1; background: #eee; border-radius: 4px; height: 8px;">
        <div style="width: 90%; background: #ffc107; height: 100%; border-radius: 4px;"></div>
      </div>
      <span>4.5</span>
    </div>
    <div style="display: flex; align-items: center; gap: 1rem;">
      <span style="min-width: 120px;">Support</span>
      <div style="flex: 1; background: #eee; border-radius: 4px; height: 8px;">
        <div style="width: 95%; background: #ffc107; height: 100%; border-radius: 4px;"></div>
      </div>
      <span>4.8</span>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=SEO Toolkit Pro Review&type=article&author=Alex Thompson" target="_blank">
      View OG Image
    </a>
  </p>
</section>
