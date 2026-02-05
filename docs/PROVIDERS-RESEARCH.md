# Image Generation Providers Research

This document contains API research for adding new providers to the image-gen-mcp project.

---

## 1. Together.ai

### Overview
Together.ai offers a unified API for various image generation models including FLUX, Stable Diffusion, and others. They provide both free tier access and paid options with competitive pricing.

### API Endpoint
```
POST https://api.together.xyz/v1/images/generations
```

### Authentication
- **Method**: Bearer Token
- **Header**: `Authorization: Bearer <TOGETHER_API_KEY>`
- **Environment Variable**: `TOGETHER_API_KEY`

New accounts receive free credits upon registration.

### Available Models

| Model ID | Price (per MP) | Default Steps | Notes |
|----------|----------------|---------------|-------|
| `black-forest-labs/FLUX.1-schnell-Free` | Free | 4 | Free tier, unlimited access |
| `black-forest-labs/FLUX.1-schnell` | $0.0027 | 4 | Fast, high quality |
| `black-forest-labs/FLUX.1-dev` | $0.025 | 28 | Development model |
| `black-forest-labs/FLUX.1.1-pro` | $0.04 | - | 6x faster than FLUX.1 [pro] |
| `black-forest-labs/FLUX.1-Kontext-dev` | $0.025 | 28 | Context-aware generation |
| `black-forest-labs/FLUX.1-Kontext-pro` | $0.04 | 28 | Premium context model |
| `black-forest-labs/FLUX.1-Kontext-max` | $0.08 | 28 | Maximum quality |
| `stabilityai/stable-diffusion-3-medium` | $0.0019 | - | Stable Diffusion 3 |
| `stabilityai/stable-diffusion-xl-base-1.0` | $0.0019 | - | SDXL base |
| `Qwen/Qwen-Image` | $0.0058 | - | Qwen image model |

**Pricing Note**: Prices are per megapixel (MP). A 1024x1024 image = ~1.05 MP. Additional costs apply when exceeding default steps.

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Text description of desired image |
| `model` | string | Yes | - | Model identifier |
| `steps` | integer | No | 20 | Number of generation steps |
| `n` | integer | No | 1 | Number of images to generate |
| `width` | integer | No | 1024 | Image width in pixels |
| `height` | integer | No | 1024 | Image height in pixels |
| `seed` | integer | No | random | Seed for reproducibility |
| `guidance_scale` | number | No | 3.5 | Prompt adherence (1-5 creative, 8-10 faithful) |
| `negative_prompt` | string | No | - | What to exclude from image |
| `response_format` | string | No | url | `base64` or `url` |
| `output_format` | string | No | jpeg | `jpeg` or `png` |
| `image_url` | string | No | - | Reference image URL (for img2img) |
| `image_loras` | array | No | - | LoRA objects with `path` and `scale` |

### Response Format

```json
{
  "id": "img-abc123",
  "model": "black-forest-labs/FLUX.1-schnell",
  "object": "list",
  "data": [
    {
      "index": 0,
      "type": "url",
      "url": "https://api.together.xyz/imgproxy/..."
    }
  ]
}
```

When `response_format` is `base64`:
```json
{
  "id": "img-abc123",
  "model": "black-forest-labs/FLUX.1-schnell",
  "object": "list",
  "data": [
    {
      "index": 0,
      "type": "b64_json",
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA..."
    }
  ]
}
```

### Code Examples

#### cURL
```bash
curl -X POST "https://api.together.xyz/v1/images/generations" \
  -H "Authorization: Bearer $TOGETHER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "black-forest-labs/FLUX.1-schnell",
    "prompt": "A serene lake surrounded by mountains at sunset",
    "steps": 4,
    "n": 1,
    "width": 1024,
    "height": 1024,
    "response_format": "url"
  }'
```

#### TypeScript
```typescript
interface TogetherImageRequest {
  model: string;
  prompt: string;
  steps?: number;
  n?: number;
  width?: number;
  height?: number;
  seed?: number;
  guidance_scale?: number;
  negative_prompt?: string;
  response_format?: 'url' | 'base64';
  output_format?: 'jpeg' | 'png';
}

interface TogetherImageResponse {
  id: string;
  model: string;
  object: string;
  data: Array<{
    index: number;
    type: 'url' | 'b64_json';
    url?: string;
    b64_json?: string;
  }>;
}

async function generateImage(
  prompt: string,
  options: Partial<TogetherImageRequest> = {}
): Promise<TogetherImageResponse> {
  const response = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt,
      steps: 4,
      n: 1,
      width: 1024,
      height: 1024,
      response_format: 'url',
      ...options,
    }),
  });

  if (!response.ok) {
    throw new Error(`Together API error: ${response.status}`);
  }

  return response.json();
}
```

