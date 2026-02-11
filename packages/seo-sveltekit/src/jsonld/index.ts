import type {
  JsonLdConfig,
  SoftwareApplicationData,
  ArticleData,
  TechArticleData,
  NewsArticleData,
  FAQPageData,
  HowToData,
  WebSiteData,
  OrganizationData,
  BreadcrumbListData,
  PersonOrOrganization,
  ProductData,
  ProductOffer,
  RecipeData,
  EventData,
  VideoObjectData,
  LocalBusinessData,
  CourseData,
  JobPostingData,
  ReviewData,
  BookData,
  ItemListData,
  MedicalConditionData,
  PodcastEpisodeData,
  PodcastSeriesData,
} from '../types.js';

/**
 * Build JSON-LD structured data from configuration
 */
export function buildJsonLd(config: JsonLdConfig, baseUrl?: string): object {
  switch (config.type) {
    case 'SoftwareApplication':
      return buildSoftwareApplication(config.data);
    case 'Article':
      return buildArticle(config.data, baseUrl);
    case 'TechArticle':
      return buildTechArticle(config.data, baseUrl);
    case 'NewsArticle':
      return buildNewsArticle(config.data, baseUrl);
    case 'FAQPage':
      return buildFAQPage(config.data);
    case 'HowTo':
      return buildHowTo(config.data);
    case 'WebSite':
      return buildWebSite(config.data);
    case 'Organization':
      return buildOrganization(config.data);
    case 'BreadcrumbList':
      return buildBreadcrumbList(config.data);
    case 'Product':
      return buildProduct(config.data);
    case 'Recipe':
      return buildRecipe(config.data);
    case 'Event':
      return buildEvent(config.data);
    case 'VideoObject':
      return buildVideoObject(config.data);
    case 'LocalBusiness':
      return buildLocalBusiness(config.data);
    case 'Course':
      return buildCourse(config.data);
    case 'JobPosting':
      return buildJobPosting(config.data);
    case 'Review':
      return buildReview(config.data);
    case 'Book':
      return buildBook(config.data);
    case 'ItemList':
      return buildItemList(config.data);
    case 'MedicalCondition':
      return buildMedicalCondition(config.data);
    case 'PodcastEpisode':
      return buildPodcastEpisode(config.data);
    case 'PodcastSeries':
      return buildPodcastSeries(config.data);
    default:
      return {};
  }
}

/**
 * Build SoftwareApplication schema
 * @see https://schema.org/SoftwareApplication
 */
function buildSoftwareApplication(data: SoftwareApplicationData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: data.name,
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.applicationCategory) {
    schema.applicationCategory = data.applicationCategory;
  }

  if (data.operatingSystem) {
    schema.operatingSystem = data.operatingSystem;
  }

  if (data.softwareVersion) {
    schema.softwareVersion = data.softwareVersion;
  }

  if (data.screenshot) {
    schema.screenshot = data.screenshot;
  }

  if (data.offers) {
    schema.offers = {
      '@type': 'Offer',
      price: data.offers.price,
      priceCurrency: data.offers.priceCurrency || 'USD',
    };
  }

  if (data.aggregateRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.aggregateRating.ratingValue,
      ratingCount: data.aggregateRating.ratingCount,
      bestRating: data.aggregateRating.bestRating || 5,
      worstRating: data.aggregateRating.worstRating || 1,
    };
  }

  if (data.author) {
    schema.author = buildPersonOrOrganization(data.author);
  }

  return schema;
}

/**
 * Build Article schema
 * @see https://schema.org/Article
 */
function buildArticle(data: ArticleData, baseUrl?: string): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.headline,
    datePublished: data.datePublished,
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.dateModified) {
    schema.dateModified = data.dateModified;
  }

  if (data.author) {
    schema.author = Array.isArray(data.author)
      ? data.author.map(buildPersonOrOrganization)
      : buildPersonOrOrganization(data.author);
  }

  if (data.publisher) {
    schema.publisher = buildOrganization(data.publisher);
  }

  if (baseUrl) {
    schema.mainEntityOfPage = {
      '@type': 'WebPage',
      '@id': baseUrl,
    };
  }

  return schema;
}

