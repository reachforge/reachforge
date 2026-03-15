# Project Manifest: aphype (Social Influence Engine)

## 🎯 Project Overview
`aphype` is an AI-native engine designed to transform raw ideas into multi-platform social media assets using a file-based pipeline.

## 📋 Feature Manifest

### Core Orchestration (Phase 1)
- **[FEAT-001] File-Based Pipeline Core**: Implementation of the 01-06 directory state machine.
- **[FEAT-002] CLI Dashboard (`status`)**: Real-time WIP tracking and task reminders.
- **[FEAT-003] Project Lifecycle Management**: Tooling to move and rename project folders across stages.

### Content Intelligence (Phase 2)
- **[FEAT-004] AI Draft Generator (`draft`)**: Integration with LLMs (Gemini/Claude) to expand inbox items into long-form drafts.
- **[FEAT-005] AI Platform Adapter (`adapt`)**: Multi-modal adaptation logic to rewrite master drafts for X, WeChat, and Zhihu.

### Publishing & Plugins (Phase 3)
- **[FEAT-006] Native Provider System**: Direct API integration for developer platforms (Dev.to, GitHub).
- **[FEAT-007] SaaS Bridge Provider**: Integration with Postiz/SaaS for restricted platforms (X, Instagram).
- **[FEAT-008] Media Asset Manager**: Two-stage upload pipeline with `.upload_cache.yaml`.

### Automation & Ecosystem (Phase 4)
- **[FEAT-009] Watcher Mode (`watch`)**: Background daemon for automated scheduled publishing.
- **[FEAT-010] MCP Server Integration**: Model Context Protocol support for LLM direct manipulation.

## 🏗️ Technical Architecture Preview
- **Runtime**: Bun (Single-file binary)
- **Language**: TypeScript
- **State**: File system (Idempotent)
- **Security**: Local `credentials.yaml` + `apcore` encryption.