#### Python
```python
import os
import requests

def generate_image(prompt: str, model: str = "black-forest-labs/FLUX.1-schnell"):
    response = requests.post(
        "https://api.together.xyz/v1/images/generations",
        headers={
            "Authorization": f"Bearer {os.environ['TOGETHER_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "prompt": prompt,
            "steps": 4,
            "n": 1,
            "width": 1024,
            "height": 1024,
            "response_format": "url",
        },
    )
    response.raise_for_status()
    return response.json()
```

### References
- [Together.ai Pricing](https://www.together.ai/pricing)
- [Create Image API Docs](https://docs.together.ai/reference/post-images-generations)
- [FLUX Models on Together.ai](https://www.together.ai/blog/flux-api-is-now-available-on-together-ai-new-pro-free-access-to-flux-schnell)

---

## 2. HuggingFace Inference API

### Overview
HuggingFace provides both a serverless Inference API and dedicated Inference Endpoints. The serverless API offers access to thousands of models with a generous free tier. Recently rebranded as "Inference Providers," it now routes to multiple backend providers for optimal performance.

### API Endpoints

#### Legacy Serverless API
```
POST https://api-inference.huggingface.co/models/{model_id}
```

#### New Inference Providers (Recommended)
```
# Using InferenceClient - automatically routes to best provider
# Direct HTTP for text-to-image not officially documented for router
```

### Authentication
- **Method**: Bearer Token
- **Header**: `Authorization: Bearer hf_xxxxxxxxx`
- **Token Type**: Fine-grained token with "Make calls to Inference Providers" permission
- **Get Token**: [HuggingFace Token Settings](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained)

### Pricing

| Account Type | Monthly Credits | Pay-as-you-go |
|--------------|-----------------|---------------|
| Free Users | $0.10 | No |
| PRO Users ($9/mo) | $2.00 | Yes |
| Team/Enterprise | $2.00 per seat | Yes |

**Note**: HuggingFace passes through provider costs directly with no markup.

For `hf-inference` provider specifically, you're charged based on compute time x hardware price. Example: A request taking 10 seconds on a GPU at $0.00012/second = $0.0012.

### Rate Limits
- **Free tier**: ~100-200 requests per hour (varies)
- **PRO tier**: Higher limits, pay-as-you-go after credits exhausted

### Available Text-to-Image Models

| Model ID | Provider | Notes |
|----------|----------|-------|
| `black-forest-labs/FLUX.1-dev` | Multiple | Powerful realistic generation |
| `black-forest-labs/FLUX.1-Krea-dev` | Multiple | Enhanced FLUX variant |
| `Qwen/Qwen-Image` | Multiple | Qwen's image model |
| `stabilityai/stable-diffusion-xl-base-1.0` | hf-inference | SDXL base |
| `stabilityai/stable-diffusion-2-1` | hf-inference | SD 2.1 |
| `ByteDance/SDXL-Lightning` | Multiple | Fast SDXL variant |
| `ByteDance/Hyper-SD` | Multiple | Hyper-fast SD |

Browse all: [HuggingFace Text-to-Image Models](https://huggingface.co/models?inference=warm&pipeline_tag=text-to-image&sort=trending)

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputs` | string | Yes | The text prompt |
| `parameters.guidance_scale` | number | No | Higher = closer to prompt (may cause artifacts) |
| `parameters.negative_prompt` | string | No | What NOT to include |
| `parameters.num_inference_steps` | integer | No | More steps = higher quality, slower |
| `parameters.width` | integer | No | Output width in pixels |
| `parameters.height` | integer | No | Output height in pixels |
| `parameters.scheduler` | string | No | Override the scheduler |
| `parameters.seed` | integer | No | For reproducibility |

### Response Format
**Important**: The API returns raw binary image data (not JSON).

- Content-Type: `image/png` or `image/jpeg`
- Body: Raw image bytes

### Code Examples

#### cURL
```bash
# Returns binary image data - save directly to file
curl https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev \
  -X POST \
  -H "Authorization: Bearer $HF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": "A serene lake surrounded by mountains at sunset",
    "parameters": {
      "guidance_scale": 7.5,
      "num_inference_steps": 30
    }
  }' \
  --output generated_image.png
```

#### TypeScript (using InferenceClient - Recommended)
```typescript
import { InferenceClient } from '@huggingface/inference';

const client = new InferenceClient(process.env.HF_TOKEN);

async function generateImage(prompt: string): Promise<Blob> {
  const image = await client.textToImage({
    model: 'black-forest-labs/FLUX.1-dev',
    inputs: prompt,
    parameters: {
      guidance_scale: 7.5,
      num_inference_steps: 30,
    },
  });

  return image;
}

// With specific provider
async function generateWithProvider(prompt: string): Promise<Blob> {
  const client = new InferenceClient(process.env.HF_TOKEN);

  const image = await client.textToImage({
    model: 'black-forest-labs/FLUX.1-schnell',
    inputs: prompt,
    provider: 'replicate', // or 'fal-ai', 'together', etc.
  });

  return image;
}
```

#### TypeScript (Direct HTTP)
```typescript
interface HFTextToImageRequest {
  inputs: string;
  parameters?: {
    guidance_scale?: number;
    negative_prompt?: string;
    num_inference_steps?: number;
    width?: number;
    height?: number;
    seed?: number;
  };
}

async function generateImage(
  prompt: string,
  model: string = 'black-forest-labs/FLUX.1-dev'
): Promise<Buffer> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          guidance_scale: 7.5,
          num_inference_steps: 30,
        },
      } as HFTextToImageRequest),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HuggingFace API error: ${response.status} - ${error}`);
  }

  // Response is binary image data
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

#### Python
```python
from huggingface_hub import InferenceClient
import os

