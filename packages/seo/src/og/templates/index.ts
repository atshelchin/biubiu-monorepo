import type { OgTemplateRenderer, OgImageParams, OgHandlerConfig } from '../../types.js';

/**
 * Base container styles
 */
const baseContainerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  width: '100%',
  height: '100%',
  padding: '60px',
  fontFamily: 'Inter, Noto Sans SC, Noto Sans JP, sans-serif',
};

/**
 * Parse gradient string to background style
 */
function parseGradient(gradient: string): string {
  return gradient;
}

/**
 * Website template - default template for general pages
 */
const websiteTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

  return {
    type: 'div',
    props: {
      style: {
        ...baseContainerStyle,
        background: parseGradient(gradient),
        justifyContent: 'space-between',
      },
      children: [
        // Top: Site name / Logo area
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '28px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.9)',
                  },
                  children: siteName,
                },
              },
            ],
          },
        },
        // Middle: Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '64px',
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1.2,
                    maxWidth: '900px',
                  },
                  children: title,
                },
              },
              params.subtitle
                ? {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: '28px',
                        fontWeight: 400,
                        color: 'rgba(255, 255, 255, 0.8)',
                        maxWidth: '800px',
                      },
                      children: params.subtitle,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        // Bottom: Domain
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    color: 'rgba(255, 255, 255, 0.7)',
                  },
                  children: config.domain?.replace(/^https?:\/\//, '') || '',
                },
              },
            ],
          },
        },
      ],
    },
  };
};

/**
 * Tool template - for software/tool pages with emoji support
 */
const toolTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)';

  return {
    type: 'div',
    props: {
      style: {
        ...baseContainerStyle,
        background: parseGradient(gradient),
        justifyContent: 'space-between',
      },
      children: [
        // Top: Site name
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.8)',
                  },
                  children: siteName,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    borderRadius: '20px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '16px',
                          color: '#10b981',
                          fontWeight: 500,
                        },
                        children: 'Free Tool',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Middle: Emoji + Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
            },
            children: [
              params.emoji
                ? {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: '96px',
                      },
                      children: params.emoji,
                    },
                  }
                : null,
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '56px',
                          fontWeight: 700,
                          color: '#ffffff',
                          lineHeight: 1.2,
                        },
                        children: title,
                      },
                    },
                    params.subtitle
                      ? {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '24px',
                              color: 'rgba(255, 255, 255, 0.7)',
                            },
                            children: params.subtitle,
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
            ].filter(Boolean),
          },
        },
        // Bottom: Domain
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    color: 'rgba(255, 255, 255, 0.5)',
                  },
                  children: config.domain?.replace(/^https?:\/\//, '') || '',
                },
              },
            ],
          },
        },
      ],
    },
  };
};

/**
 * Article template - for blog posts and tutorials
 */
const articleTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)';

  return {
    type: 'div',
    props: {
      style: {
        ...baseContainerStyle,
        background: parseGradient(gradient),
        justifyContent: 'space-between',
      },
      children: [
        // Top: Site name + metadata
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.8)',
                  },
                  children: siteName,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                  },
                  children: [
                    params.readTime
                      ? {
                          type: 'div',
                          props: {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '18px',
                              color: 'rgba(255, 255, 255, 0.7)',
                            },
                            children: `${params.readTime} read`,
                          },
                        }
                      : null,
                    params.difficulty
                      ? {
                          type: 'div',
                          props: {
                            style: {
                              padding: '6px 14px',
                              background: getDifficultyColor(params.difficulty),
                              borderRadius: '16px',
                              fontSize: '16px',
                              fontWeight: 500,
                              color: '#ffffff',
                            },
                            children: params.difficulty,
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
            ],
          },
        },
        // Middle: Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '52px',
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1.3,
                    maxWidth: '1000px',
                  },
                  children: title,
                },
              },
            ],
          },
        },
        // Bottom: Author + Date + Domain
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                  },
                  children: [
                    params.author
                      ? {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '20px',
                              color: 'rgba(255, 255, 255, 0.8)',
                            },
                            children: `By ${params.author}`,
                          },
                        }
                      : null,
                    params.date
                      ? {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '18px',
                              color: 'rgba(255, 255, 255, 0.6)',
                            },
                            children: params.date,
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    color: 'rgba(255, 255, 255, 0.5)',
                  },
                  children: config.domain?.replace(/^https?:\/\//, '') || '',
                },
              },
            ],
          },
        },
      ],
    },
  };
};

