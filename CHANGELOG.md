# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Interactive CLI setup wizard (`npm run setup`)
- MCP `configure` tool for updating settings from within Claude Code
- Comprehensive test suite (267 tests)
- GitHub Actions CI workflow
- Issue and PR templates

### Fixed

- Unicode characters in prompts (em dashes, curly quotes, emoji) no longer cause S3 upload failures
  - Added `sanitizeForHeader()` utility to convert unicode to ASCII equivalents
  - Prompts are now safely stored as S3 object metadata

## [0.1.0] - 2026-02-04

### Added

- Multi-provider image generation support
  - Google Gemini (Imagen)
  - Fal.ai
  - Replicate
- Cloud storage integration for generated images
  - Cloudflare R2
  - Backblaze B2
  - Local filesystem storage
- MCP tools for image generation workflow
  - `generate_images` - Generate multiple image variations from a prompt
  - `select_image` - Choose and upload the best variation to permanent storage
  - `list_generations` - View recent image generation history
  - `get_costs` - Track spending by day, week, month, or all time
- Cost tracking and budget management
  - Per-generation cost recording
  - Monthly budget limits with configurable alerts
  - Spending reports by time period
- SQLite-backed generation history for persistence and querying
- Preview → Select workflow enabling users to review variations before committing to storage
- Comprehensive YAML-based configuration
  - Provider credentials and preferences
  - Storage backend settings
  - Budget thresholds and alert configuration

[Unreleased]: https://github.com/maheshcr/image-gen-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/maheshcr/image-gen-mcp/releases/tag/v0.1.0
