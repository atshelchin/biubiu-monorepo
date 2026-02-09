<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="SEO Mastery Course - Complete Training Program"
  description="Master SEO with our comprehensive online course. 40+ hours of video content, hands-on exercises, and certification upon completion."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'Course',
    data: {
      name: 'SEO Mastery Course',
      description: 'A comprehensive online course covering all aspects of SEO from beginner to advanced. Includes 40+ hours of video content, practical exercises, and a certification exam.',
      provider: {
        name: 'SEO Demo Academy',
        url: DOMAIN,
        logo: `${DOMAIN}/logo.png`,
      },
      offers: {
        price: 199,
        priceCurrency: 'USD',
        availability: 'InStock',
        url: `${DOMAIN}/courses/seo-mastery/enroll`,
      },
      hasCourseInstance: [
        {
          courseMode: 'online',
          startDate: '2024-02-01',
          instructor: { type: 'Person', name: 'Dr. Sarah Johnson' },
        },
        {
          courseMode: 'online',
          startDate: '2024-03-01',
          instructor: { type: 'Person', name: 'Michael Chen' },
        },
      ],
      educationalLevel: 'Beginner to Advanced',
      coursePrerequisites: ['Basic understanding of websites', 'Familiarity with Google Search'],
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: '40+ hours • Certificate included',
    difficulty: 'Beginner',
  }}
/>

<h1>SEO Mastery Course</h1>

<section>
  <h2>Course JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>Course</code> structured data type.
    Google may show course information in search results and Google for Education.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Course name and description</li>
    <li>Provider/institution</li>
    <li>Price and enrollment info</li>
    <li>Course instances (schedules)</li>
    <li>Instructors</li>
    <li>Educational level and prerequisites</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h3 style="margin: 0;">Enroll Today</h3>
        <p style="margin: 0.5rem 0; font-size: 2rem; font-weight: bold;">$199</p>
        <p style="margin: 0; opacity: 0.9;">Lifetime access • Certificate included</p>
      </div>
      <button style="background: white; color: #667eea; border: none; padding: 1rem 2rem; font-size: 1.1rem; font-weight: bold; border-radius: 8px; cursor: pointer;">
        Start Learning
      </button>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>What's Included</h3>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
    <div style="text-align: center; padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">
      <div style="font-size: 2rem;">📹</div>
      <strong>40+ Hours</strong>
      <p>Video content</p>
    </div>
    <div style="text-align: center; padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">
      <div style="font-size: 2rem;">📝</div>
      <strong>50+ Exercises</strong>
      <p>Hands-on practice</p>
    </div>
    <div style="text-align: center; padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">
      <div style="font-size: 2rem;">🏆</div>
      <strong>Certificate</strong>
      <p>Upon completion</p>
    </div>
    <div style="text-align: center; padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">
      <div style="font-size: 2rem;">💬</div>
      <strong>Community</strong>
      <p>Discord access</p>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>Course Curriculum</h3>
  <details style="margin-bottom: 0.5rem; padding: 1rem; background: #f9f9f9; border-radius: 8px;">
    <summary style="cursor: pointer; font-weight: bold;">Module 1: SEO Fundamentals (4 hours)</summary>
    <ul style="margin-top: 1rem;">
      <li>How search engines work</li>
      <li>Understanding ranking factors</li>
      <li>SEO tools overview</li>
    </ul>
  </details>
  <details style="margin-bottom: 0.5rem; padding: 1rem; background: #f9f9f9; border-radius: 8px;">
    <summary style="cursor: pointer; font-weight: bold;">Module 2: Keyword Research (6 hours)</summary>
    <ul style="margin-top: 1rem;">
      <li>Finding profitable keywords</li>
      <li>Competitor analysis</li>
      <li>Search intent understanding</li>
    </ul>
  </details>
  <details style="margin-bottom: 0.5rem; padding: 1rem; background: #f9f9f9; border-radius: 8px;">
    <summary style="cursor: pointer; font-weight: bold;">Module 3: On-Page SEO (8 hours)</summary>
    <ul style="margin-top: 1rem;">
      <li>Title tags and meta descriptions</li>
      <li>Header optimization</li>
      <li>Content optimization</li>
    </ul>
  </details>
  <details style="margin-bottom: 0.5rem; padding: 1rem; background: #f9f9f9; border-radius: 8px;">
    <summary style="cursor: pointer; font-weight: bold;">Module 4: Technical SEO (10 hours)</summary>
    <ul style="margin-top: 1rem;">
      <li>Site structure and crawlability</li>
      <li>Page speed optimization</li>
      <li>Mobile-first indexing</li>
    </ul>
  </details>
</section>

<section style="margin-top: 2rem;">
  <h3>Upcoming Sessions</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="background: #f0f0f0;">
        <th style="padding: 0.75rem; text-align: left;">Start Date</th>
        <th style="padding: 0.75rem; text-align: left;">Instructor</th>
        <th style="padding: 0.75rem; text-align: left;">Format</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 0.75rem; border-bottom: 1px solid #eee;">February 1, 2024</td>
        <td style="padding: 0.75rem; border-bottom: 1px solid #eee;">Dr. Sarah Johnson</td>
        <td style="padding: 0.75rem; border-bottom: 1px solid #eee;">Online (Self-paced)</td>
      </tr>
      <tr>
        <td style="padding: 0.75rem;">March 1, 2024</td>
        <td style="padding: 0.75rem;">Michael Chen</td>
        <td style="padding: 0.75rem;">Online (Self-paced)</td>
      </tr>
    </tbody>
  </table>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=SEO Mastery Course&type=website&subtitle=40+ hours | Certificate included" target="_blank">
      View OG Image
    </a>
  </p>
</section>
