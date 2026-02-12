import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { generateImages } from './tools/generate.js';
import { selectImage } from './tools/select.js';
import { listGenerations } from './tools/list.js';
import { getCosts } from './tools/costs.js';
import { cleanupPreviews } from './tools/cleanup.js';
import { configureTool, configureToolDefinition } from './tools/configure.js';
import { loadConfig } from './config/loader.js';
import { createProviderFromConfig } from './providers/index.js';
import { createStorageFromConfig } from './storage/index.js';
import { GenerationStore } from './db/generations.js';

const server = new Server(
  {
    name: 'image-gen-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Load configuration and initialize services
const config = await loadConfig();
const provider = createProviderFromConfig(config.provider);
const storage = createStorageFromConfig(config.storage);
const db = new GenerationStore(config.database.path);

// Tool definitions
const tools = [
  {
    name: 'generate_images',
    description: `Generate images with AI. Returns local preview file paths.

IMPORTANT: After calling this tool, present the preview file paths to the user so they can view the images. Do NOT describe or narrate what the images might look like — you cannot see them. Simply list the previews with their index numbers and ask the user which one to select.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'The image generation prompt',
        },
        negative_prompt: {
          type: 'string',
          description: 'What to avoid in the image',
        },
        count: {
          type: 'number',
          description: 'Number of variations to generate (default: 3)',
          default: 3,
        },
        aspect_ratio: {
          type: 'string',
          description: 'Aspect ratio: "1:1", "16:9", "9:16", "4:3"',
          default: '16:9',
        },
        context: {
          type: 'string',
          description: 'Context for the generation (e.g., "blog header for article about X")',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'select_image',
    description: `Select an image from a generation and upload to permanent storage.

IMPORTANT: After upload, present the permanent URL and markdown to the user. Do NOT describe the image.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        generation_id: {
          type: 'string',
          description: 'The generation ID from generate_images',
        },
        index: {
          type: 'number',
          description: 'Which image to select (0-indexed)',
        },
        filename: {
          type: 'string',
          description: 'Optional custom filename',
        },
        cleanup_others: {
          type: 'boolean',
          description: 'Delete unselected preview images (default: true)',
          default: true,
        },
      },
      required: ['generation_id', 'index'],
    },
  },
  {
    name: 'list_generations',
    description: 'List recent image generations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of generations to return (default: 10)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_costs',
    description: 'Get cost tracking information.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          description: 'Time period: "day", "week", "month", "all"',
          default: 'month',
        },
      },
    },
  },
  {
    name: 'cleanup_previews',
    description: 'Clean up old preview images from R2 storage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        older_than_days: {
          type: 'number',
          description: 'Delete previews older than this many days (default: 7)',
          default: 7,
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, only list what would be deleted without actually deleting',
          default: false,
        },
      },
    },
  },
  configureToolDefinition,
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'generate_images':
      return generateImages(args as any, { provider, storage, db, config });

    case 'select_image':
      return selectImage(args as any, { storage, db, config });

    case 'list_generations':
      return listGenerations(args as any, { db });

    case 'get_costs':
      return getCosts(args as any, { db, config });

    case 'cleanup_previews':
      return cleanupPreviews(args as any, { storage, db, config });

    case 'configure':
      const result = await configureTool(args as any);
      return { content: [{ type: 'text', text: result }] };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Image Gen MCP server running on stdio');
}

main().catch(console.error);
