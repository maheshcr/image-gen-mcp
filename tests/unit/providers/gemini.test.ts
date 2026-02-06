import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { GeminiProvider } from '../../../src/providers/gemini.js';
import type { GenerateOptions, ProviderConfig } from '../../../src/providers/base.js';

// Mock the @google/genai module
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn(),
      },
    })),
  };
});

// Import after mocking
import { GoogleGenAI } from '@google/genai';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let mockGenerateContent: Mock;
  const mockConfig: ProviderConfig = {
    name: 'gemini',
    api_key: 'test-api-key',
    default_model: 'gemini-2.5-flash-image',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock for generateContent
    mockGenerateContent = vi.fn();
    (GoogleGenAI as Mock).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    provider = new GeminiProvider(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(provider.name).toBe('gemini');
    });

    it('should use default model when not specified', () => {
      const configWithoutModel: ProviderConfig = {
        name: 'gemini',
        api_key: 'test-api-key',
        default_model: '',
      };

      // Re-create provider with new config
      const newProvider = new GeminiProvider(configWithoutModel);
      expect(newProvider.name).toBe('gemini');
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
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/png',
                },
              }],
            },
          }],
        });

        const result = await provider.generate(baseOptions);

        expect(result.images).toHaveLength(1);
        expect(result.images[0].index).toBe(0);
        expect(result.images[0].url).toContain('data:image/png;base64,');
        expect(result.images[0].width).toBe(1344);
        expect(result.images[0].height).toBe(768);
        expect(result.model_used).toBe('gemini-2.5-flash-image');
        expect(result.provider).toBe('gemini');
        expect(result.cost).toBeGreaterThan(0);
      });

      it('should generate multiple images', async () => {
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/png',
                },
              }],
            },
          }],
        });

        const options = { ...baseOptions, count: 3 };
        const result = await provider.generate(options);

        expect(result.images).toHaveLength(3);
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
        expect(result.images[0].index).toBe(0);
        expect(result.images[1].index).toBe(1);
        expect(result.images[2].index).toBe(2);
        expect(result.cost).toBe(0.039 * 3);
      });

      it('should handle custom model', async () => {
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/png',
                },
              }],
            },
          }],
        });

        const options = { ...baseOptions, model: 'gemini-3-pro-image-preview' };
        const result = await provider.generate(options);

        expect(result.model_used).toBe('gemini-3-pro-image-preview');
        expect(result.cost).toBe(0.10);
      });
    });

    describe('input parameter mapping', () => {
      it('should include negative prompt in the request', async () => {
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/png',
                },
              }],
            },
          }],
        });

        const options = {
          ...baseOptions,
          negative_prompt: 'blurry, low quality'
        };
        await provider.generate(options);

        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            contents: expect.stringContaining('Avoid: blurry, low quality'),
          })
        );
      });

      it('should use supported aspect ratio', async () => {
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/png',
                },
              }],
            },
          }],
        });

        const options = { ...baseOptions, aspect_ratio: '1:1' };
        const result = await provider.generate(options);

        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              imageConfig: expect.objectContaining({
                aspectRatio: '1:1',
              }),
            }),
          })
        );
        expect(result.images[0].width).toBe(1024);
        expect(result.images[0].height).toBe(1024);
      });

      it('should fallback to 16:9 for unsupported aspect ratio', async () => {
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/png',
                },
              }],
            },
          }],
        });

        const options = { ...baseOptions, aspect_ratio: '7:5' };
        const result = await provider.generate(options);

        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              imageConfig: expect.objectContaining({
                aspectRatio: '16:9',
              }),
            }),
          })
        );
        expect(result.images[0].width).toBe(1344);
        expect(result.images[0].height).toBe(768);
      });

      it('should map all supported aspect ratios to correct dimensions', async () => {
        const aspectRatios = [
          { ratio: '1:1', width: 1024, height: 1024 },
          { ratio: '2:3', width: 832, height: 1248 },
          { ratio: '3:2', width: 1248, height: 832 },
          { ratio: '3:4', width: 896, height: 1152 },
          { ratio: '4:3', width: 1152, height: 896 },
          { ratio: '4:5', width: 896, height: 1120 },
          { ratio: '5:4', width: 1120, height: 896 },
          { ratio: '9:16', width: 768, height: 1344 },
          { ratio: '16:9', width: 1344, height: 768 },
          { ratio: '21:9', width: 1536, height: 640 },
        ];

        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/png',
                },
              }],
            },
          }],
        });

        for (const { ratio, width, height } of aspectRatios) {
          vi.clearAllMocks();
          mockGenerateContent.mockResolvedValue({
            candidates: [{
              content: {
                parts: [{
                  inlineData: {
                    data: mockBase64Image,
                    mimeType: 'image/png',
                  },
                }],
              },
            }],
          });

          const options = { ...baseOptions, aspect_ratio: ratio };
          const result = await provider.generate(options);

          expect(result.images[0].width).toBe(width);
          expect(result.images[0].height).toBe(height);
        }
      });
    });

    describe('response parsing', () => {
      it('should extract image data from inline data response', async () => {
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                  mimeType: 'image/jpeg',
                },
              }],
            },
          }],
        });

        const result = await provider.generate(baseOptions);

        expect(result.images[0].url).toBe(`data:image/jpeg;base64,${mockBase64Image}`);
      });

      it('should default to image/png if mimeType not specified', async () => {
        const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: mockBase64Image,
                },
              }],
            },
          }],
        });

        const result = await provider.generate(baseOptions);

        expect(result.images[0].url).toBe(`data:image/png;base64,${mockBase64Image}`);
      });

      it('should throw error when no images are generated', async () => {
        mockGenerateContent.mockResolvedValue({
          candidates: [{
            content: {
              parts: [],
            },
          }],
        });

        await expect(provider.generate(baseOptions)).rejects.toThrow('No images generated');
      });

      it('should throw error when response has no candidates', async () => {
        mockGenerateContent.mockResolvedValue({
          candidates: [],
        });

        await expect(provider.generate(baseOptions)).rejects.toThrow('No images generated');
      });

      it('should throw error when response structure is empty', async () => {
        mockGenerateContent.mockResolvedValue({});

        await expect(provider.generate(baseOptions)).rejects.toThrow('No images generated');
      });
    });

    describe('API error handling', () => {
      it('should propagate rate limit errors (429)', async () => {
        const rateLimitError = new Error('Rate limit exceeded');
        (rateLimitError as any).status = 429;
        mockGenerateContent.mockRejectedValue(rateLimitError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Rate limit exceeded');
      });

      it('should propagate authentication errors (401)', async () => {
        const authError = new Error('Invalid API key');
        (authError as any).status = 401;
        mockGenerateContent.mockRejectedValue(authError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Invalid API key');
      });

      it('should propagate authorization errors (403)', async () => {
        const forbiddenError = new Error('Access forbidden');
        (forbiddenError as any).status = 403;
        mockGenerateContent.mockRejectedValue(forbiddenError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Access forbidden');
      });

      it('should propagate server errors (500)', async () => {
        const serverError = new Error('Internal server error');
        (serverError as any).status = 500;
        mockGenerateContent.mockRejectedValue(serverError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Internal server error');
      });

      it('should propagate service unavailable errors (503)', async () => {
        const serviceUnavailableError = new Error('Service temporarily unavailable');
        (serviceUnavailableError as any).status = 503;
        mockGenerateContent.mockRejectedValue(serviceUnavailableError);

        await expect(provider.generate(baseOptions)).rejects.toThrow('Service temporarily unavailable');
      });

      it('should handle network errors', async () => {
        mockGenerateContent.mockRejectedValue(new Error('Network error'));

        await expect(provider.generate(baseOptions)).rejects.toThrow('Network error');
      });
    });
  });

  describe('downloadImage', () => {
    it('should download image from data URL', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/png;base64,${base64Data}`;

      const buffer = await provider.downloadImage(dataUrl);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('base64')).toBe(base64Data);
    });

    it('should download image from regular URL', async () => {
      const mockImageData = Buffer.from('fake-image-data');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageData),
      });
      global.fetch = mockFetch;

      const buffer = await provider.downloadImage('https://example.com/image.png');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png');
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should throw error when URL fetch fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });
      global.fetch = mockFetch;

      await expect(provider.downloadImage('https://example.com/missing.png'))
        .rejects.toThrow('Failed to download image: Not Found');
    });
  });

  describe('getCostPerImage', () => {
    it('should return correct cost for gemini-2.5-flash-image', () => {
      const cost = provider.getCostPerImage('gemini-2.5-flash-image');
      expect(cost).toBe(0.039);
    });

    it('should return correct cost for gemini-3-pro-image-preview', () => {
      const cost = provider.getCostPerImage('gemini-3-pro-image-preview');
      expect(cost).toBe(0.10);
    });

    it('should return default cost for unknown model', () => {
      const cost = provider.getCostPerImage('unknown-model');
      expect(cost).toBe(0.05);
    });
  });

  describe('listModels', () => {
    it('should return list of available models', () => {
      const models = provider.listModels();

      expect(models).toContain('gemini-2.5-flash-image');
      expect(models).toContain('gemini-3-pro-image-preview');
      expect(models).toHaveLength(2);
    });
  });

  describe('cost calculation', () => {
    const baseOptions: GenerateOptions = {
      prompt: 'A beautiful sunset over mountains',
      count: 1,
      aspect_ratio: '16:9',
    };

    it('should calculate total cost correctly for single image', async () => {
      const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockGenerateContent.mockResolvedValue({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: mockBase64Image,
                mimeType: 'image/png',
              },
            }],
          },
        }],
      });

      const result = await provider.generate({ ...baseOptions, count: 1 });

      expect(result.cost).toBe(0.039);
    });

    it('should calculate total cost correctly for multiple images', async () => {
      const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockGenerateContent.mockResolvedValue({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: mockBase64Image,
                mimeType: 'image/png',
              },
            }],
          },
        }],
      });

      const result = await provider.generate({ ...baseOptions, count: 5 });

      expect(result.cost).toBeCloseTo(0.039 * 5, 5);
    });

    it('should use model-specific cost for calculation', async () => {
      const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockGenerateContent.mockResolvedValue({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: mockBase64Image,
                mimeType: 'image/png',
              },
            }],
          },
        }],
      });

      const result = await provider.generate({
        ...baseOptions,
        model: 'gemini-3-pro-image-preview',
        count: 2,
      });

      expect(result.cost).toBe(0.10 * 2);
    });
  });
});
