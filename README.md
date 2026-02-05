# Image Generation MCP Server

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)

A Model Context Protocol (MCP) server for AI image generation. Generate images from text prompts directly in Claude Code or any MCP-compatible client, with automatic cloud storage upload and cost tracking.

## Why This Exists

Content creators need images. Getting them usually means:
1. Opening a separate tool (Midjourney, DALL-E, etc.)
2. Generating variations
3. Downloading the one you want
4. Uploading to your hosting
5. Getting the URL back into your workflow

**This MCP server reduces that to a single conversation:**

```
You: Generate an image of a serene mountain landscape at dawn

Claude: [generates 3 variations, shows previews]
        Which one works best?

You: The second one

Claude: Done! https://images.yourdomain.com/2026/02/mountain-dawn.jpg
```

## Features

- **Multi-provider support**: Gemini (free tier!), Fal.ai, Replicate
- **Cloud storage**: Cloudflare R2 (free egress), Backblaze B2, local storage
- **Cost tracking**: Per-generation costs, monthly budgets, alerts
- **Generation history**: SQLite-backed, queryable via MCP tools
- **Preview → Select workflow**: Generate variations, pick the best, auto-upload

## Quick Start

### 1. Install

```bash
# Clone the repo
git clone https://github.com/maheshcr/image-gen-mcp.git
cd image-gen-mcp

# Install dependencies
npm install

# Build
npm run build
```

### 2. Configure (Interactive Wizard)

```bash
npm run setup
```

The wizard will guide you through:
- Choosing an image provider (with links to get API keys)
- Configuring storage (local or cloud)
- Optional budget limits

```
╭─────────────────────────────────────────────────────────╮
│  Image Generation MCP - Setup Wizard                    │
╰─────────────────────────────────────────────────────────╯

━━━ Step 1/3: Image Provider ━━━
Choose your image generation provider:
────────────────────────────────────────
  1. Gemini (https://ai.google.dev/)
  2. Fal.ai (https://fal.ai/)
  3. Together.ai (https://together.ai/)
  4. Replicate (https://replicate.com/)
  5. HuggingFace (https://huggingface.co/inference-api)

Select [1-5]: 1

Get your API key at: https://ai.google.dev/
Enter your Gemini API key: ********
```

<details>
<summary>Manual Configuration (Alternative)</summary>

If you prefer manual setup:

```bash
mkdir -p ~/.config/image-gen-mcp
cp config.example.yaml ~/.config/image-gen-mcp/config.yaml
# Edit config.yaml with your settings
```

See [config.example.yaml](config.example.yaml) for all options.

</details>

### 3. Set Environment Variables (if not using wizard)

```bash
# For Gemini (recommended - has free tier)
export GOOGLE_API_KEY="your-api-key"

# For Fal.ai
export FAL_API_KEY="your-api-key"

# For Cloudflare R2
export R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
export R2_ACCESS_KEY="your-access-key"
export R2_SECRET_KEY="your-secret-key"
```

### 4. Add to Claude Code

```bash
claude mcp add image-gen "node /path/to/image-gen-mcp/dist/server.js"
```

