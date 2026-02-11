/**
 * SEO Component Props
 */
export interface SEOProps {
  /** Page title */
  title: string;
  /** Page description (meta description) */
  description: string;
  /** Canonical URL (defaults to current page URL) */
  canonical?: string;

  /** Site name for og:site_name */
  siteName?: string;
  /** Site domain (e.g., 'https://biubiu.tools') */
  domain?: string;

  /** Open Graph type */
  ogType?: 'website' | 'article';
  /** Custom OG image URL (overrides dynamic generation) */
  ogImage?: string;
  /** OG image width */
  ogImageWidth?: number;
  /** OG image height */
  ogImageHeight?: number;

  /** Supported locales for hreflang (e.g., ['en', 'zh', 'ja']) */
  locales?: string[];
  /** Current locale */
  currentLocale?: string;
  /** Default locale for x-default */
  defaultLocale?: string;

  /** Twitter card type */
  twitterCard?: 'summary' | 'summary_large_image';
  /** Twitter @username */
  twitterSite?: string;
  /** Twitter @username for creator */
  twitterCreator?: string;

  /** JSON-LD structured data */
  jsonLd?: JsonLdConfig;

  /** OG image generation parameters */
  ogParams?: OgImageParams;

  /** Disable OG image generation (use only if ogImage is provided) */
  disableOgGeneration?: boolean;

  /** Additional meta tags */
  additionalMeta?: Array<{
    name?: string;
    property?: string;
    content: string;
  }>;
}

/**
 * JSON-LD Configuration
 */
export type JsonLdConfig =
  | { type: 'SoftwareApplication'; data: SoftwareApplicationData }
  | { type: 'Article'; data: ArticleData }
  | { type: 'TechArticle'; data: TechArticleData }
  | { type: 'NewsArticle'; data: NewsArticleData }
  | { type: 'FAQPage'; data: FAQPageData }
  | { type: 'HowTo'; data: HowToData }
  | { type: 'WebSite'; data: WebSiteData }
  | { type: 'Organization'; data: OrganizationData }
  | { type: 'BreadcrumbList'; data: BreadcrumbListData }
  | { type: 'Product'; data: ProductData }
  | { type: 'Recipe'; data: RecipeData }
  | { type: 'Event'; data: EventData }
  | { type: 'VideoObject'; data: VideoObjectData }
  | { type: 'LocalBusiness'; data: LocalBusinessData }
  | { type: 'Course'; data: CourseData }
  | { type: 'JobPosting'; data: JobPostingData }
  | { type: 'Review'; data: ReviewData }
  | { type: 'Book'; data: BookData }
  | { type: 'ItemList'; data: ItemListData }
  | { type: 'MedicalCondition'; data: MedicalConditionData }
  | { type: 'PodcastEpisode'; data: PodcastEpisodeData }
  | { type: 'PodcastSeries'; data: PodcastSeriesData };

/**
 * SoftwareApplication Schema Data
 * @see https://schema.org/SoftwareApplication
 */
export interface SoftwareApplicationData {
  name: string;
  description?: string;
  applicationCategory?:
    | 'DeveloperApplication'
    | 'DesignApplication'
    | 'BusinessApplication'
    | 'WebApplication'
    | 'BrowserApplication'
    | 'EducationalApplication'
    | 'GameApplication'
    | 'UtilitiesApplication'
    | string;
  operatingSystem?: string;
  offers?: {
    price: number | string;
    priceCurrency?: string;
  };
  aggregateRating?: {
    ratingValue: number;
    ratingCount: number;
    bestRating?: number;
    worstRating?: number;
  };
  screenshot?: string | string[];
  softwareVersion?: string;
  author?: PersonOrOrganization;
}

/**
 * Article Schema Data
 * @see https://schema.org/Article
 */
export interface ArticleData {
  headline: string;
  description?: string;
  image?: string | string[];
  datePublished: string;
  dateModified?: string;
  author: PersonOrOrganization | PersonOrOrganization[];
  publisher?: OrganizationData;
}

/**
 * TechArticle Schema Data (extends Article)
 * @see https://schema.org/TechArticle
 */
export interface TechArticleData extends ArticleData {
  proficiencyLevel?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  dependencies?: string;
}

/**
 * FAQPage Schema Data
 * @see https://schema.org/FAQPage
 */
export interface FAQPageData {
  questions: Array<{
    question: string;
    answer: string;
  }>;
}

/**
 * HowTo Schema Data
 * @see https://schema.org/HowTo
 */
