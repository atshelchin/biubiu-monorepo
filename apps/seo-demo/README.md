# SEO Demo

A comprehensive demonstration of `@shelchin/seo-sveltekit` package capabilities.

## Features Demonstrated

| Page | Type | JSON-LD Schema | Route |
|------|------|----------------|-------|
| Home | website | WebSite | `/` |
| Tool | tool | SoftwareApplication | `/tools/json-formatter` |
| Article | article | TechArticle | `/blog/getting-started` |
| FAQ | faq | FAQPage | `/faq` |
| Tutorial | howto | HowTo | `/tutorials/setup-guide` |
| Multi-lang | website | WebSite | `/en`, `/zh` |

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev
```

## Testing SEO Features

### 1. Meta Tags & Open Graph

Open browser DevTools (F12) → Elements tab → Check `<head>` section:

- `<title>` - Page title
- `<meta name="description">` - Description
- `<link rel="canonical">` - Canonical URL
- `<meta property="og:*">` - Open Graph tags
- `<meta name="twitter:*">` - Twitter Card tags

### 2. JSON-LD Structured Data

1. **View in DevTools**: Look for `<script type="application/ld+json">` in head
2. **Google Rich Results Test**: https://search.google.com/test/rich-results
   - Paste your page URL or HTML source
   - Check for detected schemas and errors

### 3. Hreflang Tags

Visit `/en` or `/zh` and check `<head>` for:
```html
<link rel="alternate" hreflang="en" href="https://...">
<link rel="alternate" hreflang="zh" href="https://...">
<link rel="alternate" hreflang="x-default" href="https://...">
```

### 4. OG Image Generation

Test the dynamic OG image API:

```bash
# Website template
curl "http://localhost:5173/api/og?title=Hello%20World&type=website"

# Tool template
curl "http://localhost:5173/api/og?title=JSON%20Formatter&type=tool&emoji=%F0%9F%94%A7"

# Article template
curl "http://localhost:5173/api/og?title=Getting%20Started&type=article&readTime=5%20min&difficulty=Beginner"

# FAQ template
curl "http://localhost:5173/api/og?title=FAQ&type=faq"

# HowTo template
curl "http://localhost:5173/api/og?title=Setup%20Guide&type=howto"
```

Or visit in browser: `http://localhost:5173/api/og?title=Test&type=tool`

## Public Access Testing with Cloudflare Tunnel

To test social media previews (Telegram, Twitter, Facebook), you need a publicly accessible URL.

### Quick Setup

```bash
# Install cloudflared (macOS)
brew install cloudflare/cloudflare/cloudflared

# In terminal 1: Create tunnel first to get your public URL
cloudflared tunnel --url http://localhost:5173
# Output: https://random-name.trycloudflare.com

# In terminal 2: Update .env with your tunnel URL, then start dev server
echo "PUBLIC_DOMAIN=https://random-name.trycloudflare.com" > .env
bun run dev
```

**IMPORTANT**: You must set `PUBLIC_DOMAIN` in `.env` to your actual Cloudflare Tunnel URL for OG images to work in social media previews. The OG image URLs in meta tags must be publicly accessible.

### Testing Social Previews

1. **Twitter Card Validator**: https://cards-dev.twitter.com/validator
2. **Facebook Sharing Debugger**: https://developers.facebook.com/tools/debug/
3. **LinkedIn Post Inspector**: https://www.linkedin.com/post-inspector/
4. **Telegram**: Send link to @WebpageBot on Telegram

### Persistent Tunnel (Optional)

For a stable URL:

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create named tunnel
cloudflared tunnel create seo-demo

# Configure tunnel
cat > ~/.cloudflared/config.yml << EOF
tunnel: seo-demo
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: seo-demo.yourdomain.com
    service: http://localhost:5173
  - service: http_status:404
EOF

# Run tunnel
cloudflared tunnel run seo-demo
```

## Page Testing Checklist

### Home Page (`/`)
- [ ] WebSite JSON-LD with SearchAction
- [ ] og:type = "website"
- [ ] Hreflang tags present
- [ ] Canonical URL correct

### Tool Page (`/tools/json-formatter`)
- [ ] SoftwareApplication JSON-LD
- [ ] applicationCategory = "DeveloperApplication"
- [ ] aggregateRating present
- [ ] offers with price = 0
- [ ] OG image with tool template

### Article Page (`/blog/getting-started`)
- [ ] TechArticle JSON-LD
- [ ] proficiencyLevel present
- [ ] author and publisher
- [ ] datePublished and dateModified
- [ ] og:type = "article"
- [ ] OG image with article template

### FAQ Page (`/faq`)
- [ ] FAQPage JSON-LD
- [ ] Multiple Question/Answer pairs
- [ ] OG image with faq template

### Tutorial Page (`/tutorials/setup-guide`)
- [ ] HowTo JSON-LD
- [ ] steps array with name/text
- [ ] totalTime in ISO 8601 format
- [ ] tools and supplies
- [ ] OG image with howto template

### Multi-language Pages (`/en`, `/zh`)
- [ ] Correct locale in og:locale
- [ ] hreflang tags for all locales
- [ ] x-default hreflang present
- [ ] Content matches locale

## Troubleshooting

### OG Image Not Loading

1. **Most common**: `PUBLIC_DOMAIN` not set to actual public URL
   - Update `.env` with your Cloudflare Tunnel URL
   - Restart dev server after changing `.env`
2. Check if fonts are accessible (network required)
3. Verify API route exists at `/api/og`
4. Check browser console for errors

### OG Image Not Showing in Social Media (Telegram, Twitter, etc.)

1. Ensure `PUBLIC_DOMAIN` in `.env` is set to your Cloudflare Tunnel URL
2. The domain must be publicly accessible - social media crawlers can't access localhost
3. After changing `.env`, restart the dev server
4. Use browser DevTools to check `og:image` meta tag URL - it should point to your public domain

### JSON-LD Not Detected

1. Ensure script tag has `type="application/ld+json"`
2. Validate JSON syntax
3. Use Google Rich Results Test for debugging

### Hreflang Issues

1. All language versions must link to each other
2. x-default should point to default language
3. URLs must be absolute with protocol
