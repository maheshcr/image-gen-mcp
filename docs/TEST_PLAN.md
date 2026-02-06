# Image-Gen MCP - Comprehensive Test Plan

**Version**: 1.0
**Created**: 2026-02-06
**Status**: Draft - Pending Review

---

## Executive Summary

This test plan covers the `image-gen-mcp` server — an MCP that enables AI image generation within Claude Code. Testing spans unit tests, integration tests, end-to-end tests, and cross-platform validation.

**Current Issue**: The deployed MCP path points to a location without the built `dist/` folder. This must be fixed before any testing can proceed.

---

## Pre-Test: Deployment Sync Fix

### Issue
```
Deployed path:  ~/Documents/Obsidian/MyVault/Plugins/image-gen-mcp/dist/server.js
Actual source:  ~/projects/image-gen-mcp/dist/server.js
```

The Plugins location has no `dist/` folder.

### Fix Options

**Option A: Update settings.json (Recommended)**
```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": ["/Users/maheshcr/projects/image-gen-mcp/dist/server.js"]
    }
  }
}
```

**Option B: Symlink the project**
```bash
rm -rf ~/Documents/Obsidian/MyVault/Plugins/image-gen-mcp
ln -s ~/projects/image-gen-mcp ~/Documents/Obsidian/MyVault/Plugins/image-gen-mcp
```

**Option C: Deploy script (for distribution)**
```bash
# Copy built artifacts to deployment location
cp -r ~/projects/image-gen-mcp/dist ~/Documents/Obsidian/MyVault/Plugins/image-gen-mcp/
cp ~/projects/image-gen-mcp/package.json ~/Documents/Obsidian/MyVault/Plugins/image-gen-mcp/
cd ~/Documents/Obsidian/MyVault/Plugins/image-gen-mcp && npm install --production
```

---

## Test Environment Requirements

### Local Machine (Primary)
- Node.js 18+
- npm or pnpm
- Claude Code CLI installed
- API keys configured:
  - `GOOGLE_API_KEY` (for Gemini provider)
  - `FAL_KEY` (for Fal.ai provider)
  - R2 credentials (for cloud storage tests)

### Friend's Machines (Cross-Platform)
- macOS (Intel + Apple Silicon)
- Linux (Ubuntu/Debian)
- Windows (WSL2 or native Node)

---

## Test Categories

## 1. Unit Tests

Location: `tests/unit/`

### 1.1 Provider Tests (`tests/unit/providers/`)

#### Gemini Provider (`gemini.test.ts`)
| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| GEM-01 | Initialize with valid API key | Provider ready, no errors |
| GEM-02 | Initialize with invalid API key | Throws authentication error |
| GEM-03 | Generate single image | Returns base64 data URL |
| GEM-04 | Generate multiple images (count: 3) | Returns 3 image URLs |
| GEM-05 | Aspect ratio 1:1 | Image dimensions are square |
| GEM-06 | Aspect ratio 16:9 | Image dimensions are widescreen |
| GEM-07 | Aspect ratio 9:16 | Image dimensions are portrait |
| GEM-08 | Negative prompt handling | Prompt sent correctly to API |
| GEM-09 | Cost calculation accuracy | Returns correct $/image |
| GEM-10 | API rate limit handling | Retries or returns clear error |
| GEM-11 | Network timeout handling | Returns timeout error, doesn't hang |
| GEM-12 | Empty prompt rejection | Throws validation error |

#### Fal.ai Provider (`fal.test.ts`)
| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| FAL-01 | Initialize with valid API key | Provider ready |
| FAL-02 | Initialize with invalid API key | Throws auth error |
| FAL-03 | Generate with FLUX Schnell | Returns image, cost ~$0.003 |
| FAL-04 | Generate with FLUX Dev | Returns image, cost ~$0.025 |
| FAL-05 | Generate with FLUX Pro | Returns image, cost ~$0.05 |
| FAL-06 | Model fallback on unavailable | Falls back or errors gracefully |
| FAL-07 | All aspect ratios supported | 1:1, 16:9, 9:16, 4:3 work |
| FAL-08 | Cost tracking per model | Correct pricing applied |