export interface HowToData {
  name: string;
  description?: string;
  image?: string;
  totalTime?: string; // ISO 8601 duration (e.g., 'PT30M')
  estimatedCost?: {
    currency: string;
    value: number | string;
  };
  supply?: Array<{
    name: string;
    url?: string;
  }>;
  tool?: Array<{
    name: string;
    url?: string;
  }>;
  steps: Array<{
    name: string;
    text: string;
    image?: string;
    url?: string;
  }>;
}

/**
 * WebSite Schema Data
 * @see https://schema.org/WebSite
 */
export interface WebSiteData {
  name: string;
  url: string;
  description?: string;
  potentialAction?: {
    target: string;
    queryInput: string;
  };
}

/**
 * Organization Schema Data
 * @see https://schema.org/Organization
 */
export interface OrganizationData {
  name: string;
  url?: string;
  logo?: string;
  sameAs?: string[];
}

/**
 * BreadcrumbList Schema Data
 * @see https://schema.org/BreadcrumbList
 */
export interface BreadcrumbListData {
  items: Array<{
    name: string;
    url: string;
  }>;
}

/**
 * Person or Organization reference
 */
export type PersonOrOrganization =
  | { type: 'Person'; name: string; url?: string }
  | { type: 'Organization'; name: string; url?: string; logo?: string };

/**
 * NewsArticle Schema Data
 * @see https://schema.org/NewsArticle
 */
export interface NewsArticleData extends ArticleData {
  /** Section of the publication */
  articleSection?: string;
  /** Keywords for the article */
  keywords?: string[];
}

/**
 * Product Schema Data
 * @see https://schema.org/Product
 */
export interface ProductData {
  name: string;
  description?: string;
  image?: string | string[];
  brand?: string;
  sku?: string;
  gtin?: string;
  mpn?: string;
  offers?: ProductOffer | ProductOffer[];
  aggregateRating?: {
    ratingValue: number;
    reviewCount?: number;
    ratingCount?: number;
    bestRating?: number;
    worstRating?: number;
  };
  review?: ReviewData[];
}

/**
 * Product Offer
 */
export interface ProductOffer {
  price: number | string;
  priceCurrency?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | 'SoldOut' | 'OnlineOnly' | 'LimitedAvailability';
  url?: string;
  priceValidUntil?: string;
  seller?: OrganizationData;
}

/**
 * Recipe Schema Data
 * @see https://schema.org/Recipe
 */
export interface RecipeData {
  name: string;
  description?: string;
  image?: string | string[];
  author?: PersonOrOrganization;
  datePublished?: string;
  prepTime?: string; // ISO 8601 duration
  cookTime?: string; // ISO 8601 duration
  totalTime?: string; // ISO 8601 duration
  recipeYield?: string; // e.g., "4 servings"
  recipeCategory?: string; // e.g., "Dessert"
  recipeCuisine?: string; // e.g., "Italian"
  recipeIngredient: string[];
  recipeInstructions: Array<{
    text: string;
    name?: string;
    image?: string;
  }>;
  nutrition?: {
    calories?: string;
    fatContent?: string;
    carbohydrateContent?: string;
    proteinContent?: string;
    fiberContent?: string;
    sugarContent?: string;
    sodiumContent?: string;
  };
  aggregateRating?: {
    ratingValue: number;
    ratingCount: number;
    bestRating?: number;
  };
  video?: VideoObjectData;
}

/**
 * Event Schema Data
 * @see https://schema.org/Event
 */
export interface EventData {
  name: string;
  description?: string;
  image?: string | string[];
  startDate: string; // ISO 8601 datetime
  endDate?: string; // ISO 8601 datetime
  eventStatus?: 'EventScheduled' | 'EventCancelled' | 'EventPostponed' | 'EventRescheduled' | 'EventMovedOnline';
  eventAttendanceMode?: 'OfflineEventAttendanceMode' | 'OnlineEventAttendanceMode' | 'MixedEventAttendanceMode';
  location?: {
    type: 'Place' | 'VirtualLocation';
    name?: string;
    address?: string | {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
      postalCode?: string;
      addressCountry?: string;
    };
    url?: string; // For virtual events
  };
  organizer?: PersonOrOrganization;
  performer?: PersonOrOrganization | PersonOrOrganization[];
  offers?: ProductOffer | ProductOffer[];
}

/**
 * VideoObject Schema Data
 * @see https://schema.org/VideoObject
 */
export interface VideoObjectData {
  name: string;
  description: string;
  thumbnailUrl: string | string[];
  uploadDate: string; // ISO 8601 datetime
  duration?: string; // ISO 8601 duration
  contentUrl?: string;
  embedUrl?: string;
  interactionStatistic?: {
    watchCount?: number;
    likeCount?: number;
    commentCount?: number;
  };
  publication?: {
    isLiveBroadcast?: boolean;
    startDate?: string;
    endDate?: string;
  };
}

