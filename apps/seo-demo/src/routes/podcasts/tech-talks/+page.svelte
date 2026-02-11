<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';

  const episodes = [
    { number: 42, title: 'The Future of AI in Web Development', date: '2024-01-15', duration: 'PT45M' },
    { number: 41, title: 'SvelteKit vs Next.js: A Deep Dive', date: '2024-01-08', duration: 'PT52M' },
    { number: 40, title: 'Building Accessible Web Applications', date: '2024-01-01', duration: 'PT38M' },
  ];
</script>

<SEO
  title="Tech Talks Podcast - Web Development & Technology"
  description="Weekly discussions about web development, programming, and the latest in technology. Join our community of developers and tech enthusiasts."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'PodcastSeries',
    data: {
      name: 'Tech Talks Podcast',
      description: 'A weekly podcast exploring the latest trends in web development, programming languages, and technology. Featuring interviews with industry experts and in-depth technical discussions.',
      url: `${DOMAIN}/podcasts/tech-talks`,
      image: `${DOMAIN}/api/og?title=Tech Talks Podcast&type=video&category=Technology`,
      author: [
        { type: 'Person', name: 'Alex Developer', url: 'https://twitter.com/alexdev' },
        { type: 'Person', name: 'Sam Engineer', url: 'https://twitter.com/sameng' },
      ],
      publisher: {
        name: 'SEO Demo Media',
        url: DOMAIN,
      },
      webFeed: `${DOMAIN}/podcasts/tech-talks/feed.xml`,
      inLanguage: 'en',
      genre: ['Technology', 'Web Development', 'Programming'],
      startDate: '2023-01-01',
      episode: episodes.map((ep) => ({
        type: 'PodcastEpisode',
        name: ep.title,
        url: `${DOMAIN}/podcasts/tech-talks/episode-${ep.number}`,
        datePublished: ep.date,
        episodeNumber: ep.number,
      })),
    },
  }}
  ogParams={{
    type: 'video',
    subtitle: 'Weekly Tech Podcast',
    category: 'Technology',
  }}
/>

<h1>Tech Talks Podcast</h1>

<section>
  <h2>PodcastSeries JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>PodcastSeries</code> structured data type.
    Google may display podcast information in search results and Google Podcasts.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Podcast series name and description</li>
    <li>Hosts/Authors information</li>
    <li>Publisher details</li>
    <li>RSS feed URL (webFeed)</li>
    <li>Genre and language</li>
    <li>Episode list with details</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="display: flex; gap: 2rem; align-items: start; flex-wrap: wrap;">
    <div style="background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); padding: 2rem; border-radius: 16px; color: white; min-width: 200px; text-align: center;">
      <div style="font-size: 4rem;">🎙️</div>
      <h3 style="margin: 1rem 0 0.5rem 0;">Tech Talks</h3>
      <p style="margin: 0; opacity: 0.9;">Weekly Episodes</p>
    </div>
    <div style="flex: 1; min-width: 300px;">
      <h3 style="margin-top: 0;">About the Show</h3>
      <p>
        Tech Talks is a weekly podcast exploring the latest trends in web development,
        programming languages, and technology. We feature interviews with industry experts
        and in-depth technical discussions.
      </p>
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <span style="padding: 0.25rem 0.75rem; background: #e0e7ff; border-radius: 999px; font-size: 0.9rem;">Technology</span>
        <span style="padding: 0.25rem 0.75rem; background: #e0e7ff; border-radius: 999px; font-size: 0.9rem;">Web Development</span>
        <span style="padding: 0.25rem 0.75rem; background: #e0e7ff; border-radius: 999px; font-size: 0.9rem;">Programming</span>
      </div>
      <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
        <a href="#" style="background: #1DB954; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none;">Spotify</a>
        <a href="#" style="background: #9146FF; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none;">Apple</a>
        <a href="#" style="background: #EA4335; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none;">Google</a>
      </div>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>Hosts</h2>
  <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
    <div style="display: flex; gap: 1rem; align-items: center;">
      <div style="width: 60px; height: 60px; background: #e0e7ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">👨‍💻</div>
      <div>
        <strong>Alex Developer</strong>
        <p style="margin: 0; font-size: 0.9rem; color: #666;">@alexdev</p>
      </div>
    </div>
    <div style="display: flex; gap: 1rem; align-items: center;">
      <div style="width: 60px; height: 60px; background: #fce7f3; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">👩‍💻</div>
      <div>
        <strong>Sam Engineer</strong>
        <p style="margin: 0; font-size: 0.9rem; color: #666;">@sameng</p>
      </div>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>Latest Episodes</h2>
  {#each episodes as episode}
    <div style="display: flex; gap: 1rem; padding: 1rem; background: #f9f9f9; border-radius: 8px; margin-bottom: 1rem; align-items: center;">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
        #{episode.number}
      </div>
      <div style="flex: 1;">
        <h4 style="margin: 0;">{episode.title}</h4>
        <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: #666;">
          {new Date(episode.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          • {episode.duration.replace('PT', '').replace('M', ' min')}
        </p>
      </div>
      <button style="background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 999px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;">
        ▶ Play
      </button>
    </div>
  {/each}
</section>

<section style="margin-top: 2rem;">
  <h2>Subscribe to RSS</h2>
  <p>
    Subscribe to our podcast feed:
    <code style="background: #f4f4f4; padding: 0.25rem 0.5rem; border-radius: 4px;">
      {DOMAIN}/podcasts/tech-talks/feed.xml
    </code>
  </p>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=Tech Talks Podcast&type=video&subtitle=Weekly Tech Podcast&category=Technology" target="_blank">
      View OG Image
    </a>
  </p>
</section>
