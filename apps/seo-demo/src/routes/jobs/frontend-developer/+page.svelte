<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="Senior Frontend Developer - Remote Position"
  description="Join our team as a Senior Frontend Developer. Remote-first company offering competitive salary, equity, and excellent benefits."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'JobPosting',
    data: {
      title: 'Senior Frontend Developer',
      description: 'We are looking for a Senior Frontend Developer to join our growing team. You will be responsible for building and maintaining our web applications using modern technologies like React, TypeScript, and Next.js.',
      datePosted: '2024-01-10',
      validThrough: '2024-03-10',
      hiringOrganization: {
        name: 'SEO Demo Tech',
        url: DOMAIN,
        logo: `${DOMAIN}/logo.png`,
      },
      jobLocation: {
        type: 'Place',
        address: {
          addressLocality: 'San Francisco',
          addressRegion: 'CA',
          addressCountry: 'US',
        },
      },
      jobLocationType: 'TELECOMMUTE',
      baseSalary: {
        currency: 'USD',
        value: { minValue: 150000, maxValue: 200000 },
        unitText: 'YEAR',
      },
      employmentType: 'FULL_TIME',
      identifier: {
        name: 'SEO Demo Tech',
        value: 'FE-2024-001',
      },
      directApply: true,
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: 'Remote • $150K-$200K • Full-time',
  }}
/>

<h1>Senior Frontend Developer</h1>

<section>
  <h2>JobPosting JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>JobPosting</code> structured data type.
    Google may show this in job search results and Google for Jobs.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Job title and description</li>
    <li>Posting and expiration dates</li>
    <li>Hiring organization</li>
    <li>Job location (including remote)</li>
    <li>Salary range with currency</li>
    <li>Employment type</li>
    <li>Job identifier</li>
    <li>Direct apply flag</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 2rem; border-radius: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
          <span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem;">🌍 Remote</span>
          <span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem;">💼 Full-time</span>
          <span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem;">💵 $150K-$200K</span>
        </div>
        <p style="margin: 0; opacity: 0.9;">Posted: January 10, 2024 • Closes: March 10, 2024</p>
      </div>
      <button style="background: white; color: #11998e; border: none; padding: 1rem 2rem; font-size: 1.1rem; font-weight: bold; border-radius: 8px; cursor: pointer;">
        Apply Now
      </button>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>About the Role</h3>
  <p>
    We are looking for a Senior Frontend Developer to join our growing team. You will be
    responsible for building and maintaining our web applications using modern technologies.
  </p>

  <h4>Responsibilities</h4>
  <ul>
    <li>Design and implement user interfaces using React and TypeScript</li>
    <li>Collaborate with designers and backend engineers</li>
    <li>Write clean, maintainable, and well-tested code</li>
    <li>Mentor junior developers and conduct code reviews</li>
    <li>Contribute to architectural decisions</li>
  </ul>

  <h4>Requirements</h4>
  <ul>
    <li>5+ years of frontend development experience</li>
    <li>Strong proficiency in React, TypeScript, and modern CSS</li>
    <li>Experience with Next.js or similar frameworks</li>
    <li>Understanding of web performance optimization</li>
    <li>Excellent communication skills</li>
  </ul>

  <h4>Nice to Have</h4>
  <ul>
    <li>Experience with SvelteKit</li>
    <li>Knowledge of SEO best practices</li>
    <li>Open source contributions</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h3>Benefits</h3>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
    <div style="padding: 1rem; background: #f9f9f9; border-radius: 8px;">
      <strong>🏥 Health Insurance</strong>
      <p style="margin: 0.5rem 0 0;">Medical, dental, and vision</p>
    </div>
    <div style="padding: 1rem; background: #f9f9f9; border-radius: 8px;">
      <strong>📈 Equity</strong>
      <p style="margin: 0.5rem 0 0;">Stock options package</p>
    </div>
    <div style="padding: 1rem; background: #f9f9f9; border-radius: 8px;">
      <strong>🏖️ Unlimited PTO</strong>
      <p style="margin: 0.5rem 0 0;">Take time when you need it</p>
    </div>
    <div style="padding: 1rem; background: #f9f9f9; border-radius: 8px;">
      <strong>💻 Equipment</strong>
      <p style="margin: 0.5rem 0 0;">$3,000 home office budget</p>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>About SEO Demo Tech</h3>
  <p>
    SEO Demo Tech is a fast-growing startup building tools for the modern web.
    We're a remote-first company with team members across the globe, united by
    our passion for great developer experience and web performance.
  </p>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=Senior Frontend Developer&type=website&subtitle=Remote | $150K-$200K | Full-time" target="_blank">
      View OG Image
    </a>
  </p>
</section>
