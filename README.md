# aphype (AI PartnerUp Hype)

> **aphype: The Social Influence Engine for AI-Native Content.**

**aphype** is an **AI-native Social Influence Engine** for end-users. It adopts a "File-as-State" design philosophy, transforming inspiration fragments into multi-platform viral assets through a lightweight six-stage pipeline.

## Core Design Philosophy
- **Directory-based Sync**: No database required. Folders represent states, filenames act as timestamps, and YAML files store metadata.
- **Bun Driven**: Extreme execution efficiency and single-file binary distribution, perfectly suited for CLI and desktop environments.
- **Hybrid Publishing Strategy**: Supports direct local API publishing and SaaS-bridged (e.g., Postiz) publishing.
- **AI Adapter Pattern**: Automatically rewrites the master draft into optimal versions for different platforms (X, WeChat, Zhihu) via LLM.

## Directory Pipeline (01-06)
1. `📥_01_inbox`: Raw material entry.
2. `✍️_02_drafts`: AI-generated long-form drafts.
3. `🎯_03_master`: "Master draft/Source file" signed off by the Editor-in-Chief (User).
4. `🤖_04_adapted`: **Core Stage**! AI-generated multi-platform adapted version folders.
5. `📅_05_scheduled`: Confirmed schedule, awaiting automatic/manual distribution bundles.
6. `📤_06_sent`: Published history archive, including publication receipts.

## Development and Execution

**aphype** recommends using [Bun](https://bun.sh/) for extreme performance and a single-file distribution experience.

```bash
# Install dependencies
bun install

# Run development version
bun dev status

# Compile to single-file binary (current platform)
bun run build

# Cross-compile (Windows)
bun run build:win

# Cross-compile (macOS ARM)
bun run build:macos
```

## VSCode Extension & Mobile
- **VSCode**: Core logic is fully compatible with the `VSCode Extension` TS environment, allowing direct invocation of compiled binaries via `Sidecar`.
- **Claude/Gemini**: Native support for the `MCP (Model Context Protocol)`, allowing LLMs to directly manipulate your content pipeline.
- **Mobile Future**: File processing logic layers can be reused later via `React Native`.