Or add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": ["/path/to/image-gen-mcp/dist/server.js"]
    }
  }
}
```

### 5. Restart Claude Code

```bash
# Restart to load the new MCP server
claude
```

## MCP Tools

### `generate_images`

Generate images with AI. Returns preview URLs for selection.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | The image generation prompt |
| `negative_prompt` | string | - | What to avoid in the image |
| `count` | number | 3 | Number of variations (1-4) |
| `aspect_ratio` | string | "16:9" | "1:1", "16:9", "9:16", "4:3" |
| `context` | string | - | Context hint (e.g., "blog header") |

**Returns:**
```json
{
  "generation_id": "uuid",
  "images": [
    { "index": 0, "preview_url": "...", "local_path": "..." },
    { "index": 1, "preview_url": "...", "local_path": "..." }
  ],
  "cost": 0.02,
  "model_used": "gemini-2.0-flash-exp"
}
```

### `select_image`

Select an image and upload to permanent storage.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `generation_id` | string | required | From generate_images response |
| `index` | number | required | Which image to select (0-indexed) |
| `filename` | string | auto | Custom filename (optional) |

**Returns:**
```json
{
  "permanent_url": "https://images.yourdomain.com/2026/02/image.jpg",
  "markdown": "![Alt text](https://images.yourdomain.com/2026/02/image.jpg)"
}
```

### `list_generations`

List recent generations.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Number of generations to return |

### `get_costs`

Get cost tracking information.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | "month" | "day", "week", "month", "all" |

**Returns:**
```json
{
  "total": 2.50,
  "generation_count": 45,
  "by_provider": { "gemini": 2.50 },
  "budget_remaining": 7.50
}
```

### `configure`

View or update settings from within Claude Code.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `show` | boolean | Show current configuration |
| `provider` | string | Switch provider: gemini, fal, together, replicate, huggingface |
| `model` | string | Set default model |
| `budget_limit` | number | Set monthly budget in USD |
| `count` | number | Default variations per generation (1-4) |
| `aspect_ratio` | string | Default aspect ratio |

**Examples:**
```
"Show my current config"        → configure()
"Switch to Fal.ai"              → configure({ provider: "fal" })
"Set budget to $20/month"       → configure({ budget_limit: 20 })
"Generate 2 images by default"  → configure({ count: 2 })
```

## Supported Providers

| Provider | Models | Pricing | Links |
|----------|--------|---------|-------|
| **Gemini** | gemini-2.0-flash-exp | Free tier available | [ai.google.dev](https://ai.google.dev/) |
| **Fal.ai** | Flux Schnell, Flux Dev, SDXL | ~$0.01-0.03/image | [fal.ai](https://fal.ai/) |
| **Together.ai** | FLUX.1-schnell (free), FLUX.1-dev | Free - $0.02/image | [together.ai](https://together.ai/) |
| **Replicate** | Flux, SDXL, SD3 | ~$0.01-0.05/image | [replicate.com](https://replicate.com/) |
| **HuggingFace** | FLUX, SDXL, many others | Free tier + pay-as-you-go | [huggingface.co](https://huggingface.co/inference-api) |

## Supported Storage

| Provider | Egress Cost | Links |
|----------|-------------|-------|
| **Cloudflare R2** | Free egress | [developers.cloudflare.com/r2](https://developers.cloudflare.com/r2/) |
| **Backblaze B2** | $0.01/GB | [backblaze.com](https://www.backblaze.com/cloud-storage) |
| **Local** | N/A | For development/testing |

## Configuration Reference

See [config.example.yaml](config.example.yaml) for full configuration options.

### Provider Configuration

```yaml
provider:
  name: gemini           # gemini | fal | replicate
  api_key: ${API_KEY}    # Use env var reference
  default_model: ...     # Provider-specific model ID
  fallback_provider: fal # Optional fallback
```

### Storage Configuration

```yaml
storage:
  name: r2               # r2 | b2 | local
  bucket: my-images      # Bucket name (r2/b2)
  endpoint: ...          # S3-compatible endpoint
  access_key: ...        # S3 access key
  secret_key: ...        # S3 secret key
  public_url_prefix: ... # Public URL for serving images
  path_template: "{year}/{month}/{filename}"
```

### Budget Configuration

```yaml
budget:
  monthly_limit: 10.00   # USD, 0 for unlimited
  alert_threshold: 0.8   # Alert at 80%
  alert_method: log      # log | webhook
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode for development
npm run dev
```

## Project Structure

```
image-gen-mcp/
├── src/
│   ├── server.ts           # MCP server entry point
│   ├── tools/              # MCP tool implementations
│   ├── providers/          # Image generation providers
│   ├── storage/            # Storage backends
│   ├── db/                 # SQLite generation store
│   └── config/             # Configuration loading
├── tests/
├── config.example.yaml
└── package.json
```

## Troubleshooting

### "MCP server not responding"

1. Check the server runs standalone: `node dist/server.js`
2. Verify config path: `~/.config/image-gen-mcp/config.yaml`
3. Check environment variables are set

### "API key invalid"

1. Verify the key is correct
2. Check the env var is exported (not just in .env)
3. For Gemini, ensure the API is enabled in Google Cloud Console

### "Upload failed"

1. Verify R2/B2 credentials
2. Check bucket exists and is accessible
3. Verify `public_url_prefix` matches your R2 custom domain

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT - see [LICENSE](LICENSE)

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- [Fal.ai](https://fal.ai) for fast image generation
- [Cloudflare R2](https://developers.cloudflare.com/r2/) for free egress storage