client = InferenceClient(token=os.environ["HF_TOKEN"])

# Simple usage
image = client.text_to_image(
    prompt="A serene lake surrounded by mountains at sunset",
    model="black-forest-labs/FLUX.1-dev"
)
image.save("generated_image.png")

# With parameters
image = client.text_to_image(
    prompt="A serene lake surrounded by mountains at sunset",
    model="stabilityai/stable-diffusion-xl-base-1.0",
    guidance_scale=7.5,
    negative_prompt="blurry, low quality",
)
image.save("generated_image.png")
```

### Provider Selection
HuggingFace Inference Providers can route to multiple backends:

```typescript
// Automatic best provider
const image = await client.textToImage({
  model: 'model-id',
  inputs: prompt,
});

// Fastest provider
const image = await client.textToImage({
  model: 'model-id:fastest',
  inputs: prompt,
});

// Cheapest provider
const image = await client.textToImage({
  model: 'model-id:cheapest',
  inputs: prompt,
});

// Specific provider
const image = await client.textToImage({
  model: 'model-id',
  inputs: prompt,
  provider: 'fal-ai', // or 'replicate', 'together', 'hf-inference'
});
```

### References
- [Inference Providers Documentation](https://huggingface.co/docs/inference-providers/en/index)
- [Text-to-Image Task](https://huggingface.co/docs/inference-providers/en/tasks/text-to-image)
- [Pricing and Billing](https://huggingface.co/docs/inference-providers/en/pricing)
- [HuggingFace Hub Python Client](https://huggingface.co/docs/huggingface_hub/en/guides/inference)

---

## 3. BentoCloud

### Overview
BentoCloud is a deployment platform for ML models, not a hosted API service with pre-deployed models. Unlike Together.ai or HuggingFace, BentoCloud is designed for deploying your own models or open-source models that you package yourself.

### Key Distinction
- **Together.ai/HuggingFace**: Pre-hosted models, pay per request
- **BentoCloud**: You deploy models, pay for compute time

### Deployment Options

1. **BentoCloud Managed**: Deploy to BentoML's infrastructure
2. **BYOC (Bring Your Own Cloud)**: Deploy to your AWS/GCP/Azure account
3. **Self-Hosted**: Use BentoML locally or on your own servers

### Available Image Models for Deployment

BentoML has examples for deploying these models:

| Model | Repository |
|-------|------------|
| Stable Diffusion XL | bentoml/sdxl-turbo |
| Stable Diffusion 3 | bentoml/stable-diffusion-3 |
| ControlNet | bentoml/controlnet |
| LCM LoRAs | bentoml/lcm-loras |

**GLM-Image, Qwen-Image, Z-Image-Turbo**: These are available as open-source models on HuggingFace but do not have pre-built BentoCloud deployments. You would need to:
1. Create a BentoML service wrapping the model
2. Deploy to BentoCloud
3. Pay for GPU compute time

### Pricing Model

BentoCloud uses compute-based pricing:

| GPU Type | Approximate Cost |
|----------|------------------|
| NVIDIA T4 | ~$0.50/hour |
| NVIDIA L4 | ~$0.80/hour |
| NVIDIA A100 | ~$2-3/hour |

- Billed per second of active compute
- Deployments scaled to zero incur no cost
- New users receive $10 in free credits

### When to Use BentoCloud

**Good fit if:**
- You need custom model configurations
- You want to deploy fine-tuned models
- You need guaranteed SLAs and dedicated resources
- You're doing high-volume inference (cost savings at scale)

**Not a fit if:**
- You want simple API access to pre-hosted models
- You don't want to manage deployments
- You need quick prototyping with various models

### Example: Deploying a Custom Image Model

```python
# service.py
import bentoml
from PIL import Image

