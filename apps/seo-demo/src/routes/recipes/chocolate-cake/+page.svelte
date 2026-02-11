<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="Ultimate Chocolate Cake Recipe"
  description="Learn how to make the most delicious chocolate cake with rich ganache frosting. Perfect for birthdays and special occasions."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="article"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'Recipe',
    data: {
      name: 'Ultimate Chocolate Cake',
      description: 'A rich, moist chocolate cake with decadent ganache frosting that melts in your mouth.',
      image: [`${DOMAIN}/images/chocolate-cake.jpg`],
      author: { type: 'Person', name: 'Chef Maria' },
      datePublished: '2024-01-10',
      prepTime: 'PT30M',
      cookTime: 'PT45M',
      totalTime: 'PT1H15M',
      recipeYield: '12 servings',
      recipeCategory: 'Dessert',
      recipeCuisine: 'American',
      recipeIngredient: [
        '2 cups all-purpose flour',
        '2 cups sugar',
        '3/4 cup unsweetened cocoa powder',
        '2 teaspoons baking soda',
        '1 teaspoon salt',
        '2 large eggs',
        '1 cup buttermilk',
        '1 cup hot water',
        '1/2 cup vegetable oil',
        '2 teaspoons vanilla extract',
        '1 cup heavy cream (for ganache)',
        '8 oz dark chocolate (for ganache)',
      ],
      recipeInstructions: [
        { name: 'Prepare', text: 'Preheat oven to 350°F (175°C). Grease and flour two 9-inch round cake pans.' },
        { name: 'Mix Dry', text: 'In a large bowl, whisk together flour, sugar, cocoa, baking soda, and salt.' },
        { name: 'Add Wet', text: 'Add eggs, buttermilk, oil, and vanilla. Beat on medium speed for 2 minutes.' },
        { name: 'Add Water', text: 'Stir in hot water (batter will be thin). Pour into prepared pans.' },
        { name: 'Bake', text: 'Bake for 30-35 minutes or until a toothpick comes out clean. Cool completely.' },
        { name: 'Make Ganache', text: 'Heat cream until simmering. Pour over chopped chocolate and stir until smooth.' },
        { name: 'Frost', text: 'Stack cake layers and cover with ganache. Let set before serving.' },
      ],
      nutrition: {
        calories: '450 calories',
        fatContent: '22g',
        carbohydrateContent: '58g',
        proteinContent: '6g',
        sugarContent: '42g',
      },
      aggregateRating: {
        ratingValue: 4.9,
        ratingCount: 892,
        bestRating: 5,
      },
    },
  }}
  ogParams={{
    type: 'article',
    subtitle: 'Prep: 30min | Cook: 45min | Servings: 12',
  }}
/>

<h1>Ultimate Chocolate Cake</h1>

<section>
  <h2>Recipe JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>Recipe</code> structured data type.
    Google may show this in recipe carousels with images, ratings, and cook times.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Recipe name and description</li>
    <li>Prep, cook, and total time (ISO 8601 duration)</li>
    <li>Yield/servings</li>
    <li>Ingredients list</li>
    <li>Step-by-step instructions</li>
    <li>Nutrition information</li>
    <li>Aggregate ratings</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
    <span style="background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 20px;">⏱️ Prep: 30 min</span>
    <span style="background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 20px;">🍳 Cook: 45 min</span>
    <span style="background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 20px;">🍽️ Servings: 12</span>
    <span style="background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 20px;">⭐ 4.9 (892 reviews)</span>
  </div>

  <h3>Ingredients</h3>
  <ul>
    <li>2 cups all-purpose flour</li>
    <li>2 cups sugar</li>
    <li>3/4 cup unsweetened cocoa powder</li>
    <li>2 teaspoons baking soda</li>
    <li>1 teaspoon salt</li>
    <li>2 large eggs</li>
    <li>1 cup buttermilk</li>
    <li>1 cup hot water</li>
    <li>1/2 cup vegetable oil</li>
    <li>2 teaspoons vanilla extract</li>
    <li>1 cup heavy cream (for ganache)</li>
    <li>8 oz dark chocolate (for ganache)</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h3>Instructions</h3>
  <ol>
    <li><strong>Prepare:</strong> Preheat oven to 350°F. Grease and flour two 9-inch round cake pans.</li>
    <li><strong>Mix Dry:</strong> Whisk together flour, sugar, cocoa, baking soda, and salt.</li>
    <li><strong>Add Wet:</strong> Add eggs, buttermilk, oil, and vanilla. Beat for 2 minutes.</li>
    <li><strong>Add Water:</strong> Stir in hot water. Pour into prepared pans.</li>
    <li><strong>Bake:</strong> Bake for 30-35 minutes. Cool completely.</li>
    <li><strong>Make Ganache:</strong> Heat cream, pour over chocolate, stir until smooth.</li>
    <li><strong>Frost:</strong> Stack layers and cover with ganache.</li>
  </ol>
</section>

<section style="margin-top: 2rem; background: #f9f9f9; padding: 1rem; border-radius: 8px;">
  <h3>Nutrition (per serving)</h3>
  <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
    <span>Calories: 450</span>
    <span>Fat: 22g</span>
    <span>Carbs: 58g</span>
    <span>Protein: 6g</span>
    <span>Sugar: 42g</span>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=Ultimate Chocolate Cake Recipe&type=article&subtitle=Prep: 30min | Cook: 45min" target="_blank">
      View OG Image
    </a>
  </p>
</section>