/**
 * Build TechArticle schema
 * @see https://schema.org/TechArticle
 */
function buildTechArticle(data: TechArticleData, baseUrl?: string): object {
  const articleSchema = buildArticle(data, baseUrl) as Record<string, unknown>;
  articleSchema['@type'] = 'TechArticle';

  if (data.proficiencyLevel) {
    articleSchema.proficiencyLevel = data.proficiencyLevel;
  }

  if (data.dependencies) {
    articleSchema.dependencies = data.dependencies;
  }

  return articleSchema;
}

/**
 * Build FAQPage schema
 * @see https://schema.org/FAQPage
 */
function buildFAQPage(data: FAQPageData): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.questions.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Build HowTo schema
 * @see https://schema.org/HowTo
 */
function buildHowTo(data: HowToData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: data.name,
    step: data.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
      ...(step.url && { url: step.url }),
    })),
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.totalTime) {
    schema.totalTime = data.totalTime;
  }

  if (data.estimatedCost) {
    schema.estimatedCost = {
      '@type': 'MonetaryAmount',
      currency: data.estimatedCost.currency,
      value: data.estimatedCost.value,
    };
  }

  if (data.supply && data.supply.length > 0) {
    schema.supply = data.supply.map((item) => ({
      '@type': 'HowToSupply',
      name: item.name,
      ...(item.url && { url: item.url }),
    }));
  }

  if (data.tool && data.tool.length > 0) {
    schema.tool = data.tool.map((item) => ({
      '@type': 'HowToTool',
      name: item.name,
      ...(item.url && { url: item.url }),
    }));
  }

  return schema;
}

/**
 * Build WebSite schema
 * @see https://schema.org/WebSite
 */
function buildWebSite(data: WebSiteData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: data.name,
    url: data.url,
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.potentialAction) {
    schema.potentialAction = {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: data.potentialAction.target,
      },
      'query-input': data.potentialAction.queryInput,
    };
  }

  return schema;
}

/**
 * Build Organization schema
 * @see https://schema.org/Organization
 */
function buildOrganization(data: OrganizationData): object {
  const schema: Record<string, unknown> = {
    '@type': 'Organization',
    name: data.name,
  };

  if (data.url) {
    schema.url = data.url;
  }

  if (data.logo) {
    schema.logo = {
      '@type': 'ImageObject',
      url: data.logo,
    };
  }

  if (data.sameAs && data.sameAs.length > 0) {
    schema.sameAs = data.sameAs;
  }

  return schema;
}

/**
 * Build BreadcrumbList schema
 * @see https://schema.org/BreadcrumbList
 */
function buildBreadcrumbList(data: BreadcrumbListData): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: data.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Build Person or Organization entity
 */
function buildPersonOrOrganization(entity: PersonOrOrganization): object {
  if (entity.type === 'Person') {
    return {
      '@type': 'Person',
      name: entity.name,
      ...(entity.url && { url: entity.url }),
    };
  }

  return {
    '@type': 'Organization',
    name: entity.name,
    ...(entity.url && { url: entity.url }),
    ...(entity.logo && { logo: entity.logo }),
  };
}

/**
 * Build NewsArticle schema
 * @see https://schema.org/NewsArticle
 */
function buildNewsArticle(data: NewsArticleData, baseUrl?: string): object {
  const articleSchema = buildArticle(data, baseUrl) as Record<string, unknown>;
  articleSchema['@type'] = 'NewsArticle';

  if (data.articleSection) {
    articleSchema.articleSection = data.articleSection;
  }

  if (data.keywords && data.keywords.length > 0) {
    articleSchema.keywords = data.keywords.join(', ');
  }

  return articleSchema;
}

/**
 * Build Offer schema
 */
function buildOffer(offer: ProductOffer): object {
  const schema: Record<string, unknown> = {
    '@type': 'Offer',
    price: offer.price,
    priceCurrency: offer.priceCurrency || 'USD',
  };

  if (offer.availability) {
    schema.availability = `https://schema.org/${offer.availability}`;
  }

  if (offer.url) {
    schema.url = offer.url;
  }

  if (offer.priceValidUntil) {
    schema.priceValidUntil = offer.priceValidUntil;
  }

  if (offer.seller) {
    schema.seller = buildOrganization(offer.seller);
  }

  return schema;
}

