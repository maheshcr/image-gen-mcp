import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateStoragePath, sanitizeForHeader } from '../../../src/storage/base.js';

describe('generateStoragePath', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should replace year, month, day, and filename placeholders', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));

    const result = generateStoragePath('{year}/{month}/{day}/{filename}', 'test.png');

    expect(result).toBe('2025/03/15/test.png');
  });

  it('should pad single-digit months and days with leading zeros', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-05T10:00:00Z'));

    const result = generateStoragePath('{year}/{month}/{day}/{filename}', 'image.jpg');

    expect(result).toBe('2025/01/05/image.jpg');
  });

  it('should handle template without all placeholders', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-20T10:00:00Z'));

    const result = generateStoragePath('images/{filename}', 'photo.png');

    expect(result).toBe('images/photo.png');
  });
});

describe('sanitizeForHeader', () => {
  describe('unicode character replacement', () => {
    it('should replace curly single quotes with straight quotes', () => {
      expect(sanitizeForHeader("It's a 'test'")).toBe("It's a 'test'");
    });

    it('should replace curly double quotes with straight quotes', () => {
      expect(sanitizeForHeader('He said "hello"')).toBe('He said "hello"');
    });

    it('should replace em dash with double hyphen', () => {
      expect(sanitizeForHeader('before—after')).toBe('before--after');
    });

    it('should replace en dash with single hyphen', () => {
      expect(sanitizeForHeader('2020–2025')).toBe('2020-2025');
    });

    it('should replace ellipsis with three dots', () => {
      expect(sanitizeForHeader('wait…')).toBe('wait...');
    });

    it('should replace non-breaking space with regular space', () => {
      expect(sanitizeForHeader('hello\u00A0world')).toBe('hello world');
    });

    it('should replace bullet points with asterisks', () => {
      expect(sanitizeForHeader('• item one • item two')).toBe('* item one * item two');
    });

    it('should handle multiple unicode characters in same string', () => {
      const input = '\u201CHello,\u201D she said\u2014\u201Cit\u2019s a test\u2026\u201D';
      const expected = '"Hello," she said--"it\'s a test..."';
      expect(sanitizeForHeader(input)).toBe(expected);
    });
  });

  describe('non-ASCII stripping', () => {
    it('should strip emoji characters', () => {
      // Emoji is stripped, and the resulting double space is collapsed
      expect(sanitizeForHeader('Hello 🌍 World')).toBe('Hello World');
    });

    it('should strip accented characters', () => {
      expect(sanitizeForHeader('café résumé')).toBe('caf rsum');
    });

    it('should strip CJK characters', () => {
      expect(sanitizeForHeader('Hello 世界')).toBe('Hello');
    });

    it('should strip Arabic characters', () => {
      expect(sanitizeForHeader('Hello مرحبا')).toBe('Hello');
    });

    it('should preserve ASCII punctuation', () => {
      expect(sanitizeForHeader('Hello, World! (test) [1-2-3]')).toBe('Hello, World! (test) [1-2-3]');
    });
  });

  describe('whitespace handling', () => {
    it('should collapse multiple spaces', () => {
      expect(sanitizeForHeader('hello    world')).toBe('hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(sanitizeForHeader('  hello world  ')).toBe('hello world');
    });

    it('should handle tabs and newlines as spaces', () => {
      expect(sanitizeForHeader('hello\tworld\ntest')).toBe('hello world test');
    });
  });

  describe('length truncation', () => {
    it('should truncate to default max length of 500', () => {
      const longText = 'a'.repeat(600);
      expect(sanitizeForHeader(longText).length).toBe(500);
    });

    it('should allow custom max length', () => {
      const longText = 'a'.repeat(100);
      expect(sanitizeForHeader(longText, 50).length).toBe(50);
    });

    it('should not truncate if under max length', () => {
      expect(sanitizeForHeader('short text', 500)).toBe('short text');
    });
  });

  describe('real-world prompts', () => {
    it('should handle typical AI prompts with unicode', () => {
      // em dash, curly quotes, curly apostrophe, ellipsis
      const prompt = 'A serene meditation scene\u2014person sitting cross-legged, surrounded by \u201Cnature\u2019s beauty\u201D\u2026peaceful';
      const expected = 'A serene meditation scene--person sitting cross-legged, surrounded by "nature\'s beauty"...peaceful';
      expect(sanitizeForHeader(prompt)).toBe(expected);
    });

    it('should handle prompts with mixed content', () => {
      // emoji + curly quotes + em dash + ellipsis
      // Note: emojis are stripped and spaces collapsed
      const prompt = '\uD83C\uDFA8 Create a beautiful sunset \uD83C\uDF05 with \u201Cwarm colors\u201D\u2014very peaceful\u2026';
      const expected = 'Create a beautiful sunset with "warm colors"--very peaceful...';
      expect(sanitizeForHeader(prompt)).toBe(expected);
    });

    it('should return empty string for pure unicode input', () => {
      expect(sanitizeForHeader('🌍🌎🌏')).toBe('');
    });

    it('should handle empty string input', () => {
      expect(sanitizeForHeader('')).toBe('');
    });
  });
});
