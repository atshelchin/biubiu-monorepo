<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="SEO Coffee House - Best Coffee in San Francisco"
  description="Visit SEO Coffee House for the best artisan coffee in San Francisco. Open daily from 7 AM to 8 PM. Free WiFi and cozy atmosphere."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'LocalBusiness',
    data: {
      '@type': 'Restaurant',
      name: 'SEO Coffee House',
      description: 'A cozy coffee house serving artisan coffee and pastries in the heart of San Francisco.',
      image: [`${DOMAIN}/images/seo-coffee-house.jpg`, `${DOMAIN}/images/seo-coffee-interior.jpg`],
      address: {
        streetAddress: '456 Search Street',
        addressLocality: 'San Francisco',
        addressRegion: 'CA',
        postalCode: '94102',
        addressCountry: 'US',
      },
      geo: {
        latitude: 37.7849,
        longitude: -122.4094,
      },
      telephone: '+1-415-555-0123',
      url: `${DOMAIN}/local-business`,
      priceRange: '$$',
      openingHoursSpecification: [
        { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '07:00', closes: '20:00' },
        { dayOfWeek: 'Saturday', opens: '08:00', closes: '21:00' },
        { dayOfWeek: 'Sunday', opens: '08:00', closes: '18:00' },
      ],
      aggregateRating: {
        ratingValue: 4.7,
        reviewCount: 328,
        bestRating: 5,
      },
      review: [
        {
          author: { type: 'Person', name: 'Coffee Lover' },
          datePublished: '2024-01-05',
          reviewBody: 'Best latte in the city! The atmosphere is perfect for working.',
          reviewRating: { ratingValue: 5, bestRating: 5 },
        },
      ],
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: 'Artisan Coffee • San Francisco',
  }}
/>

<h1>SEO Coffee House</h1>

<section>
  <h2>LocalBusiness JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>LocalBusiness</code> structured data type.
    Google may show this in local search results and Google Maps.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Business name and description</li>
    <li>Address and geolocation</li>
    <li>Phone number</li>
    <li>Price range</li>
    <li>Opening hours</li>
    <li>Aggregate ratings and reviews</li>
    <li>Specialized type (Restaurant, Store, etc.)</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
    <div style="background: #f9f9f9; padding: 1.5rem; border-radius: 12px;">
      <h3 style="margin-top: 0;">📍 Location</h3>
      <p>456 Search Street<br>San Francisco, CA 94102</p>
      <p><a href="https://maps.google.com/?q=37.7849,-122.4094" target="_blank">Get Directions</a></p>
    </div>

    <div style="background: #f9f9f9; padding: 1.5rem; border-radius: 12px;">
      <h3 style="margin-top: 0;">📞 Contact</h3>
      <p>Phone: <a href="tel:+14155550123">(415) 555-0123</a></p>
      <p>Email: hello@seocoffee.example</p>
    </div>

    <div style="background: #f9f9f9; padding: 1.5rem; border-radius: 12px;">
      <h3 style="margin-top: 0;">⏰ Hours</h3>
      <p>Mon-Fri: 7:00 AM - 8:00 PM</p>
      <p>Saturday: 8:00 AM - 9:00 PM</p>
      <p>Sunday: 8:00 AM - 6:00 PM</p>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
    <span style="font-size: 1.5rem; color: #ffc107;">★★★★★</span>
    <span style="font-size: 1.2rem; font-weight: bold;">4.7 / 5</span>
    <span style="color: #666;">Based on 328 reviews</span>
    <span style="background: #28a745; color: white; padding: 0.25rem 0.75rem; border-radius: 4px;">$$</span>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>Menu Highlights</h3>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
    <div style="padding: 1rem; border: 1px solid #eee; border-radius: 8px;">
      <strong>Signature Latte</strong>
      <p style="margin: 0.5rem 0;">$5.50</p>
    </div>
    <div style="padding: 1rem; border: 1px solid #eee; border-radius: 8px;">
      <strong>Pour Over</strong>
      <p style="margin: 0.5rem 0;">$4.50</p>
    </div>
    <div style="padding: 1rem; border: 1px solid #eee; border-radius: 8px;">
      <strong>Espresso</strong>
      <p style="margin: 0.5rem 0;">$3.50</p>
    </div>
    <div style="padding: 1rem; border: 1px solid #eee; border-radius: 8px;">
      <strong>Fresh Pastries</strong>
      <p style="margin: 0.5rem 0;">$3.00+</p>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>Customer Review</h3>
  <div style="background: #f9f9f9; padding: 1.5rem; border-radius: 8px;">
    <p style="color: #ffc107; margin: 0;">★★★★★</p>
    <p style="font-style: italic; margin: 0.5rem 0;">"Best latte in the city! The atmosphere is perfect for working."</p>
    <p style="color: #666; margin: 0;">— Coffee Lover, January 2024</p>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=SEO Coffee House&type=website&subtitle=Best Coffee in San Francisco" target="_blank">
      View OG Image
    </a>
  </p>
</section>