/**
 * Build Product schema
 * @see https://schema.org/Product
 */
function buildProduct(data: ProductData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: data.name,
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.brand) {
    schema.brand = {
      '@type': 'Brand',
      name: data.brand,
    };
  }

  if (data.sku) {
    schema.sku = data.sku;
  }

  if (data.gtin) {
    schema.gtin = data.gtin;
  }

  if (data.mpn) {
    schema.mpn = data.mpn;
  }

  if (data.offers) {
    schema.offers = Array.isArray(data.offers)
      ? data.offers.map(buildOffer)
      : buildOffer(data.offers);
  }

  if (data.aggregateRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.aggregateRating.ratingValue,
      ...(data.aggregateRating.reviewCount && { reviewCount: data.aggregateRating.reviewCount }),
      ...(data.aggregateRating.ratingCount && { ratingCount: data.aggregateRating.ratingCount }),
      bestRating: data.aggregateRating.bestRating || 5,
      worstRating: data.aggregateRating.worstRating || 1,
    };
  }

  if (data.review && data.review.length > 0) {
    schema.review = data.review.map((r) => buildReview(r, false));
  }

  return schema;
}

/**
 * Build Recipe schema
 * @see https://schema.org/Recipe
 */
function buildRecipe(data: RecipeData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: data.name,
    recipeIngredient: data.recipeIngredient,
    recipeInstructions: data.recipeInstructions.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: step.text,
      ...(step.name && { name: step.name }),
      ...(step.image && { image: step.image }),
    })),
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.author) {
    schema.author = buildPersonOrOrganization(data.author);
  }

  if (data.datePublished) {
    schema.datePublished = data.datePublished;
  }

  if (data.prepTime) {
    schema.prepTime = data.prepTime;
  }

  if (data.cookTime) {
    schema.cookTime = data.cookTime;
  }

  if (data.totalTime) {
    schema.totalTime = data.totalTime;
  }

  if (data.recipeYield) {
    schema.recipeYield = data.recipeYield;
  }

  if (data.recipeCategory) {
    schema.recipeCategory = data.recipeCategory;
  }

  if (data.recipeCuisine) {
    schema.recipeCuisine = data.recipeCuisine;
  }

  if (data.nutrition) {
    schema.nutrition = {
      '@type': 'NutritionInformation',
      ...data.nutrition,
    };
  }

  if (data.aggregateRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.aggregateRating.ratingValue,
      ratingCount: data.aggregateRating.ratingCount,
      bestRating: data.aggregateRating.bestRating || 5,
    };
  }

  if (data.video) {
    schema.video = buildVideoObject(data.video, false);
  }

  return schema;
}

/**
 * Build Event schema
 * @see https://schema.org/Event
 */
function buildEvent(data: EventData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: data.name,
    startDate: data.startDate,
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.endDate) {
    schema.endDate = data.endDate;
  }

  if (data.eventStatus) {
    schema.eventStatus = `https://schema.org/${data.eventStatus}`;
  }

  if (data.eventAttendanceMode) {
    schema.eventAttendanceMode = `https://schema.org/${data.eventAttendanceMode}`;
  }

  if (data.location) {
    if (data.location.type === 'VirtualLocation') {
      schema.location = {
        '@type': 'VirtualLocation',
        url: data.location.url,
      };
    } else {
      schema.location = {
        '@type': 'Place',
        ...(data.location.name && { name: data.location.name }),
        address: typeof data.location.address === 'string'
          ? data.location.address
          : {
              '@type': 'PostalAddress',
              ...data.location.address,
            },
      };
    }
  }

  if (data.organizer) {
    schema.organizer = buildPersonOrOrganization(data.organizer);
  }

  if (data.performer) {
    schema.performer = Array.isArray(data.performer)
      ? data.performer.map(buildPersonOrOrganization)
      : buildPersonOrOrganization(data.performer);
  }

  if (data.offers) {
    schema.offers = Array.isArray(data.offers)
      ? data.offers.map(buildOffer)
      : buildOffer(data.offers);
  }

  return schema;
}

/**
 * Build VideoObject schema
 * @see https://schema.org/VideoObject
 */
