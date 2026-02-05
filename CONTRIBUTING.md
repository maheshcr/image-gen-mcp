# Contributing to image-gen-mcp

Welcome! We're excited that you're interested in contributing to image-gen-mcp. This MCP server enables AI image generation with multi-provider support, cloud storage, and cost tracking. Whether you're fixing bugs, adding new providers, or improving documentation, your contributions are valuable.

## Getting Started

### Development Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Run tests to ensure everything works:
   ```bash
   npm test
   ```

### Development Workflow

- `npm run dev` - Watch mode for development
- `npm run lint` - Check code style
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests

## Code Style

- **TypeScript** - All code must be written in TypeScript with proper type annotations
- **ESLint** - Run `npm run lint` before committing; fix any errors
- **Naming** - Use camelCase for variables/functions, PascalCase for interfaces/classes
- **Imports** - Use ES module imports (`import`/`export`)

## Adding a New Provider

To add support for a new image generation provider:

1. Create a new file in `src/providers/` (e.g., `src/providers/openai.ts`)

2. Implement the `ImageProvider` interface from `src/providers/base.ts`:

   ```typescript
   import { ImageProvider, GenerateOptions, GenerateResult } from './base.js';

   export class OpenAIProvider implements ImageProvider {
     readonly name = 'openai';

     async generate(options: GenerateOptions): Promise<GenerateResult> {
       // Implementation
     }

     async downloadImage(url: string): Promise<Buffer> {
       // Implementation
     }

     getCostPerImage(model: string): number {
       // Return cost in dollars
     }

     listModels(): string[] {
       // Return available models
     }
   }
   ```

3. Register your provider in the provider registry

4. Add unit tests in `tests/unit/providers/`

5. Update documentation with supported models and pricing

## Adding a New Storage Backend

To add support for a new cloud storage service:

1. Create a new file in `src/storage/` (e.g., `src/storage/gcs.ts`)

2. Implement the `StorageProvider` interface from `src/storage/base.ts`:

   ```typescript
   import { StorageProvider, UploadOptions, UploadResult } from './base.js';

   export class GCSStorage implements StorageProvider {
     readonly name = 'gcs';

     async upload(options: UploadOptions): Promise<UploadResult> {
       // Implementation
     }

     async delete(key: string): Promise<void> {
       // Implementation
     }

     async healthCheck(): Promise<boolean> {
       // Return true if storage is accessible
     }
   }
   ```

3. Register your storage backend in the storage registry

4. Add unit tests in `tests/unit/storage/`

5. Document any required environment variables or configuration

## Testing Requirements

- **Unit tests are required** for all new features and bug fixes
- Tests should be placed in the appropriate `tests/` subdirectory
- Aim for meaningful coverage of edge cases and error conditions
- Mock external API calls in unit tests
- Run the full test suite before submitting a PR:
  ```bash
  npm test
  ```

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`
2. **Make your changes** with clear, focused commits
3. **Write or update tests** for your changes
4. **Run the test suite** and ensure all tests pass
5. **Run the linter** and fix any issues
6. **Submit a PR** with a clear description of the changes

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Reference any related issues in the PR description
- Be responsive to feedback and questions
- Squash commits if requested

## Reporting Issues

When reporting bugs or requesting features:

- **Search existing issues** first to avoid duplicates
- **Use a clear title** that summarizes the issue
- **Provide details**:
  - For bugs: Steps to reproduce, expected vs. actual behavior, error messages
  - For features: Use case, proposed solution, alternatives considered
- **Include environment info**: Node.js version, OS, provider being used

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold this code. Please report unacceptable behavior to the project maintainers.

## Questions?

If you have questions about contributing, feel free to open an issue with the "question" label. We're happy to help!

Thank you for contributing!
