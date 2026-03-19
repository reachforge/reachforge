---
generated: 2026-03-14
scope: docs/ ideas/ README.md SOP.md
---

# 文档集合分析报告

## 执行摘要

reachforge 项目拥有 6 份核心文档，涵盖了产品定位、技术设计、操作流程和开发策略。文档集合的主要问题是：`ideas/DESIGN_STRATEGY.md` 与 `ideas/reachforge/draft.md` 是完全相同的副本，`pyproject.toml` 中残留了已弃用的 Python 技术栈描述与当前 Bun/TypeScript 架构严重矛盾，且缺少测试计划、API 规范和部署指南等关键文档。

## 文档清单

| 文件路径 | 用途 | 状态 |
|---|---|---|
| `README.md` | 项目入口介绍，面向新用户/开发者 | 当前有效 |
| `SOP.md` | 用户操作标准流程 | 当前有效，但细节不完整 |
| `docs/project-reachforge.md` | 产品功能清单（Feature Manifest） | 当前有效 |
| `docs/tech-design-core.md` | Phase 1 核心编排技术设计 | 当前有效，但内容偏少 |
| `ideas/DESIGN_STRATEGY.md` | 架构设计与开发策略 | 与 draft.md 完全重复 |
| `ideas/reachforge/draft.md` | 架构设计与开发策略 | 与 DESIGN_STRATEGY.md 完全重复 |
| `pyproject.toml` | Python 项目元数据 | 过时，与当前架构冲突 |
| `package.json` | Node/Bun 项目元数据 | 当前有效 |
| `scripts/adapt.py` | Python 版适配脚本（伪代码） | 过时，已被 TS 实现取代 |
| `04_adapted/template_meta.yaml` | 元数据模板示例 | 当前有效 |

## 主题地图

### 主题 1：产品定位与命名
- `README.md` — 高层定位描述
- `ideas/DESIGN_STRATEGY.md` — 命名由来（apforge → reachforge）
- `docs/project-reachforge.md` — 功能定位

### 主题 2：六阶段流水线架构
- `README.md` (Directory Pipeline 章节)
- `SOP.md` (CLI Commands 章节)
- `docs/tech-design-core.md` (Directory State Machine 章节)
- `ideas/DESIGN_STRATEGY.md` (Six-Stage Pipeline Convention 章节)

### 主题 3：技术选型与运行时
- `README.md` — Bun 推荐
- `ideas/DESIGN_STRATEGY.md` — Bun + TypeScript 选型论证
- `pyproject.toml` — Python + Hatchling（矛盾！）
- `package.json` — Bun + TypeScript（实际采用）

### 主题 4：发布策略（Native + SaaS Bridge）
- `ideas/DESIGN_STRATEGY.md` (Plugin Architecture 章节)
- `docs/project-reachforge.md` (FEAT-006, FEAT-007)
- `SOP.md` (publish 命令描述)

### 主题 5：AI 内容生成与适配
- `docs/project-reachforge.md` (FEAT-004, FEAT-005)
- `SOP.md` (draft, adapt 命令)
- `scripts/adapt.py` (遗留 Python 伪代码)

### 主题 6：生态集成（MCP / VSCode / Mobile）
- `README.md` (VSCode Extension & Mobile 章节)
- `docs/project-reachforge.md` (FEAT-010)
- `ideas/DESIGN_STRATEGY.md` (Roadmap Phase 3-4)

## 发现

### 冲突

#### 冲突 1：`pyproject.toml` vs 整体架构（严重）

`pyproject.toml` 声明项目为 Python 项目：
> ```
> description = "AI PartnerUp Press: Multi-platform content adaptation and distribution factory."
> dependencies = ["pydantic-ai>=0.0.1", "pyyaml>=6.0.1", ...]
> requires-python = ">=3.12"
> ```

而 `README.md`、`package.json` 和 `ideas/DESIGN_STRATEGY.md` 均明确采用 Bun/TypeScript：
> `README.md`: "reachforge recommends using Bun for extreme performance and a single-file distribution experience."
> `package.json`: 实际依赖为 `commander`, `chalk`, `@google/generative-ai` 等 Node/Bun 包。

此外，`pyproject.toml` 的 description 使用了旧名 **"AI PartnerUp Press"**，而 `package.json` 已更新为 **"ReachForge"**。

#### 冲突 2：目录命名约定不一致

`README.md` 使用带 emoji 前缀的目录名：
> `📥_01_inbox`, `✍️_02_drafts`, `🎯_03_master` ...

而 `src/index.ts` 的实际实现使用无 emoji 的目录名：
> `01_inbox`, `02_drafts`, `03_master` ...

`ideas/DESIGN_STRATEGY.md` 同样使用带 emoji 的目录名，但 `docs/tech-design-core.md` 和 `SOP.md` 使用不带 emoji 的版本。这会导致用户困惑。

#### 冲突 3：Receipt 文件格式不一致

`SOP.md` 声明：
> "**Receipt.json**: Automatically generated in `06_sent` after sending"

