# reachforge Architectural Design & Development Strategy

> **reachforge: The Social Influence Engine for AI-Native Content.**

This document records the core architectural decisions, technical selection criteria, and integration paths within the `aipartnerup` ecosystem for `reach` (formerly `apforge`).

## 1. Naming & Positioning
- **Positioning**: AI-native Social Influence Engine, responsible for transforming inspiration fragments into multi-platform viral assets.
- **Naming Rationale**:
  - Renamed to **`reach`** to perfectly fit the "4-letter component" sequence of the `aipartnerup` ecosystem (`apcore`, `apflow`).
  - **Hype** directly points to the ultimate goal of content production: building influence and buzz.
  - Avoids naming conflicts with external development toolkits (`*-forge`).

## 2. Tech Stack Selection
- **Core Runtime**: **Bun** (Ultra-fast startup, supports single-file binary packaging, solving cross-platform distribution).
- **Programming Language**: **TypeScript (TS)** (Perfectly fits VSCode plugin environments and the MCP SDK).

## 3. Plugin Architecture: Hybrid Publishing Strategy
`reach` supports two modes: "Local Direct Publishing" and "Cloud Bridging", which are completely transparent to the user.

### 3.1 Native Providers
- **Scenario**: For developer-friendly platforms like Dev.to, Hashnode, and GitHub.
- **Implementation**: `reach` -> Platform Official API (user-provided API Key).
- **Advantages**: Completely free, data stays local.

### 3.2 Bridge/SaaS Providers
- **Scenario**: For platforms like Instagram, TikTok, and X where API application is difficult or premium services are involved.
- **Implementation**: `reach` -> **Postiz Cloud / Third-party SaaS API** -> Target platform.
- **Advantages**: Eliminates tedious OAuth applications, supports centralized management of multiple accounts, and provides more robust task retries.

## 4. Core Industrial Design

### 4.1 Two-Stage Media Pipeline
- **Logic**: Most platforms require media to be uploaded first to obtain a `media_id` before associating it with a post.
- **Caching Mechanism**: Maintain `.upload_cache.yaml` within the project folder to record the upload status of images on each platform, avoiding duplicate uploads.

### 4.2 Status Locking & Idempotency
- **Prevent Duplicate Publishing**: Real-time recording of publishing status for each platform in `receipt.yaml`. If a network interruption occurs during publishing, the system only retries the failed parts upon restart.
- **Publishing Lock**: Marks the execution state as `publishing` to prevent multi-process conflicts.

### 4.3 Automated Watcher Mode
- **Command**: `reach watch`.
- **Function**: Uses Bun's `fs.watch` to monitor the `05_scheduled` directory in real-time. Once the date arrives, it automatically triggers publishing, achieving fully automated operation.

### 4.4 Security & Configuration Management
- **Layered Storage**:
  - `~/.config/reachforge/credentials.yaml`: Global private tokens (Permission: 600).
  - `.env`: Project-level temporary environment variables.
- **Encryption Integration**: Prioritizes calling `apcore`'s encryption module to store sensitive information.

## 5. Core Workflow: Folders as Projects
`reach` strictly follows the principle of "Everything is a File" and "User Visible, Controllable, and Repairable".

### 📁 Unified Project Anatomy
- `content.md`: Raw inspiration, materials, or outlines.
- `assets/`: Stores media assets.
- `meta.yaml`: [Optional] Project-specific configuration (e.g., publishing platforms, tone, etc.).
- `platform_versions/`: [System-generated] Adapted versions for different platforms (e.g., `x.md`, `devto.md`).
- `receipt.yaml`: [Generated after publishing] Contains publishing links, receipts, and error logs.

### 🚀 Six-Stage Pipeline Convention
1. **`📥_01_inbox`**: Material entry.
2. **`✍️_02_drafts`**: AI-generated `draft.md`.
3. **`🎯_03_master`**: User-confirmed `master.md`.
4. **`🤖_04_adapted`**: Generates platform-specific files under `platform_versions/`.
5. **`📅_05_scheduled`**: Folder renamed to `YYYY-MM-DD-title`, awaiting publication.
6. **`📤_06_sent`**: Archiving and recording receipts.

## 6. Design Philosophy
- **User Sovereignty**: Files reside in the directory corresponding to their current stage.
- **What You See Is What You Get**: If text in `platform_versions/x.md` is modified, the system will strictly prioritize those manual changes upon publication.
- **Graceful Degradation (Fail-safe)**: Missing configurations fall back to defaults; publishing failures can be manually retried at any time.
- **Cross-platform Consistency**: Mandatory use of POSIX-style path handling to ensure Windows/macOS compatibility.

## 7. Roadmap
- [ ] **Phase 1**: Build the core framework and plugin loader based on Bun + `apcore`.
- [ ] **Phase 2**: Migrate `dev.to` (Native) and `postiz-bridge` (SaaS) plugins.
- [ ] **Phase 3**: Launch MCP Server mode to support Claude collaborative creation.
- [ ] **Phase 4**: Release VSCode extension version.
- [ ] **Phase 5**: Implement `reach watch` automated daemon process.

---
*Last Updated: 2026-03-14*