@bentoml.service(
    resources={"gpu": 1, "gpu_type": "nvidia-l4"},
    traffic={"timeout": 300},
)
class ImageGenerationService:
    def __init__(self):
        import torch
        from diffusers import StableDiffusionXLPipeline

        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=torch.float16,
        ).to("cuda")

    @bentoml.api
    def generate(self, prompt: str, steps: int = 30) -> Image.Image:
        image = self.pipe(prompt, num_inference_steps=steps).images[0]
        return image
```

Deploy:
```bash
bentoml deploy .
```

### Recommendation for image-gen-mcp

**Do not add BentoCloud as a provider** for this project because:
1. It requires deployment setup, not simple API calls
2. No pre-hosted image generation APIs available
3. Doesn't fit the provider model of Together.ai/HuggingFace

**Alternative**: If you need GLM-Image or similar models, access them through:
- HuggingFace Inference API (if available)
- Together.ai (Qwen-Image is available)
- Replicate (many image models hosted)

### References
- [BentoML Documentation](https://docs.bentoml.com/)
- [BentoCloud Pricing](https://www.bentoml.com/pricing)
- [BentoML GitHub](https://github.com/bentoml/BentoML)
- [Serverless vs Self-Hosted Inference](https://bentoml.com/llm/llm-inference-basics/serverless-vs-self-hosted-llm-inference)

---

## Summary Comparison

| Feature | Together.ai | HuggingFace | BentoCloud |
|---------|-------------|-------------|------------|
| **Type** | Hosted API | Hosted API + Providers | Deployment Platform |
| **Auth** | Bearer Token | Bearer Token | N/A (deployment) |
| **Free Tier** | Yes (FLUX.1-schnell-Free) | $0.10/month | $10 credits |
| **Response Format** | JSON (URL or base64) | Binary image | N/A |
| **Models** | ~15 image models | Thousands | Deploy your own |
| **Best For** | Production use, FLUX | Variety, experimentation | Custom deployments |
| **Integration Effort** | Low | Low | High |

## Recommended Provider Priority for image-gen-mcp

1. **Together.ai** - Best combination of pricing, model selection, and ease of integration
2. **HuggingFace** - Good fallback with wide model selection and free tier
3. **Skip BentoCloud** - Not suitable for this use case

---

## Implementation Notes for image-gen-mcp

### Together.ai Provider Structure

```typescript
// src/providers/together.ts
import { ImageProvider, GenerateOptions, GenerateResult } from './base';

export class TogetherProvider implements ImageProvider {
  readonly name = 'together';
  private apiKey: string;
  private baseUrl = 'https://api.together.xyz/v1/images/generations';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { width, height } = this.getResolution(options.aspect_ratio);

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'black-forest-labs/FLUX.1-schnell',
        prompt: options.prompt,
        negative_prompt: options.negative_prompt,
        n: options.count,
        width,
        height,
        response_format: 'url',
      }),
    });

    const data = await response.json();

    return {
      images: data.data.map((img: any, i: number) => ({
        index: i,
        url: img.url,
        width,
        height,
      })),
      model_used: data.model,
      cost: this.calculateCost(width, height, options.count, data.model),
      provider: this.name,
    };
  }

  // ... other methods
}
```

### HuggingFace Provider Structure

```typescript
// src/providers/huggingface.ts
import { ImageProvider, GenerateOptions, GenerateResult } from './base';

export class HuggingFaceProvider implements ImageProvider {
  readonly name = 'huggingface';
  private apiKey: string;
  private baseUrl = 'https://api-inference.huggingface.co/models';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model || 'black-forest-labs/FLUX.1-dev';
    const { width, height } = this.getResolution(options.aspect_ratio);

    // HuggingFace returns binary - need to upload to storage
    // Generate one at a time since no batch support in standard API
    const images = [];

    for (let i = 0; i < options.count; i++) {
      const response = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: options.prompt,
          parameters: {
            negative_prompt: options.negative_prompt,
            width,
            height,
            seed: Math.floor(Math.random() * 1000000) + i,
          },
        }),
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      // Store buffer temporarily and get URL
      const url = await this.storeTemporary(buffer);

      images.push({
        index: i,
        url,
        width,
        height,
      });
    }

    return {
      images,
      model_used: model,
      cost: 0, // Hard to calculate with HF's compute-based pricing
      provider: this.name,
    };
  }

  // ... other methods
}
```

### Environment Variables

```bash
# .env
TOGETHER_API_KEY=your_together_api_key
HF_TOKEN=hf_your_huggingface_token
```
