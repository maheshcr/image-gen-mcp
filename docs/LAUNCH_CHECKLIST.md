# Launch Checklist

Complete guide for taking image-gen-mcp public.

## 1. Visual Assets

### Demo GIF (Recommended: 30-60 seconds)

**What to capture:**
1. Terminal with Claude Code open
2. Type: "Generate a header image for a blog post about meditation"
3. Show the 3 preview URLs appearing
4. Type: "I like the second one"
5. Show the final uploaded URL

**Tools for recording:**

| Tool | Platform | Notes |
|------|----------|-------|
| [Gifski](https://gif.ski/) | macOS | Best quality, drag & drop |
| [LICEcap](https://www.cockos.com/licecap/) | macOS/Windows | Simple, lightweight |
| [asciinema](https://asciinema.org/) | Terminal | Pure terminal recording, can convert to GIF |
| [Kap](https://getkap.co/) | macOS | Screen recorder with GIF export |
| [peek](https://github.com/phw/peek) | Linux | Simple GIF recorder |

**Recording tips:**
- Use a clean terminal (no sensitive info visible)
- Increase font size for readability (14-16pt)
- Keep it under 60 seconds (GitHub README auto-plays)
- Resolution: 800x600 or 1200x800 max
- Save as: `docs/demo.gif`

**Alternative: asciinema + svg-term**
```bash
# Record terminal session
asciinema rec demo.cast

# Convert to animated SVG (smaller file size)
npx svg-term-cli --in demo.cast --out docs/demo.svg --window
```

### Screenshots

Capture these for README and blog post:

1. **Setup wizard** - Terminal showing the interactive setup
2. **Generation in action** - Claude generating images with preview URLs
3. **Selection** - Selecting an image and getting the final URL
4. **Cost tracking** - Output of `get_costs` tool

Save to: `docs/screenshots/`

---

## 2. Fresh Machine Testing

### What to give testers

Send this to 1-2 friends with Node.js installed:

```
Hey! Can you help me test my MCP server installation?

Prerequisites:
- Node.js 18+ installed
- Claude Code CLI installed (https://claude.ai/code)

Steps:
1. Clone: git clone https://github.com/maheshcr/image-gen-mcp.git
2. cd image-gen-mcp
3. npm install
4. npm run build
5. npm run setup
   - Follow the wizard (you'll need a Gemini API key from https://ai.google.dev/)
   - For storage, pick "local" to keep it simple
6. Register with Claude Code:
   claude mcp add image-gen ~/.config/image-gen-mcp/config.yaml
7. Restart Claude Code
8. Try: "Generate an image of a sunset over mountains"

Let me know:
- Did the setup wizard work smoothly?
- Any confusing steps or error messages?
- Did image generation work?
- How long did the whole process take?

Thanks!
```

### Test matrix

| OS | Node Version | Tester | Status |
|----|--------------|--------|--------|
| macOS (Apple Silicon) | 20.x | Self | ✅ |
| macOS (Intel) | 18.x | | |
| Ubuntu 22.04 | 20.x | | |
| Windows 11 | 20.x | | |

---

## 3. GitHub Repository Setup

### Topics/Tags
Add these topics in GitHub repo settings:
- `mcp`
- `model-context-protocol`
- `image-generation`
- `claude`
- `ai`
- `typescript`
- `gemini`
- `fal-ai`

### Repository Settings
- [ ] Add description: "MCP server for AI image generation with multi-provider support"
- [ ] Add website: (your blog post URL)
- [ ] Enable Discussions (optional, for community Q&A)
- [ ] Enable Sponsorship (optional)

---

## 4. MCP Directory Submissions

### Submission URLs

| Directory | URL | Status |
|-----------|-----|--------|
| awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | PR to add |
| mcp.so | https://mcp.so/submit | Form submission |
| Glama | https://glama.ai/mcp/servers | Form submission |
| Smithery | https://smithery.ai/ | Form submission |
| Anthropic (official) | Check MCP docs | May require approval |

### PR Template for awesome-mcp-servers

```markdown
## Add image-gen-mcp

### Description
MCP server for AI image generation with multi-provider support (Gemini, Fal.ai, Replicate).

### Category
Media Generation

### Entry
| Name | Description |
|------|-------------|
| [image-gen-mcp](https://github.com/maheshcr/image-gen-mcp) | AI image generation with preview-select-upload workflow, multi-provider support, and cost tracking |
```

---

## 5. Social Media Posting

### Timing
- Best days: Tuesday, Wednesday, Thursday
- Best time: 9-10am PST (Twitter), 8-10am PST (LinkedIn)
- Stagger posts by 2-3 hours

### Posting Order
1. **Twitter thread** (morning)
2. **LinkedIn post** (1 hour later)
3. **Reddit posts** (afternoon, stagger by subreddit)
   - r/ClaudeAI
   - r/LocalLLaMA
   - r/MachineLearning (Sunday/Monday for "Project" flair)
4. **Discord** (evening)
   - Claude Community Discord
   - MCP Discord (if exists)
5. **Hacker News** (next day if initial response is good)

### Content locations
- Twitter: `ContentEngine/Drafts/twitter/2026-02-06-image-gen-mcp-launch-thread.md`
- LinkedIn: `ContentEngine/Drafts/linkedin/2026-02-06-image-gen-mcp-launch.md`
- Blog: `ContentEngine/Drafts/blog/2026-02-05-Building an Image Generation MCP Server.md`

---

## 6. Post-Launch Monitoring

### Day 1
- [ ] Monitor GitHub for issues/stars
- [ ] Respond to all comments within 2 hours
- [ ] Engage with retweets/shares
- [ ] Thank early adopters publicly

### Week 1
- [ ] Address any installation issues
- [ ] Update docs based on feedback
- [ ] Consider quick-fix releases if needed
- [ ] Write follow-up tweet with learnings

---

## 7. Launch Day Script

```bash
# 1. Final checks
cd ~/projects/image-gen-mcp
npm test                    # All tests pass
npm run build              # Build succeeds
git status                 # Clean working directory

# 2. Make public (do this in GitHub UI)
# Settings > General > Change visibility > Make public

# 3. Verify public access
curl -s https://api.github.com/repos/maheshcr/image-gen-mcp | jq .visibility
# Should return "public"

# 4. Post social media (manual)
# - Copy Twitter thread from drafts
# - Copy LinkedIn post from drafts

# 5. Submit to directories (manual)
# - Open each URL and submit

# 6. Celebrate! 🎉
```

---

## Quick Reference

| Item | Location |
|------|----------|
| GitHub Repo | https://github.com/maheshcr/image-gen-mcp |
| Demo GIF | `docs/demo.gif` (to create) |
| Screenshots | `docs/screenshots/` (to create) |
| Twitter Draft | `ContentEngine/Drafts/twitter/2026-02-06-image-gen-mcp-launch-thread.md` |
| LinkedIn Draft | `ContentEngine/Drafts/linkedin/2026-02-06-image-gen-mcp-launch.md` |
| Blog Draft | `ContentEngine/Drafts/blog/2026-02-05-Building an Image Generation MCP Server.md` |