### 1.2 Storage Tests (`tests/unit/storage/`)

#### R2 Storage (`r2.test.ts`)
| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| R2-01 | Initialize with valid credentials | Connection successful |
| R2-02 | Initialize with invalid credentials | Auth error thrown |
| R2-03 | Upload image (Buffer) | Returns public URL |
| R2-04 | Upload with custom filename | Filename preserved in URL |
| R2-05 | Path template: `{year}/{month}/{filename}` | Correct path structure |
| R2-06 | Delete single file | File removed, returns success |
| R2-07 | Delete non-existent file | No error, returns false |
| R2-08 | Health check endpoint | Returns healthy/unhealthy |
| R2-09 | Upload large image (10MB) | Completes without timeout |
| R2-10 | Concurrent uploads (5 files) | All complete successfully |

#### Local Storage (`local.test.ts`)
| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| LOC-01 | Initialize with valid directory | Directory created if needed |
| LOC-02 | Initialize with invalid path | Clear error message |
| LOC-03 | Save image to disk | File exists, readable |
| LOC-04 | Return file:// URL | Valid file URL format |
| LOC-05 | Delete file | File removed |
| LOC-06 | Directory permissions | Handles read-only gracefully |

### 1.3 Database Tests (`tests/unit/db/`)

#### GenerationStore (`generations.test.ts`)
| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| DB-01 | Initialize new database | Schema created |
| DB-02 | Create generation record | ID returned, queryable |
| DB-03 | Add images to generation | Images linked correctly |
| DB-04 | Query by ID | Returns full generation |
| DB-05 | List recent generations | Ordered by date DESC |
| DB-06 | Mark image as selected | Updates selected_index |
| DB-07 | Cost aggregation by provider | Correct totals |
| DB-08 | Cost aggregation by model | Correct totals |
| DB-09 | Cost aggregation by period | day/week/month/all work |
| DB-10 | Database persistence | Data survives restart |
| DB-11 | Concurrent writes | No corruption |
| DB-12 | Large dataset (1000 generations) | Queries stay fast |

### 1.4 Config Tests (`tests/unit/config/`)

#### Config Loader (`loader.test.ts`)
| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| CFG-01 | Load valid YAML config | Config object returned |
| CFG-02 | Environment variable substitution | `${VAR}` replaced |
| CFG-03 | Missing required field | Zod validation error |
| CFG-04 | Invalid provider name | Validation error |
| CFG-05 | Default values applied | Missing optionals filled |
| CFG-06 | .env file loading | Variables available |
| CFG-07 | Nested object validation | Deep fields validated |
| CFG-08 | Config file not found | Clear error, suggests setup |

---

## 2. Integration Tests

Location: `tests/integration/`

### 2.1 Provider + Storage Integration

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| INT-01 | Gemini generate → R2 upload | Full flow works |
| INT-02 | Gemini generate → Local save | Full flow works |
| INT-03 | Fal generate → R2 upload | Full flow works |
| INT-04 | Fal generate → Local save | Full flow works |
| INT-05 | Generate → Select → Cleanup | Previews deleted after select |
| INT-06 | Generate → DB record created | Generation in database |
| INT-07 | Select → DB record updated | public_url populated |

### 2.2 Tool Handler Integration

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| INT-10 | generate_images full flow | Returns generation_id, previews |
| INT-11 | select_image with valid ID | Returns permanent URL |
| INT-12 | select_image with invalid ID | Clear error message |
| INT-13 | list_generations empty DB | Returns empty array |
| INT-14 | list_generations with data | Returns formatted list |
| INT-15 | get_costs empty | Returns $0.00 |
| INT-16 | get_costs with generations | Accurate totals |
| INT-17 | cleanup_previews dry run | Lists but doesn't delete |
| INT-18 | cleanup_previews execute | Files actually deleted |
| INT-19 | configure show | Returns current config |
| INT-20 | configure update provider | Provider changes |