/**
 * FAQ template - for FAQ pages
 */
const faqTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #5b21b6 0%, #1e1b4b 100%)';

  return {
    type: 'div',
    props: {
      style: {
        ...baseContainerStyle,
        background: parseGradient(gradient),
        justifyContent: 'space-between',
      },
      children: [
        // Top: Site name
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.8)',
                  },
                  children: siteName,
                },
              },
            ],
          },
        },
        // Middle: Question mark icon + Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100px',
                    height: '100px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '50%',
                    fontSize: '56px',
                  },
                  children: '?',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '20px',
                          fontWeight: 500,
                          color: '#a78bfa',
                          textTransform: 'uppercase',
                          letterSpacing: '2px',
                        },
                        children: 'FAQ',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '52px',
                          fontWeight: 700,
                          color: '#ffffff',
                          lineHeight: 1.2,
                        },
                        children: title,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Bottom: Domain
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    color: 'rgba(255, 255, 255, 0.5)',
                  },
                  children: config.domain?.replace(/^https?:\/\//, '') || '',
                },
              },
            ],
          },
        },
      ],
    },
  };
};

/**
 * HowTo template - for step-by-step guides
 */
const howtoTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #065f46 0%, #022c22 100%)';

  return {
    type: 'div',
    props: {
      style: {
        ...baseContainerStyle,
        background: parseGradient(gradient),
        justifyContent: 'space-between',
      },
      children: [
        // Top: Site name + Guide label
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.8)',
                  },
                  children: siteName,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    borderRadius: '20px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '16px',
                          color: '#10b981',
                          fontWeight: 500,
                        },
                        children: 'Step-by-Step Guide',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Middle: Steps visual + Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
            },
            children: [
              // Steps visual
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  },
                  children: [1, 2, 3].map((num) => ({
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '40px',
                        height: '40px',
                        background: num === 1 ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '50%',
                        fontSize: '20px',
                        fontWeight: 600,
                        color: '#ffffff',
                      },
                      children: String(num),
                    },
                  })),
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '52px',
                          fontWeight: 700,
                          color: '#ffffff',
                          lineHeight: 1.2,
                        },
                        children: title,
                      },
                    },
                    params.subtitle
                      ? {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '24px',
                              color: 'rgba(255, 255, 255, 0.7)',
                            },
                            children: params.subtitle,
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
            ],
          },
        },
        // Bottom: Domain
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    color: 'rgba(255, 255, 255, 0.5)',
                  },
                  children: config.domain?.replace(/^https?:\/\//, '') || '',
                },
              },
            ],
          },
        },
      ],
    },
  };
};

/**
 * Get difficulty badge color
 */
function getDifficultyColor(difficulty: OgImageParams['difficulty']): string {
  switch (difficulty) {
    case 'Beginner':
      return '#10b981';
    case 'Intermediate':
      return '#f59e0b';
    case 'Advanced':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

/**
 * Render star rating
 */
function renderStars(rating: number) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const stars = [];
  for (let i = 0; i < 5; i++) {
    stars.push({
      type: 'div',
      props: {
        style: {
          fontSize: '28px',
          color: i < fullStars || (i === fullStars && hasHalf) ? '#fbbf24' : 'rgba(255,255,255,0.3)',
        },
        children: '★',
      },
    });
  }
  return stars;
}

/**
 * Product template - for e-commerce products
 */
const productTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)';
  return {
    type: 'div',
    props: {
      style: { ...baseContainerStyle, background: parseGradient(gradient), justifyContent: 'space-between' },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { fontSize: '24px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }, children: siteName } },
          params.badge ? { type: 'div', props: { style: { padding: '8px 20px', background: '#ef4444', borderRadius: '24px', fontSize: '18px', fontWeight: 600, color: '#ffffff' }, children: params.badge } } : null,
        ].filter(Boolean) } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '20px' }, children: [
          { type: 'div', props: { style: { fontSize: '56px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, maxWidth: '900px' }, children: title } },
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '24px' }, children: [
            params.price ? { type: 'div', props: { style: { fontSize: '40px', fontWeight: 700, color: '#fbbf24' }, children: params.price } } : null,
            params.rating ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '4px' }, children: renderStars(params.rating) } } : null,
          ].filter(Boolean) } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          params.category ? { type: 'div', props: { style: { padding: '8px 16px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '8px', fontSize: '18px', color: 'rgba(255, 255, 255, 0.9)' }, children: params.category } } : null,
          { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.5)' }, children: config.domain?.replace(/^https?:\/\//, '') || '' } },
        ].filter(Boolean) } },
      ],
    },
  };
};