function buildVideoObject(data: VideoObjectData, includeContext = true): object {
  const schema: Record<string, unknown> = {
    '@type': 'VideoObject',
    name: data.name,
    description: data.description,
    thumbnailUrl: data.thumbnailUrl,
    uploadDate: data.uploadDate,
  };

  if (includeContext) {
    schema['@context'] = 'https://schema.org';
  }

  if (data.duration) {
    schema.duration = data.duration;
  }

  if (data.contentUrl) {
    schema.contentUrl = data.contentUrl;
  }

  if (data.embedUrl) {
    schema.embedUrl = data.embedUrl;
  }

  if (data.interactionStatistic) {
    const stats: object[] = [];
    if (data.interactionStatistic.watchCount !== undefined) {
      stats.push({
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'WatchAction' },
        userInteractionCount: data.interactionStatistic.watchCount,
      });
    }
    if (data.interactionStatistic.likeCount !== undefined) {
      stats.push({
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'LikeAction' },
        userInteractionCount: data.interactionStatistic.likeCount,
      });
    }
    if (data.interactionStatistic.commentCount !== undefined) {
      stats.push({
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'CommentAction' },
        userInteractionCount: data.interactionStatistic.commentCount,
      });
    }
    if (stats.length > 0) {
      schema.interactionStatistic = stats;
    }
  }

  if (data.publication) {
    schema.publication = {
      '@type': 'BroadcastEvent',
      isLiveBroadcast: data.publication.isLiveBroadcast,
      ...(data.publication.startDate && { startDate: data.publication.startDate }),
      ...(data.publication.endDate && { endDate: data.publication.endDate }),
    };
  }

  return schema;
}

/**
 * Build LocalBusiness schema
 * @see https://schema.org/LocalBusiness
 */
function buildLocalBusiness(data: LocalBusinessData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': data['@type'] || 'LocalBusiness',
    name: data.name,
    address: {
      '@type': 'PostalAddress',
      ...data.address,
    },
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.geo) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: data.geo.latitude,
      longitude: data.geo.longitude,
    };
  }

  if (data.telephone) {
    schema.telephone = data.telephone;
  }

  if (data.url) {
    schema.url = data.url;
  }

  if (data.priceRange) {
    schema.priceRange = data.priceRange;
  }

  if (data.openingHoursSpecification && data.openingHoursSpecification.length > 0) {
    schema.openingHoursSpecification = data.openingHoursSpecification.map((hours) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: hours.dayOfWeek,
      opens: hours.opens,
      closes: hours.closes,
    }));
  }

  if (data.aggregateRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.aggregateRating.ratingValue,
      ...(data.aggregateRating.reviewCount && { reviewCount: data.aggregateRating.reviewCount }),
      ...(data.aggregateRating.ratingCount && { ratingCount: data.aggregateRating.ratingCount }),
      bestRating: data.aggregateRating.bestRating || 5,
    };
  }

  if (data.review && data.review.length > 0) {
    schema.review = data.review.map((r) => buildReview(r, false));
  }

  return schema;
}

/**
 * Build Course schema
 * @see https://schema.org/Course
 */
function buildCourse(data: CourseData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: data.name,
    description: data.description,
  };

  if (data.provider) {
    schema.provider = buildOrganization(data.provider);
  }

  if (data.offers) {
    schema.offers = buildOffer(data.offers);
  }

  if (data.hasCourseInstance && data.hasCourseInstance.length > 0) {
    schema.hasCourseInstance = data.hasCourseInstance.map((instance) => ({
      '@type': 'CourseInstance',
      ...(instance.courseMode && { courseMode: instance.courseMode }),
      ...(instance.startDate && { startDate: instance.startDate }),
      ...(instance.endDate && { endDate: instance.endDate }),
      ...(instance.instructor && { instructor: buildPersonOrOrganization(instance.instructor) }),
    }));
  }

  if (data.educationalLevel) {
    schema.educationalLevel = data.educationalLevel;
  }

  if (data.coursePrerequisites) {
    schema.coursePrerequisites = data.coursePrerequisites;
  }

  return schema;
}

/**
 * Build JobPosting schema
 * @see https://schema.org/JobPosting
 */