### 2.3 Budget Integration

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| INT-30 | Generate within budget | No warning |
| INT-31 | Generate approaching limit (80%) | Warning returned |
| INT-32 | Generate at limit | Generation blocked |
| INT-33 | Budget reset on new month | Limit restored |

---

## 3. End-to-End Tests

Location: `tests/e2e/`

### 3.1 MCP Protocol Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| E2E-01 | Server starts on stdio | Ready message, no errors |
| E2E-02 | List tools request | Returns 6 tools |
| E2E-03 | Tool schema validation | All schemas valid |
| E2E-04 | Invalid tool call | Error response, server stable |
| E2E-05 | Malformed JSON | Error response, server stable |
| E2E-06 | Server graceful shutdown | Cleanup completed |

### 3.2 Claude Code Integration

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| E2E-10 | MCP loads in Claude Code | Tools appear in tool list |
| E2E-11 | Generate via Claude prompt | Images generated, previews shown |
| E2E-12 | Select via Claude prompt | Image uploaded, URL returned |
| E2E-13 | Cost query via Claude | Accurate spending shown |
| E2E-14 | Cleanup via Claude | Old previews removed |
| E2E-15 | Long conversation (10+ generations) | No memory leaks |

### 3.3 Real-World Scenarios

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| E2E-20 | "Generate a logo for my app" | 3 variations returned |
| E2E-21 | "Make it more minimalist" (iteration) | Context preserved |
| E2E-22 | "Use the second one" | Image 1 uploaded |
| E2E-23 | "How much have I spent today?" | Accurate cost |
| E2E-24 | "Switch to Fal provider" | Provider changed |
| E2E-25 | Generate with custom aspect ratio | Correct dimensions |

---

## 4. Cross-Platform Tests

### 4.1 Environment Matrix

| Platform | Node Version | Status |
|----------|--------------|--------|
| macOS 14 (Apple Silicon) | 18.x | ⬜ |
| macOS 14 (Apple Silicon) | 20.x | ⬜ |
| macOS 14 (Intel) | 18.x | ⬜ |
| Ubuntu 22.04 | 18.x | ⬜ |
| Ubuntu 22.04 | 20.x | ⬜ |
| Windows 11 (WSL2) | 18.x | ⬜ |
| Windows 11 (native) | 18.x | ⬜ |

### 4.2 Platform-Specific Tests

| Test ID | Description | Platforms | Expected Result |
|---------|-------------|-----------|-----------------|
| XP-01 | npm install succeeds | All | No native module errors |
| XP-02 | Config file created | All | Correct path for OS |
| XP-03 | Local storage works | All | File paths valid |
| XP-04 | Database path | All | Uses correct OS path |
| XP-05 | Preview directory | All | Writable, correct perms |
| XP-06 | Symlinks (if used) | macOS/Linux | Work correctly |
| XP-07 | Long file paths | Windows | No path length issues |

### 4.3 Friend Machine Test Script

```bash
#!/bin/bash
# test-image-gen-mcp.sh - Run on friend's machines

echo "=== Image-Gen MCP Test Suite ==="
echo "Platform: $(uname -s) $(uname -m)"
echo "Node: $(node --version)"
echo ""

# 1. Clone and build
git clone https://github.com/YOUR_REPO/image-gen-mcp.git
cd image-gen-mcp
npm install
npm run build

# 2. Run setup wizard
npm run setup

# 3. Run unit tests
npm test -- --reporter=verbose

# 4. Manual MCP test
echo "Starting MCP server..."
node dist/server.js &
MCP_PID=$!
sleep 2

# Send test request via stdin
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server.js

kill $MCP_PID 2>/dev/null

echo ""
echo "=== Test Complete ==="
```

---