/**
 * Event template - for events and conferences
 */
const eventTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #dc2626 0%, #9333ea 100%)';
  return {
    type: 'div',
    props: {
      style: { ...baseContainerStyle, background: parseGradient(gradient), justifyContent: 'space-between' },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { fontSize: '24px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }, children: siteName } },
          { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '24px', fontSize: '16px', fontWeight: 500, color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.3)' }, children: '🎉 EVENT' } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '24px' }, children: [
          { type: 'div', props: { style: { fontSize: '56px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, maxWidth: '900px' }, children: title } },
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '32px' }, children: [
            params.date ? { type: 'div', props: { style: { fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }, children: `📅 ${params.date}` } } : null,
            params.location ? { type: 'div', props: { style: { fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }, children: `📍 ${params.location}` } } : null,
          ].filter(Boolean) } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          params.price ? { type: 'div', props: { style: { fontSize: '28px', fontWeight: 700, color: '#fbbf24' }, children: params.price } } : null,
          { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.5)' }, children: config.domain?.replace(/^https?:\/\//, '') || '' } },
        ].filter(Boolean) } },
      ],
    },
  };
};

/**
 * Recipe template - for cooking recipes
 */
const recipeTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)';
  return {
    type: 'div',
    props: {
      style: { ...baseContainerStyle, background: parseGradient(gradient), justifyContent: 'space-between' },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { fontSize: '24px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }, children: siteName } },
          { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '24px', fontSize: '16px', fontWeight: 500, color: '#ffffff' }, children: '🍳 RECIPE' } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '20px' }, children: [
          { type: 'div', props: { style: { fontSize: '56px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, maxWidth: '900px' }, children: title } },
          params.subtitle ? { type: 'div', props: { style: { fontSize: '24px', color: 'rgba(255, 255, 255, 0.8)' }, children: params.subtitle } } : null,
        ].filter(Boolean) } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '24px' }, children: [
            params.duration ? { type: 'div', props: { style: { padding: '8px 16px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '8px', fontSize: '20px', color: '#ffffff' }, children: `⏱️ ${params.duration}` } } : null,
            params.rating ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '4px' }, children: renderStars(params.rating) } } : null,
          ].filter(Boolean) } },
          { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.5)' }, children: config.domain?.replace(/^https?:\/\//, '') || '' } },
        ] } },
      ],
    },
  };
};

/**
 * Video template - for video content
 */
const videoTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
  return {
    type: 'div',
    props: {
      style: { ...baseContainerStyle, background: parseGradient(gradient), justifyContent: 'space-between' },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { fontSize: '24px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }, children: siteName } },
          params.category ? { type: 'div', props: { style: { padding: '8px 16px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.8)' }, children: params.category } } : null,
        ].filter(Boolean) } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '32px' }, children: [
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100px', height: '100px', background: '#ef4444', borderRadius: '50%', fontSize: '48px', color: '#fff' }, children: '▶' } },
          { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '12px' }, children: [
            { type: 'div', props: { style: { fontSize: '48px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, maxWidth: '800px' }, children: title } },
            params.subtitle ? { type: 'div', props: { style: { fontSize: '22px', color: 'rgba(255, 255, 255, 0.7)' }, children: params.subtitle } } : null,
          ].filter(Boolean) } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '24px' }, children: [
            params.duration ? { type: 'div', props: { style: { padding: '8px 16px', background: 'rgba(239, 68, 68, 0.8)', borderRadius: '8px', fontSize: '18px', fontWeight: 600, color: '#ffffff' }, children: params.duration } } : null,
            params.author ? { type: 'div', props: { style: { fontSize: '18px', color: 'rgba(255, 255, 255, 0.7)' }, children: params.author } } : null,
          ].filter(Boolean) } },
          { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.5)' }, children: config.domain?.replace(/^https?:\/\//, '') || '' } },
        ] } },
      ],
    },
  };
};

