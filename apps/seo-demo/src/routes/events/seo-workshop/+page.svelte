<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="SEO Mastery Workshop 2024"
  description="Join our comprehensive 2-day workshop on advanced SEO techniques. Learn from industry experts and boost your website rankings."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'Event',
    data: {
      name: 'SEO Mastery Workshop 2024',
      description: 'A comprehensive 2-day workshop covering advanced SEO techniques, technical SEO, content optimization, and link building strategies.',
      image: [`${DOMAIN}/images/seo-workshop-2024.jpg`],
      startDate: '2024-03-15T09:00:00-08:00',
      endDate: '2024-03-16T17:00:00-08:00',
      eventStatus: 'EventScheduled',
      eventAttendanceMode: 'MixedEventAttendanceMode',
      location: {
        type: 'Place',
        name: 'TechHub Conference Center',
        address: {
          streetAddress: '123 Innovation Drive',
          addressLocality: 'San Francisco',
          addressRegion: 'CA',
          postalCode: '94105',
          addressCountry: 'US',
        },
      },
      organizer: {
        type: 'Organization',
        name: 'SEO Demo Academy',
        url: DOMAIN,
      },
      performer: [
        { type: 'Person', name: 'Dr. Sarah Johnson', url: `${DOMAIN}/speakers/sarah-johnson` },
        { type: 'Person', name: 'Michael Chen', url: `${DOMAIN}/speakers/michael-chen` },
      ],
      offers: {
        price: 299,
        priceCurrency: 'USD',
        availability: 'InStock',
        url: `${DOMAIN}/events/seo-workshop/register`,
        priceValidUntil: '2024-03-14',
      },
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: 'March 15-16, 2024 | San Francisco',
  }}
/>

<h1>SEO Mastery Workshop 2024</h1>

<section>
  <h2>Event JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>Event</code> structured data type.
    Google may show event details in search results and Google Events.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Event name and description</li>
    <li>Start and end dates (ISO 8601)</li>
    <li>Event status and attendance mode</li>
    <li>Location (physical or virtual)</li>
    <li>Organizer information</li>
    <li>Performers/speakers</li>
    <li>Ticket pricing and availability</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px;">
    <h3 style="margin-top: 0;">Event Details</h3>
    <div style="display: grid; gap: 1rem;">
      <div>📅 <strong>Date:</strong> March 15-16, 2024</div>
      <div>⏰ <strong>Time:</strong> 9:00 AM - 5:00 PM PST</div>
      <div>📍 <strong>Location:</strong> TechHub Conference Center, San Francisco, CA</div>
      <div>🎟️ <strong>Price:</strong> $299 (Early Bird)</div>
      <div>🌐 <strong>Format:</strong> In-person + Virtual access</div>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>Featured Speakers</h3>
  <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
    <div style="flex: 1; min-width: 250px; background: #f9f9f9; padding: 1.5rem; border-radius: 8px;">
      <h4 style="margin-top: 0;">Dr. Sarah Johnson</h4>
      <p>Head of SEO at TechCorp. 15+ years of experience in search optimization and algorithm analysis.</p>
    </div>
    <div style="flex: 1; min-width: 250px; background: #f9f9f9; padding: 1.5rem; border-radius: 8px;">
      <h4 style="margin-top: 0;">Michael Chen</h4>
      <p>Founder of SEO Insights. Renowned expert in technical SEO and site performance optimization.</p>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>Workshop Agenda</h3>
  <div style="display: grid; gap: 1rem;">
    <div>
      <h4 style="margin: 0 0 0.5rem; padding: 0.75rem; background: #f0f0f0; border-radius: 4px;">Day 1</h4>
      <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee;"><strong>Morning:</strong> Technical SEO Fundamentals, Site Architecture</div>
      <div style="padding: 0.5rem 0.75rem;"><strong>Afternoon:</strong> Content Optimization, Keyword Research</div>
    </div>
    <div>
      <h4 style="margin: 0 0 0.5rem; padding: 0.75rem; background: #f0f0f0; border-radius: 4px;">Day 2</h4>
      <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee;"><strong>Morning:</strong> Link Building Strategies, Outreach</div>
      <div style="padding: 0.5rem 0.75rem;"><strong>Afternoon:</strong> Analytics, Reporting, Q&A</div>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=SEO Mastery Workshop 2024&type=website&subtitle=March 15-16 | San Francisco" target="_blank">
      View OG Image
    </a>
  </p>
</section>