/**
 * LocalBusiness Schema Data
 * @see https://schema.org/LocalBusiness
 */
export interface LocalBusinessData {
  name: string;
  description?: string;
  image?: string | string[];
  '@type'?: 'Restaurant' | 'Store' | 'MedicalBusiness' | 'LegalService' | 'FinancialService' | 'LocalBusiness' | string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion?: string;
    postalCode: string;
    addressCountry: string;
  };
  geo?: {
    latitude: number;
    longitude: number;
  };
  telephone?: string;
  url?: string;
  priceRange?: string;
  openingHoursSpecification?: Array<{
    dayOfWeek: string | string[];
    opens: string;
    closes: string;
  }>;
  aggregateRating?: {
    ratingValue: number;
    reviewCount?: number;
    ratingCount?: number;
    bestRating?: number;
  };
  review?: ReviewData[];
}

/**
 * Course Schema Data
 * @see https://schema.org/Course
 */
export interface CourseData {
  name: string;
  description: string;
  provider?: OrganizationData;
  offers?: ProductOffer;
  hasCourseInstance?: Array<{
    courseMode?: 'online' | 'onsite' | 'blended';
    startDate?: string;
    endDate?: string;
    instructor?: PersonOrOrganization;
  }>;
  educationalLevel?: string;
  coursePrerequisites?: string | string[];
}

/**
 * JobPosting Schema Data
 * @see https://schema.org/JobPosting
 */
export interface JobPostingData {
  title: string;
  description: string;
  datePosted: string;
  validThrough?: string;
  hiringOrganization: OrganizationData;
  jobLocation?: {
    type?: 'Place';
    address: {
      streetAddress?: string;
      addressLocality: string;
      addressRegion?: string;
      postalCode?: string;
      addressCountry: string;
    };
  };
  jobLocationType?: 'TELECOMMUTE';
  baseSalary?: {
    currency: string;
    value: number | { minValue: number; maxValue: number };
    unitText?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  };
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'TEMPORARY' | 'INTERN' | 'VOLUNTEER' | 'PER_DIEM' | 'OTHER' | string[];
  identifier?: {
    name: string;
    value: string;
  };
  directApply?: boolean;
}

/**
 * Review Schema Data
 * @see https://schema.org/Review
 */
export interface ReviewData {
  itemReviewed?: {
    type: 'Product' | 'LocalBusiness' | 'Organization' | 'CreativeWork' | string;
    name: string;
    image?: string;
  };
  author: PersonOrOrganization;
  datePublished?: string;
  reviewBody?: string;
  reviewRating?: {
    ratingValue: number;
    bestRating?: number;
    worstRating?: number;
  };
}

/**
 * Book Schema Data
 * @see https://schema.org/Book
 */
export interface BookData {
  name: string;
  description?: string;
  image?: string | string[];
  author: PersonOrOrganization | PersonOrOrganization[];
  isbn?: string;
  bookEdition?: string;
  bookFormat?: 'AudiobookFormat' | 'EBook' | 'GraphicNovel' | 'Hardcover' | 'Paperback';
  numberOfPages?: number;
  publisher?: OrganizationData;
  datePublished?: string;
  inLanguage?: string;
  aggregateRating?: {
    ratingValue: number;
    ratingCount?: number;
    reviewCount?: number;
    bestRating?: number;
  };
  review?: ReviewData[];
  workExample?: Array<{
    isbn?: string;
    bookEdition?: string;
    bookFormat?: string;
    offers?: ProductOffer;
  }>;
}

/**
 * ItemList Schema Data (for Image Carousel, etc.)
 * @see https://schema.org/ItemList
 */
export interface ItemListData {
  name?: string;
  description?: string;
  itemListOrder?: 'ItemListOrderAscending' | 'ItemListOrderDescending' | 'ItemListUnordered';
  numberOfItems?: number;
  itemListElement: Array<{
    type: 'ListItem' | 'Product' | 'Article' | 'Recipe' | 'Course' | 'Event' | 'HowTo' | string;
    position?: number;
    name?: string;
    url?: string;
    image?: string;
    item?: Record<string, unknown>;
  }>;
}

/**
 * MedicalCondition Schema Data
 * @see https://schema.org/MedicalCondition
 */