/**
 * Job template - for job postings
 */
const jobTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #059669 0%, #0d9488 100%)';
  return {
    type: 'div',
    props: {
      style: { ...baseContainerStyle, background: parseGradient(gradient), justifyContent: 'space-between' },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { fontSize: '24px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }, children: siteName } },
          { type: 'div', props: { style: { padding: '8px 20px', background: '#fbbf24', borderRadius: '24px', fontSize: '16px', fontWeight: 600, color: '#1f2937' }, children: '💼 HIRING' } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '16px' }, children: [
          { type: 'div', props: { style: { fontSize: '56px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, maxWidth: '900px' }, children: title } },
          params.category ? { type: 'div', props: { style: { fontSize: '24px', color: 'rgba(255, 255, 255, 0.8)' }, children: params.category } } : null,
        ].filter(Boolean) } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '24px' }, children: [
            params.price ? { type: 'div', props: { style: { padding: '8px 16px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '8px', fontSize: '22px', fontWeight: 600, color: '#ffffff' }, children: `💰 ${params.price}` } } : null,
            params.location ? { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.8)' }, children: `📍 ${params.location}` } } : null,
          ].filter(Boolean) } },
          { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.5)' }, children: config.domain?.replace(/^https?:\/\//, '') || '' } },
        ] } },
      ],
    },
  };
};

/**
 * Review template - for product/service reviews
 */
const reviewTemplate: OgTemplateRenderer = ({ title, siteName, config, params }) => {
  const gradient = params.gradient || config.defaultGradient || 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)';
  return {
    type: 'div',
    props: {
      style: { ...baseContainerStyle, background: parseGradient(gradient), justifyContent: 'space-between' },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          { type: 'div', props: { style: { fontSize: '24px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }, children: siteName } },
          { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '24px', fontSize: '16px', fontWeight: 500, color: '#ffffff' }, children: '⭐ REVIEW' } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '24px' }, children: [
          { type: 'div', props: { style: { fontSize: '52px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, maxWidth: '900px' }, children: title } },
          params.rating ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [
            { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: renderStars(params.rating) } },
            { type: 'div', props: { style: { fontSize: '32px', fontWeight: 700, color: '#fbbf24' }, children: `${params.rating}/5` } },
          ] } } : null,
        ].filter(Boolean) } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          params.author ? { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.8)' }, children: `Review by ${params.author}` } } : null,
          { type: 'div', props: { style: { fontSize: '20px', color: 'rgba(255, 255, 255, 0.5)' }, children: config.domain?.replace(/^https?:\/\//, '') || '' } },
        ].filter(Boolean) } },
      ],
    },
  };
};

/**
 * Template registry
 */
const templates: Record<string, OgTemplateRenderer> = {
  website: websiteTemplate,
  tool: toolTemplate,
  article: articleTemplate,
  faq: faqTemplate,
  howto: howtoTemplate,
  product: productTemplate,
  event: eventTemplate,
  recipe: recipeTemplate,
  video: videoTemplate,
  job: jobTemplate,
  review: reviewTemplate,
};

/**
 * Get template by type
 */
export function getTemplate(type: string): OgTemplateRenderer {
  return templates[type] || templates.website;
}

/**
 * Register custom template
 */
export function registerTemplate(type: string, template: OgTemplateRenderer): void {
  templates[type] = template;
}

export { websiteTemplate, toolTemplate, articleTemplate, faqTemplate, howtoTemplate, productTemplate, eventTemplate, recipeTemplate, videoTemplate, jobTemplate, reviewTemplate };
