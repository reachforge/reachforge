# aphype SOP (Standard Operating Procedure) - Bun/TS Version

As the Editor-in-Chief of `aphype`, your task is to manage "file flow". AI is responsible for performing "content transformation".

### 🛠️ CLI Commands

1. **`aphype status`** (View Dashboard)
   - Scan `01-06` directories.
   - Count current "Work in Progress" (WIP) items.
   - Remind tasks to be published today.

2. **`aphype draft <source>`** (Generate Draft)
   - Read from `01_inbox`.
   - Call AI to generate a long-form article and save it to `02_drafts`.

3. **`aphype adapt <article>`** (Multi-platform Adaptation)
   - The final draft must be moved to `03_master` first.
   - The script reads the master draft and generates `.md` files for all platforms in `04_adapted/article-name/platform_versions/`.

4. **`aphype schedule <article> <date>`** (Set Schedule)
   - Move the adapted directory to `05_scheduled`.
   - Force rename to `YYYY-MM-DD-title` format.

5. **`aphype publish`** (Execute Distribution)
   - Check date: if the folder date <= today.
   - **Automatic**: Call X, Dev.to API, or Postiz Bridge to send.
   - **Archive**: Move the entire folder to `06_sent`.
   - **Generate Receipt**: Append `receipt.yaml` inside the folder.

### 📁 File Standards
- **Meta.yaml**: Must contain `platforms`, `status`, and `publish_date` fields.
- **Receipt.json**: Automatically generated in `06_sent` after sending, recording publishing links and time taken.