export interface MedicalConditionData {
  name: string;
  description?: string;
  alternateName?: string | string[];
  image?: string | string[];
  associatedAnatomy?: {
    type: 'AnatomicalStructure' | 'AnatomicalSystem' | 'SuperficialAnatomy';
    name: string;
  };
  cause?: Array<{
    type: 'MedicalCause';
    name: string;
  }>;
  differentialDiagnosis?: Array<{
    type: 'DDxElement';
    diagnosis: {
      type: 'MedicalCondition';
      name: string;
    };
    distinguishingSign?: Array<{
      type: 'MedicalSignOrSymptom';
      name: string;
    }>;
  }>;
  drug?: Array<{
    type: 'Drug';
    name: string;
    url?: string;
  }>;
  epidemiology?: string;
  expectedPrognosis?: string;
  naturalProgression?: string;
  pathophysiology?: string;
  possibleComplication?: Array<{
    type: 'MedicalCondition';
    name: string;
  }>;
  possibleTreatment?: Array<{
    type: 'MedicalTherapy' | 'Drug';
    name: string;
    description?: string;
  }>;
  primaryPrevention?: Array<{
    type: 'MedicalTherapy' | 'LifestyleModification';
    name: string;
  }>;
  riskFactor?: Array<{
    type: 'MedicalRiskFactor';
    name: string;
  }>;
  signOrSymptom?: Array<{
    type: 'MedicalSignOrSymptom';
    name: string;
  }>;
  stage?: {
    type: 'MedicalConditionStage';
    stageAsNumber?: number;
    subStageSuffix?: string;
  };
  status?: 'EventCancelled' | 'EventPostponed' | 'EventRescheduled' | 'EventScheduled';
  typicalTest?: Array<{
    type: 'MedicalTest';
    name: string;
  }>;
}

/**
 * PodcastEpisode Schema Data
 * @see https://schema.org/PodcastEpisode
 */
export interface PodcastEpisodeData {
  name: string;
  description: string;
  url?: string;
  datePublished: string;
  duration?: string; // ISO 8601 duration
  episodeNumber?: number;
  seasonNumber?: number;
  image?: string | string[];
  audio?: {
    type: 'AudioObject';
    contentUrl: string;
    encodingFormat?: string;
    duration?: string;
  };
  partOfSeries?: {
    name: string;
    url?: string;
  };
  author?: PersonOrOrganization | PersonOrOrganization[];
  associatedMedia?: {
    type: 'AudioObject';
    contentUrl: string;
  };
  transcript?: string;
}

/**
 * PodcastSeries Schema Data
 * @see https://schema.org/PodcastSeries
 */
export interface PodcastSeriesData {
  name: string;
  description: string;
  url?: string;
  image?: string | string[];
  author?: PersonOrOrganization | PersonOrOrganization[];
  publisher?: OrganizationData;
  webFeed?: string; // RSS feed URL
  inLanguage?: string;
  genre?: string | string[];
  startDate?: string;
  endDate?: string;
  episode?: Array<{
    type: 'PodcastEpisode';
    name: string;
    url?: string;
    datePublished?: string;
    episodeNumber?: number;
  }>;
}

/**
 * OG Image Generation Parameters
 */
export interface OgImageParams {
  /** Template type */
  type?: 'website' | 'article' | 'tool' | 'faq' | 'howto' | 'product' | 'event' | 'recipe' | 'video' | 'job' | 'review';
  /** Subtitle or tagline */
  subtitle?: string;
  /** Emoji or icon for tool pages */
  emoji?: string;
  /** Reading time for article pages */
  readTime?: string;
  /** Difficulty level for tutorial pages */
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  /** Custom background gradient */
  gradient?: string;
  /** Author name */
  author?: string;
  /** Date string */
  date?: string;
  /** Price for product/event pages */
  price?: string;
  /** Rating value (0-5) for product/review pages */
  rating?: number;
  /** Duration for video/recipe pages */
  duration?: string;
  /** Location for event/job pages */
  location?: string;
  /** Category or tag */
  category?: string;
  /** Badge text (e.g., "New", "Sale", "Featured") */
  badge?: string;
}

/**
 * OG Handler Configuration
 */
export interface OgHandlerConfig {
  /** Site name displayed on OG images */
  siteName: string;
  /** Site domain for logo and branding */
  domain: string;
  /** Fonts to load */
  fonts?: OgFontConfig[];
  /** Default template type */
  defaultTemplate?: OgImageParams['type'];
  /** Cache-Control header value */
  cacheControl?: string;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** Custom logo URL or base64 */
  logo?: string;
  /** Default gradient */
  defaultGradient?: string;
}

/**
 * Font configuration for OG image generation
 */
export interface OgFontConfig {
  name: string;
  weight?: 400 | 500 | 600 | 700 | 800 | 900;
  style?: 'normal' | 'italic';
  /** Font file URL or local path */
  source: string | ArrayBuffer;
}

/**
 * OG Template render function type
 */
export type OgTemplateRenderer = (params: {
  title: string;
  siteName: string;
  config: OgHandlerConfig;
  params: OgImageParams;
}) => React.ReactNode;
