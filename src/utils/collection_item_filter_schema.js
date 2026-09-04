/**
 * Safe CollectionItem filter options exposed by retrieval tool actions.
 * Smart Sources and Smart Blocks also support the frontmatter extension.
 */
export const collection_item_filter_schema = {
  type: 'object',
  description: 'Optional key filters for candidate result items. String comparisons are case-sensitive. Smart Sources and Smart Blocks also support frontmatter filters.',
  properties: {
    exclude_key: {
      type: 'string',
      minLength: 1,
      description: 'Exclude the item with this exact key.',
    },
    exclude_keys: {
      type: 'array',
      description: 'Exclude items with any of these exact keys.',
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    exclude_key_starts_with: {
      type: 'string',
      minLength: 1,
      description: 'Exclude items whose keys start with this value.',
    },
    exclude_key_starts_with_any: {
      type: 'array',
      description: 'Exclude items whose keys start with any of these values.',
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    exclude_key_includes: {
      type: 'string',
      minLength: 1,
      description: 'Exclude items whose keys contain this value.',
    },
    exclude_key_includes_any: {
      type: 'array',
      description: 'Exclude items whose keys contain any of these values.',
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    exclude_key_ends_with: {
      type: 'string',
      minLength: 1,
      description: 'Exclude items whose keys end with this value.',
    },
    exclude_key_ends_with_any: {
      type: 'array',
      description: 'Exclude items whose keys end with any of these values.',
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    key_ends_with: {
      type: 'string',
      minLength: 1,
      description: 'Include only items whose keys end with this value.',
    },
    key_starts_with: {
      type: 'string',
      minLength: 1,
      description: 'Include only items whose keys start with this value.',
    },
    key_starts_with_any: {
      type: 'array',
      description: 'Include only items whose keys start with any of these values.',
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    key_includes: {
      type: 'string',
      minLength: 1,
      description: 'Include only items whose keys contain this value.',
    },
    key_includes_any: {
      type: 'array',
      description: 'Include only items whose keys contain any of these values.',
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    frontmatter: {
      type: 'object',
      description: 'Filter Smart Sources by their frontmatter, or Smart Blocks by their source frontmatter. Use lowercase key and value strings.',
      properties: {
        include: {
          type: 'array',
          description: 'Include only items matching at least one entry.',
          items: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                minLength: 1,
                description: 'Lowercase frontmatter key to match.',
              },
              value: {
                type: ['string', 'null'],
                description: 'Optional lowercase exact value. Omit or use null to match any value for the key.',
              },
            },
            required: ['key'],
            additionalProperties: false,
          },
        },
        exclude: {
          type: 'array',
          description: 'Exclude items matching any entry.',
          items: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                minLength: 1,
                description: 'Lowercase frontmatter key to match.',
              },
              value: {
                type: ['string', 'null'],
                description: 'Optional lowercase exact value. Omit or use null to match any value for the key.',
              },
            },
            required: ['key'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};