function buildJobPosting(data: JobPostingData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: data.title,
    description: data.description,
    datePosted: data.datePosted,
    hiringOrganization: buildOrganization(data.hiringOrganization),
  };

  if (data.validThrough) {
    schema.validThrough = data.validThrough;
  }

  if (data.jobLocation) {
    schema.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...data.jobLocation.address,
      },
    };
  }

  if (data.jobLocationType) {
    schema.jobLocationType = data.jobLocationType;
  }

  if (data.baseSalary) {
    const salaryValue = typeof data.baseSalary.value === 'object'
      ? {
          '@type': 'QuantitativeValue',
          minValue: data.baseSalary.value.minValue,
          maxValue: data.baseSalary.value.maxValue,
          unitText: data.baseSalary.unitText,
        }
      : {
          '@type': 'QuantitativeValue',
          value: data.baseSalary.value,
          unitText: data.baseSalary.unitText,
        };

    schema.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: data.baseSalary.currency,
      value: salaryValue,
    };
  }

  if (data.employmentType) {
    schema.employmentType = data.employmentType;
  }

  if (data.identifier) {
    schema.identifier = {
      '@type': 'PropertyValue',
      name: data.identifier.name,
      value: data.identifier.value,
    };
  }

  if (data.directApply !== undefined) {
    schema.directApply = data.directApply;
  }

  return schema;
}

/**
 * Build Review schema
 * @see https://schema.org/Review
 */
function buildReview(data: ReviewData, includeContext = true): object {
  const schema: Record<string, unknown> = {
    '@type': 'Review',
    author: buildPersonOrOrganization(data.author),
  };

  if (includeContext) {
    schema['@context'] = 'https://schema.org';
  }

  if (data.itemReviewed) {
    schema.itemReviewed = {
      '@type': data.itemReviewed.type,
      name: data.itemReviewed.name,
      ...(data.itemReviewed.image && { image: data.itemReviewed.image }),
    };
  }

  if (data.datePublished) {
    schema.datePublished = data.datePublished;
  }

  if (data.reviewBody) {
    schema.reviewBody = data.reviewBody;
  }

  if (data.reviewRating) {
    schema.reviewRating = {
      '@type': 'Rating',
      ratingValue: data.reviewRating.ratingValue,
      bestRating: data.reviewRating.bestRating || 5,
      worstRating: data.reviewRating.worstRating || 1,
    };
  }

  return schema;
}

/**
 * Build Book schema
 * @see https://schema.org/Book
 */
function buildBook(data: BookData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: data.name,
    author: Array.isArray(data.author)
      ? data.author.map(buildPersonOrOrganization)
      : buildPersonOrOrganization(data.author),
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.isbn) {
    schema.isbn = data.isbn;
  }

  if (data.bookEdition) {
    schema.bookEdition = data.bookEdition;
  }

  if (data.bookFormat) {
    schema.bookFormat = `https://schema.org/${data.bookFormat}`;
  }

  if (data.numberOfPages) {
    schema.numberOfPages = data.numberOfPages;
  }

  if (data.publisher) {
    schema.publisher = buildOrganization(data.publisher);
  }

  if (data.datePublished) {
    schema.datePublished = data.datePublished;
  }

  if (data.inLanguage) {
    schema.inLanguage = data.inLanguage;
  }

  if (data.aggregateRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.aggregateRating.ratingValue,
      ...(data.aggregateRating.ratingCount && { ratingCount: data.aggregateRating.ratingCount }),
      ...(data.aggregateRating.reviewCount && { reviewCount: data.aggregateRating.reviewCount }),
      bestRating: data.aggregateRating.bestRating || 5,
    };
  }

  if (data.review && data.review.length > 0) {
    schema.review = data.review.map((r) => buildReview(r, false));
  }

  if (data.workExample && data.workExample.length > 0) {
    schema.workExample = data.workExample.map((example) => ({
      '@type': 'Book',
      ...(example.isbn && { isbn: example.isbn }),
      ...(example.bookEdition && { bookEdition: example.bookEdition }),
      ...(example.bookFormat && { bookFormat: `https://schema.org/${example.bookFormat}` }),
      ...(example.offers && { offers: buildOffer(example.offers) }),
    }));
  }

  return schema;
}