## 5. Error Handling Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| ERR-01 | Provider API down | Clear error, no crash |
| ERR-02 | Storage unreachable | Clear error, no crash |
| ERR-03 | Invalid API key at runtime | Auth error, suggests fix |
| ERR-04 | Disk full (local storage) | Error caught, reported |
| ERR-05 | Database corruption | Reinitializes or errors |
| ERR-06 | Config file deleted mid-run | Graceful degradation |
| ERR-07 | Network timeout | Configurable timeout, retry |
| ERR-08 | Partial upload failure | Cleanup attempted |

---

## 6. Performance Tests

| Test ID | Description | Target | Metric |
|---------|-------------|--------|--------|
| PERF-01 | Server startup time | < 500ms | Cold start |
| PERF-02 | generate_images latency | < 10s | Excludes API time |
| PERF-03 | select_image latency | < 2s | Upload + DB |
| PERF-04 | list_generations (100 items) | < 100ms | Query time |
| PERF-05 | get_costs aggregation | < 200ms | Full scan |
| PERF-06 | Memory usage baseline | < 100MB | Idle server |
| PERF-07 | Memory after 50 generations | < 200MB | No leaks |

---

## 7. Security Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| SEC-01 | API keys not in logs | Keys masked in output |
| SEC-02 | Config file permissions | 600 or 644 |
| SEC-03 | .env file permissions | 600 |
| SEC-04 | No secrets in error messages | Sanitized errors |
| SEC-05 | SQL injection in prompts | Parameterized queries |
| SEC-06 | Path traversal in filename | Rejected or sanitized |

---

## Test Execution Order

### Phase 1: Local Development (You)
1. Fix deployment sync issue
2. Run unit tests
3. Run integration tests
4. Manual E2E testing with Claude Code

### Phase 2: Stability Testing (You)
1. Performance tests
2. Error handling tests
3. Security tests
4. Extended usage (1 week daily use)

### Phase 3: Cross-Platform (Friends)
1. Distribute test script
2. Collect results from each platform
3. Fix platform-specific issues
4. Re-test on affected platforms

---

## Test Data & Fixtures

### Sample Prompts
```
tests/fixtures/prompts.json
- "A serene mountain landscape at sunset"
- "Minimalist logo for a tech startup"
- "Abstract geometric pattern in blue tones"
- "Photorealistic cat wearing a top hat"
- "Watercolor painting of a coffee cup"
```

### Mock API Responses
```
tests/fixtures/mock-responses/
- gemini-success.json
- gemini-error-rate-limit.json
- fal-success.json
- fal-error-auth.json
```

### Sample Images
```
tests/fixtures/images/
- test-1x1.png (100x100)
- test-16x9.png (1920x1080)
- test-9x16.png (1080x1920)
```

---

## Success Criteria

### Unit Tests
- [ ] 100% of tests passing
- [ ] Code coverage > 80%
- [ ] No flaky tests

### Integration Tests
- [ ] All provider + storage combinations work
- [ ] Budget enforcement accurate
- [ ] Database operations reliable

### E2E Tests
- [ ] Claude Code integration seamless
- [ ] Real-world prompts work as expected
- [ ] Error messages helpful

### Cross-Platform
- [ ] Works on macOS (Intel + ARM)
- [ ] Works on Ubuntu 22.04
- [ ] Works on Windows (WSL2 minimum)

---

## Appendix: Test Commands

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific category
npm test -- tests/unit/providers
npm test -- tests/integration
npm test -- tests/e2e

# Run single test file
npm test -- tests/unit/providers/gemini.test.ts

# Watch mode during development
npm test -- --watch

# Generate coverage report
npm test -- --coverage --reporter=html
open coverage/index.html
```

---

## Notes

- Test with real API keys for integration/E2E (consider using test accounts with low limits)
- Mock external APIs for unit tests to avoid costs and flakiness
- Document any platform-specific workarounds discovered
- Update this plan as new features are added
