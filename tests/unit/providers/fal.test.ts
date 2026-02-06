import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { FalProvider } from '../../../src/providers/fal.js';
import type { GenerateOptions, ProviderConfig } from '../../../src/providers/base.js';

// Mock the @fal-ai/client module
vi.mock('@fal-ai/client', () => {
  return {
    fal: {
      config: vi.fn(),
      subscribe: vi.fn(),
    },
  };
});

// Import after mocking
import { fal } from '@fal-ai/client';

describe('FalProvider', () => {
  let provider: FalProvider;
  const mockConfig: ProviderConfig = {
    name: 'fal',
    api_key: 'test-api-key',
    default_model: 'fal-ai/flux/schnell',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new FalProvider(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(provider.name).toBe('fal');
      expect(fal.config).toHaveBeenCalledWith({
        credentials: 'test-api-key',
      });
    });

    it('should use default model when not specified', () => {
      const configWithoutModel: ProviderConfig = {
        name: 'fal',
        api_key: 'test-api-key',
        default_model: '',
      };

      const newProvider = new FalProvider(configWithoutModel);
      expect(newProvider.name).toBe('fal');
    });
  });

  describe('generate', () => {
    const baseOptions: GenerateOptions = {
      prompt: 'A beautiful sunset over mountains',
      count: 1,
      aspect_ratio: '16:9',
    };

    describe('successful image generation', () => {
      it('should generate a single image successfully', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
              width: 1344,
              height: 768,
              seed: 12345,
            }],
          },
        });

        const result = await provider.generate(baseOptions);

        expect(result.images).toHaveLength(1);
        expect(result.images[0].index).toBe(0);
        expect(result.images[0].url).toBe('https://fal.run/files/image1.png');
        expect(result.images[0].width).toBe(1344);
        expect(result.images[0].height).toBe(768);
        expect(result.images[0].seed).toBe(12345);
        expect(result.model_used).toBe('fal-ai/flux/schnell');
        expect(result.provider).toBe('fal');
        expect(result.cost).toBe(0.003);
      });

      it('should generate multiple images', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [
              { url: 'https://fal.run/files/image1.png', width: 1024, height: 1024, seed: 11111 },
              { url: 'https://fal.run/files/image2.png', width: 1024, height: 1024, seed: 22222 },
              { url: 'https://fal.run/files/image3.png', width: 1024, height: 1024, seed: 33333 },
            ],
          },
        });

        const options = { ...baseOptions, count: 3 };
        const result = await provider.generate(options);

        expect(result.images).toHaveLength(3);
        expect(fal.subscribe).toHaveBeenCalledTimes(1);
        expect(result.images[0].index).toBe(0);
        expect(result.images[1].index).toBe(1);
        expect(result.images[2].index).toBe(2);
        expect(result.cost).toBe(0.003 * 3);
      });

      it('should handle custom model', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
              width: 1024,
              height: 1024,
            }],
          },
        });

        const options = { ...baseOptions, model: 'fal-ai/flux/dev' };
        const result = await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', expect.any(Object));
        expect(result.model_used).toBe('fal-ai/flux/dev');
        expect(result.cost).toBe(0.025);
      });

      it('should handle flux-pro model', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
              width: 1024,
              height: 1024,
            }],
          },
        });

        const options = { ...baseOptions, model: 'fal-ai/flux-pro' };
        const result = await provider.generate(options);

        expect(result.model_used).toBe('fal-ai/flux-pro');
        expect(result.cost).toBe(0.05);
      });
    });

    describe('input parameter mapping', () => {
      it('should include negative prompt in request', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
              width: 1024,
              height: 1024,
            }],
          },
        });

        const options = {
          ...baseOptions,
          negative_prompt: 'blurry, low quality, watermark'
        };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              negative_prompt: 'blurry, low quality, watermark',
            }),
          })
        );
      });

      it('should map 1:1 aspect ratio to correct dimensions', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        const options = { ...baseOptions, aspect_ratio: '1:1' };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              image_size: { width: 1024, height: 1024 },
            }),
          })
        );
      });

      it('should map 16:9 aspect ratio to correct dimensions', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        const options = { ...baseOptions, aspect_ratio: '16:9' };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              image_size: { width: 1344, height: 768 },
            }),
          })
        );
      });

      it('should map 9:16 aspect ratio to correct dimensions', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        const options = { ...baseOptions, aspect_ratio: '9:16' };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              image_size: { width: 768, height: 1344 },
            }),
          })
        );
      });

      it('should map 4:3 aspect ratio to correct dimensions', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        const options = { ...baseOptions, aspect_ratio: '4:3' };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              image_size: { width: 1152, height: 896 },
            }),
          })
        );
      });

      it('should map 3:4 aspect ratio to correct dimensions', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        const options = { ...baseOptions, aspect_ratio: '3:4' };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              image_size: { width: 896, height: 1152 },
            }),
          })
        );
      });

      it('should fallback to 16:9 for unsupported aspect ratio', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        const options = { ...baseOptions, aspect_ratio: '7:5' };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              image_size: { width: 1344, height: 768 },
            }),
          })
        );
      });

      it('should pass correct num_images parameter', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [
              { url: 'https://fal.run/files/image1.png' },
              { url: 'https://fal.run/files/image2.png' },
              { url: 'https://fal.run/files/image3.png' },
            ],
          },
        });

        const options = { ...baseOptions, count: 3 };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              num_images: 3,
            }),
          })
        );
      });

      it('should use schnell-specific inference settings', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        await provider.generate(baseOptions);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              num_inference_steps: 4,
              guidance_scale: 1,
            }),
          })
        );
      });

      it('should use non-schnell inference settings for dev model', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        const options = { ...baseOptions, model: 'fal-ai/flux/dev' };
        await provider.generate(options);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/dev',
          expect.objectContaining({
            input: expect.objectContaining({
              num_inference_steps: 28,
              guidance_scale: 3.5,
            }),
          })
        );
      });

      it('should enable safety checker', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
            }],
          },
        });

        await provider.generate(baseOptions);

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/flux/schnell',
          expect.objectContaining({
            input: expect.objectContaining({
              enable_safety_checker: true,
            }),
          })
        );
      });
    });

    describe('response parsing', () => {
      it('should extract image URLs from response', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [
              { url: 'https://fal.run/files/unique1.png', width: 1024, height: 1024 },
              { url: 'https://fal.run/files/unique2.png', width: 1024, height: 1024 },
            ],
          },
        });

        const options = { ...baseOptions, count: 2 };
        const result = await provider.generate(options);

        expect(result.images[0].url).toBe('https://fal.run/files/unique1.png');
        expect(result.images[1].url).toBe('https://fal.run/files/unique2.png');
      });

      it('should extract seed from response when available', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
              width: 1024,
              height: 1024,
              seed: 98765,
            }],
          },
        });

        const result = await provider.generate(baseOptions);

        expect(result.images[0].seed).toBe(98765);
      });

      it('should use fallback dimensions when not in response', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
              // width and height not provided
            }],
          },
        });

        const options = { ...baseOptions, aspect_ratio: '1:1' };
        const result = await provider.generate(options);

        expect(result.images[0].width).toBe(1024);
        expect(result.images[0].height).toBe(1024);
      });

      it('should use response dimensions when provided', async () => {
        (fal.subscribe as Mock).mockResolvedValue({
          data: {
            images: [{
              url: 'https://fal.run/files/image1.png',
              width: 2048,
              height: 2048,
            }],
          },
        });

        const result = await provider.generate(baseOptions);

        expect(result.images[0].width).toBe(2048);
        expect(result.images[0].height).toBe(2048);
      });
    });

    describe('API error handling', () => {
      it('should propagate rate limit errors', async () => {
        const rateLimitError = new Error('Rate limit exceeded');
        (rateLimitError as any).status = 429;
        (rateLimitError as any).code = 'RATE_LIMIT_EXCEEDED';
        (fal.subscribe as Mock).mockRejectedValue(rateLimitError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Rate limit exceeded');
      });

      it('should propagate authentication errors', async () => {
        const authError = new Error('Invalid API key');
        (authError as any).status = 401;
        (fal.subscribe as Mock).mockRejectedValue(authError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Invalid API key');
      });

      it('should propagate authorization errors', async () => {
        const forbiddenError = new Error('Insufficient credits');
        (forbiddenError as any).status = 403;
        (fal.subscribe as Mock).mockRejectedValue(forbiddenError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Insufficient credits');
      });

      it('should propagate server errors', async () => {
        const serverError = new Error('Internal server error');
        (serverError as any).status = 500;
        (fal.subscribe as Mock).mockRejectedValue(serverError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Internal server error');
      });

      it('should propagate service unavailable errors', async () => {
        const serviceError = new Error('Service temporarily unavailable');
        (serviceError as any).status = 503;
        (fal.subscribe as Mock).mockRejectedValue(serviceError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Service temporarily unavailable');
      });

      it('should handle model not found errors', async () => {
        const notFoundError = new Error('Model not found: invalid-model');
        (notFoundError as any).status = 404;
        (fal.subscribe as Mock).mockRejectedValue(notFoundError);

        await expect(provider.generate({ ...baseOptions, model: 'invalid-model' }))
          .rejects.toThrow('Model not found: invalid-model');
      });

      it('should handle bad request errors', async () => {
        const badRequestError = new Error('Invalid prompt');
        (badRequestError as any).status = 400;
        (fal.subscribe as Mock).mockRejectedValue(badRequestError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Invalid prompt');
      });

      it('should handle network errors', async () => {
        (fal.subscribe as Mock).mockRejectedValue(new Error('Network error'));

        await expect(provider.generate(baseOptions)).rejects.toThrow('Network error');
      });

      it('should handle timeout errors', async () => {
        const timeoutError = new Error('Request timeout');
        (timeoutError as any).code = 'ETIMEDOUT';
        (fal.subscribe as Mock).mockRejectedValue(timeoutError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Request timeout');
      });
    });
  });

  describe('downloadImage', () => {
    it('should download image from URL', async () => {
      const mockImageData = Buffer.from('fake-image-binary-data');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageData),
      });
      global.fetch = mockFetch;

      const buffer = await provider.downloadImage('https://fal.run/files/image.png');

      expect(mockFetch).toHaveBeenCalledWith('https://fal.run/files/image.png');
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should throw error when download fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
      });
      global.fetch = mockFetch;

      await expect(provider.downloadImage('https://fal.run/files/missing.png'))
        .rejects.toThrow('Failed to download image: Forbidden');
    });

    it('should throw error when URL is not found', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });
      global.fetch = mockFetch;

      await expect(provider.downloadImage('https://fal.run/files/nonexistent.png'))
        .rejects.toThrow('Failed to download image: Not Found');
    });

    it('should handle network fetch errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      await expect(provider.downloadImage('https://fal.run/files/image.png'))
        .rejects.toThrow('Network failure');
    });
  });

  describe('getCostPerImage', () => {
    it('should return correct cost for fal-ai/flux/schnell', () => {
      const cost = provider.getCostPerImage('fal-ai/flux/schnell');
      expect(cost).toBe(0.003);
    });

    it('should return correct cost for fal-ai/flux/dev', () => {
      const cost = provider.getCostPerImage('fal-ai/flux/dev');
      expect(cost).toBe(0.025);
    });

    it('should return correct cost for fal-ai/flux-pro', () => {
      const cost = provider.getCostPerImage('fal-ai/flux-pro');
      expect(cost).toBe(0.05);
    });

    it('should return correct cost for fal-ai/stable-diffusion-v3-medium', () => {
      const cost = provider.getCostPerImage('fal-ai/stable-diffusion-v3-medium');
      expect(cost).toBe(0.035);
    });

    it('should return default cost for unknown model', () => {
      const cost = provider.getCostPerImage('unknown-model');
      expect(cost).toBe(0.01);
    });
  });

  describe('listModels', () => {
    it('should return list of available models', () => {
      const models = provider.listModels();

      expect(models).toContain('fal-ai/flux/schnell');
      expect(models).toContain('fal-ai/flux/dev');
      expect(models).toContain('fal-ai/flux-pro');
      expect(models).toContain('fal-ai/stable-diffusion-v3-medium');
      expect(models).toHaveLength(4);
    });
  });

  describe('cost calculation', () => {
    const baseOptions: GenerateOptions = {
      prompt: 'A beautiful sunset over mountains',
      count: 1,
      aspect_ratio: '16:9',
    };

    it('should calculate total cost correctly for single image', async () => {
      (fal.subscribe as Mock).mockResolvedValue({
        data: {
          images: [{
            url: 'https://fal.run/files/image1.png',
          }],
        },
      });

      const result = await provider.generate({ ...baseOptions, count: 1 });

      expect(result.cost).toBe(0.003);
    });

    it('should calculate total cost correctly for multiple images', async () => {
      (fal.subscribe as Mock).mockResolvedValue({
        data: {
          images: [
            { url: 'https://fal.run/files/image1.png' },
            { url: 'https://fal.run/files/image2.png' },
            { url: 'https://fal.run/files/image3.png' },
            { url: 'https://fal.run/files/image4.png' },
            { url: 'https://fal.run/files/image5.png' },
          ],
        },
      });

      const result = await provider.generate({ ...baseOptions, count: 5 });

      expect(result.cost).toBeCloseTo(0.003 * 5, 5);
    });

    it('should use model-specific cost for dev model', async () => {
      (fal.subscribe as Mock).mockResolvedValue({
        data: {
          images: [
            { url: 'https://fal.run/files/image1.png' },
            { url: 'https://fal.run/files/image2.png' },
          ],
        },
      });

      const result = await provider.generate({
        ...baseOptions,
        model: 'fal-ai/flux/dev',
        count: 2,
      });

      expect(result.cost).toBe(0.025 * 2);
    });

    it('should use model-specific cost for flux-pro model', async () => {
      (fal.subscribe as Mock).mockResolvedValue({
        data: {
          images: [
            { url: 'https://fal.run/files/image1.png' },
            { url: 'https://fal.run/files/image2.png' },
            { url: 'https://fal.run/files/image3.png' },
          ],
        },
      });

      const result = await provider.generate({
        ...baseOptions,
        model: 'fal-ai/flux-pro',
        count: 3,
      });

      expect(result.cost).toBe(0.05 * 3);
    });

    it('should use model-specific cost for stable-diffusion model', async () => {
      (fal.subscribe as Mock).mockResolvedValue({
        data: {
          images: [{
            url: 'https://fal.run/files/image1.png',
          }],
        },
      });

      const result = await provider.generate({
        ...baseOptions,
        model: 'fal-ai/stable-diffusion-v3-medium',
        count: 1,
      });

      expect(result.cost).toBe(0.035);
    });
  });
});