/**
 * Build ItemList schema (for carousels, galleries, etc.)
 * @see https://schema.org/ItemList
 */
function buildItemList(data: ItemListData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: data.itemListElement.map((item, index) => {
      if (item.type === 'ListItem') {
        return {
          '@type': 'ListItem',
          position: item.position || index + 1,
          ...(item.name && { name: item.name }),
          ...(item.url && { url: item.url }),
          ...(item.image && { image: item.image }),
          ...(item.item && { item: item.item }),
        };
      }
      // For typed items (Product, Article, etc.)
      return {
        '@type': 'ListItem',
        position: item.position || index + 1,
        item: {
          '@type': item.type,
          ...(item.name && { name: item.name }),
          ...(item.url && { url: item.url }),
          ...(item.image && { image: item.image }),
          ...item.item,
        },
      };
    }),
  };

  if (data.name) {
    schema.name = data.name;
  }

  if (data.description) {
    schema.description = data.description;
  }

  if (data.itemListOrder) {
    schema.itemListOrder = `https://schema.org/${data.itemListOrder}`;
  }

  if (data.numberOfItems) {
    schema.numberOfItems = data.numberOfItems;
  }

  return schema;
}

/**
 * Build MedicalCondition schema
 * @see https://schema.org/MedicalCondition
 */
function buildMedicalCondition(data: MedicalConditionData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MedicalCondition',
    name: data.name,
  };

  if (data.description) {
    schema.description = data.description;
  }

  if (data.alternateName) {
    schema.alternateName = data.alternateName;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.associatedAnatomy) {
    schema.associatedAnatomy = {
      '@type': data.associatedAnatomy.type,
      name: data.associatedAnatomy.name,
    };
  }

  if (data.cause && data.cause.length > 0) {
    schema.cause = data.cause.map((c) => ({
      '@type': 'MedicalCause',
      name: c.name,
    }));
  }

  if (data.differentialDiagnosis && data.differentialDiagnosis.length > 0) {
    schema.differentialDiagnosis = data.differentialDiagnosis.map((dd) => ({
      '@type': 'DDxElement',
      diagnosis: {
        '@type': 'MedicalCondition',
        name: dd.diagnosis.name,
      },
      ...(dd.distinguishingSign && {
        distinguishingSign: dd.distinguishingSign.map((s) => ({
          '@type': 'MedicalSignOrSymptom',
          name: s.name,
        })),
      }),
    }));
  }

  if (data.drug && data.drug.length > 0) {
    schema.drug = data.drug.map((d) => ({
      '@type': 'Drug',
      name: d.name,
      ...(d.url && { url: d.url }),
    }));
  }

  if (data.epidemiology) {
    schema.epidemiology = data.epidemiology;
  }

  if (data.expectedPrognosis) {
    schema.expectedPrognosis = data.expectedPrognosis;
  }

  if (data.naturalProgression) {
    schema.naturalProgression = data.naturalProgression;
  }

  if (data.pathophysiology) {
    schema.pathophysiology = data.pathophysiology;
  }

  if (data.possibleComplication && data.possibleComplication.length > 0) {
    schema.possibleComplication = data.possibleComplication.map((c) => ({
      '@type': 'MedicalCondition',
      name: c.name,
    }));
  }

  if (data.possibleTreatment && data.possibleTreatment.length > 0) {
    schema.possibleTreatment = data.possibleTreatment.map((t) => ({
      '@type': t.type,
      name: t.name,
      ...(t.description && { description: t.description }),
    }));
  }

  if (data.primaryPrevention && data.primaryPrevention.length > 0) {
    schema.primaryPrevention = data.primaryPrevention.map((p) => ({
      '@type': p.type,
      name: p.name,
    }));
  }

  if (data.riskFactor && data.riskFactor.length > 0) {
    schema.riskFactor = data.riskFactor.map((r) => ({
      '@type': 'MedicalRiskFactor',
      name: r.name,
    }));
  }

  if (data.signOrSymptom && data.signOrSymptom.length > 0) {
    schema.signOrSymptom = data.signOrSymptom.map((s) => ({
      '@type': 'MedicalSignOrSymptom',
      name: s.name,
    }));
  }

  if (data.stage) {
    schema.stage = {
      '@type': 'MedicalConditionStage',
      ...(data.stage.stageAsNumber !== undefined && { stageAsNumber: data.stage.stageAsNumber }),
      ...(data.stage.subStageSuffix && { subStageSuffix: data.stage.subStageSuffix }),
    };
  }

  if (data.typicalTest && data.typicalTest.length > 0) {
    schema.typicalTest = data.typicalTest.map((t) => ({
      '@type': 'MedicalTest',
      name: t.name,
    }));
  }

  return schema;
}

