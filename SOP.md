# reachforge SOP (Standard Operating Procedure) - Bun/TS Version

As the Editor-in-Chief of `reach`, your task is to manage "file flow". AI is responsible for performing "content transformation".

### 🛠️ CLI Commands

1. **`reach status`** (View Dashboard)
   - Scan `01-06` directories.
   - Count current "Work in Progress" (WIP) items.
   - Remind tasks to be published today.

2. **`reach draft <source>`** (Generate Draft)
   - Read from `01_inbox`.
   - Call AI to generate a long-form article and save it to `02_drafts`.

3. **`reach approve <article>`** (Promote to Master)
   - Move a draft from `02_drafts` to `03_master`.
   - Automatically rename `draft.md` to `master.md`.
   - Update metadata status to `master`.

4. **`reach adapt <article>`** (Multi-platform Adaptation)
   - The final draft must be in `03_master` (use `reach approve` to promote).
   - The script reads the master draft and generates `.md` files for all platforms in `04_adapted/article-name/platform_versions/`.

5. **`reach schedule <article> <date>`** (Set Schedule)
   - Move the adapted directory to `05_scheduled`.
   - Force rename to `YYYY-MM-DD-title` format.

6. **`reach publish`** (Execute Distribution)
   - Check date: if the folder date <= today.
   - **Automatic**: Call X, Dev.to API, or Postiz Bridge to send.
   - **Archive**: Move the entire folder to `06_sent`.
   - **Generate Receipt**: Append `receipt.yaml` inside the folder.

7. **`reach asset add <file>`** (Register Asset)
   - Copy the file into the shared `assets/` library (auto-detects `images/`, `videos/`, or `audio/` subdir).
   - Record metadata in `.asset-registry.yaml`.
   - Use `--subdir` to override auto-detection.

8. **`reach asset list [--subdir <type>]`** (List Assets)
   - Display all registered assets with MIME type, size, and reference path.
   - Filter by `images`, `videos`, or `audio`.

9. **`reach analytics [--from <date>] [--to <date>]`** (Publishing Metrics)
   - Aggregate `receipt.yaml` from `06_sent/` to show per-platform success rates.
   - Optional date range filtering (YYYY-MM-DD).

### 🗂️ Asset References

Use the `@assets/` prefix to reference shared assets in articles:

```markdown
![logo](@assets/images/logo.png)
```

Assets are stored once in the project-level `assets/` directory and are never duplicated when articles move between pipeline stages. During publishing, `@assets/` references are resolved to absolute paths automatically.

### 📁 File Standards
- **Meta.yaml**: Must contain `platforms`, `status`, and `publish_date` fields.
- **receipt.yaml**: Automatically generated during publishing (tracks per-platform progress), archived in `06_sent` after sending. Records publishing status, links, and timestamps.