而 `ideas/DESIGN_STRATEGY.md` 和实际代码 (`src/index.ts` 第 160 行) 使用 `receipt.yaml` 格式。

#### 冲突 4：平台列表不一致

`SOP.md` 中 `adapt` 命令描述的目标平台目录结构为：
> `04_adapted/article-name/platform_versions/`

`scripts/adapt.py` 列出的平台为 `["wechat", "twitter", "zhihu"]`（使用 "twitter"）。

而 `src/index.ts` 实际使用 `["x", "wechat", "zhihu"]`（使用 "x" 而非 "twitter"）。

`04_adapted/template_meta.yaml` 则使用 `x_twitter` 和 `wechat_mp` 作为平台键名，与以上均不一致。

#### 冲突 5：Roadmap 阶段划分不一致

`docs/project-reachforge.md` 的分阶段为：
> Phase 1: Core Orchestration, Phase 2: Content Intelligence, Phase 3: Publishing & Plugins, Phase 4: Automation & Ecosystem

`ideas/DESIGN_STRATEGY.md` 的分阶段为：
> Phase 1: Core framework + plugin loader, Phase 2: Migrate plugins, Phase 3: MCP Server, Phase 4: VSCode extension, Phase 5: Watch daemon

这两个 Roadmap 对功能的分组和优先级存在显著差异。

### 缺口

| 缺失文档 | 优先级 | 说明 |
|---|---|---|
| 产品需求文档（PRD） | 高 | 缺少正式的用户故事、使用场景和验收标准 |
| 测试计划 | 高 | 无任何测试相关文档或测试代码 |
| API 规范 | 中 | MCP Server 接口和平台发布 API 集成缺少规范 |
| 部署/运维指南 | 中 | 缺少 `credentials.yaml` 配置、环境变量设置等运维文档 |
| 贡献者指南 | 低 | 项目尚早期，但缺少开发规范 |
| CHANGELOG | 低 | 无变更日志 |

### 冗余

#### 冗余 1：`ideas/DESIGN_STRATEGY.md` 与 `ideas/reachforge/draft.md` 完全相同

这两个文件内容 100% 一致（84 行完全相同），属于同一文档的两份副本。建议删除其中一份，保留 `ideas/DESIGN_STRATEGY.md` 作为权威版本。

#### 冗余 2：六阶段流水线在 4 处文档中重复描述

`README.md`、`SOP.md`、`docs/tech-design-core.md` 和 `ideas/DESIGN_STRATEGY.md` 均各自描述了六阶段流水线，且存在细微不一致（如 emoji 前缀、描述措辞）。建议在一处定义权威版本，其他文档引用。

#### 冗余 3：`scripts/adapt.py` 与 `src/index.ts` 功能重叠

Python 脚本是遗留的伪代码实现，功能已完全被 TypeScript 版本取代。

### 过时内容

| 内容 | 文件 | 过时原因 |
|---|---|---|
| `pyproject.toml` 整体 | `pyproject.toml` | 项目已从 Python 迁移到 Bun/TypeScript |
| "AI PartnerUp Press" 名称 | `pyproject.toml` | 项目已更名为 "ReachForge" |
| `scripts/adapt.py` | `scripts/adapt.py` | Python 伪代码，已被 TS 实现取代 |
| "twitter" 平台名 | `scripts/adapt.py` | 平台已更名为 X，代码中已使用 "x" |
| "Receipt.json" 格式描述 | `SOP.md` | 实际实现使用 `receipt.yaml` |
| `gemini-pro` 模型引用 | `src/index.ts` | 可能需要更新为最新的 Gemini 模型名称 |

## 建议

按优先级排序：

1. **【紧急】删除或归档 `pyproject.toml` 和 `scripts/adapt.py`** — 这些是 Python 时代的遗留物，与当前 Bun/TypeScript 架构直接矛盾，会严重误导新开发者。

2. **【紧急】删除 `ideas/reachforge/draft.md`** — 与 `ideas/DESIGN_STRATEGY.md` 完全重复，保留一份即可。

3. **【高优先级】统一目录命名约定** — 决定使用带 emoji 还是不带 emoji 的目录名，并在所有文档和代码中统一。当前代码使用无 emoji 版本，建议文档跟进。

4. **【高优先级】修正 `SOP.md` 中的 Receipt 格式描述** — 将 "Receipt.json" 改为 "receipt.yaml" 以匹配实际实现。

5. **【高优先级】统一平台名称** — 在所有文档和代码中统一使用 `x`（而非 `twitter` 或 `x_twitter`）、`wechat`（而非 `wechat_mp`）等一致的键名。

6. **【中优先级】统一 Roadmap** — 合并 `docs/project-reachforge.md` 和 `ideas/DESIGN_STRATEGY.md` 中的两个不同 Roadmap 为单一权威版本。

7. **【中优先级】补充测试计划和 API 规范** — 随着项目进入实际开发，这些文档对于质量保障至关重要。

8. **【低优先级】重构文档结构** — 将六阶段流水线的权威定义集中到一处（如 `docs/tech-design-core.md`），其他文档仅做简要引用。