/**
 * Build PodcastEpisode schema
 * @see https://schema.org/PodcastEpisode
 */
function buildPodcastEpisode(data: PodcastEpisodeData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: data.name,
    description: data.description,
    datePublished: data.datePublished,
  };

  if (data.url) {
    schema.url = data.url;
  }

  if (data.duration) {
    schema.timeRequired = data.duration;
  }

  if (data.episodeNumber !== undefined) {
    schema.episodeNumber = data.episodeNumber;
  }

  if (data.seasonNumber !== undefined) {
    schema.partOfSeason = {
      '@type': 'PodcastSeason',
      seasonNumber: data.seasonNumber,
    };
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.audio) {
    schema.associatedMedia = {
      '@type': 'AudioObject',
      contentUrl: data.audio.contentUrl,
      ...(data.audio.encodingFormat && { encodingFormat: data.audio.encodingFormat }),
      ...(data.audio.duration && { duration: data.audio.duration }),
    };
  }

  if (data.partOfSeries) {
    schema.partOfSeries = {
      '@type': 'PodcastSeries',
      name: data.partOfSeries.name,
      ...(data.partOfSeries.url && { url: data.partOfSeries.url }),
    };
  }

  if (data.author) {
    schema.author = Array.isArray(data.author)
      ? data.author.map(buildPersonOrOrganization)
      : buildPersonOrOrganization(data.author);
  }

  if (data.transcript) {
    schema.transcript = data.transcript;
  }

  return schema;
}

/**
 * Build PodcastSeries schema
 * @see https://schema.org/PodcastSeries
 */
function buildPodcastSeries(data: PodcastSeriesData): object {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    name: data.name,
    description: data.description,
  };

  if (data.url) {
    schema.url = data.url;
  }

  if (data.image) {
    schema.image = data.image;
  }

  if (data.author) {
    schema.author = Array.isArray(data.author)
      ? data.author.map(buildPersonOrOrganization)
      : buildPersonOrOrganization(data.author);
  }

  if (data.publisher) {
    schema.publisher = buildOrganization(data.publisher);
  }

  if (data.webFeed) {
    schema.webFeed = data.webFeed;
  }

  if (data.inLanguage) {
    schema.inLanguage = data.inLanguage;
  }

  if (data.genre) {
    schema.genre = data.genre;
  }

  if (data.startDate) {
    schema.startDate = data.startDate;
  }

  if (data.endDate) {
    schema.endDate = data.endDate;
  }

  if (data.episode && data.episode.length > 0) {
    schema.episode = data.episode.map((ep) => ({
      '@type': 'PodcastEpisode',
      name: ep.name,
      ...(ep.url && { url: ep.url }),
      ...(ep.datePublished && { datePublished: ep.datePublished }),
      ...(ep.episodeNumber !== undefined && { episodeNumber: ep.episodeNumber }),
    }));
  }

  return schema;
}

/**
 * Serialize JSON-LD to string for embedding in script tag
 * Escapes characters that could break HTML script tags
 */
export function serializeJsonLd(jsonLd: object): string {
  return JSON.stringify(jsonLd, null, 0)
    // Escape closing script tags to prevent XSS and parsing issues
    .replace(/<\/script/gi, '<\\/script')
    // Escape HTML comments
    .replace(/<!--/g, '<\\!--');
}

/**
 * Build multiple JSON-LD objects and combine them
 */
export function buildMultipleJsonLd(configs: JsonLdConfig[], baseUrl?: string): object[] {
  return configs.map((config) => buildJsonLd(config, baseUrl));
}
