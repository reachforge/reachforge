# How to Publish a Draft Article on Dev.to

## Problem

When reachforge (or any API client) creates an article on Dev.to with `published: false`, the article is saved as a **draft**. The draft URL works but shows a warning:

> *Unpublished Post. This URL is public but secret, so share at your own discretion.*

The article does not appear in your profile, feeds, or search results. Many users get stuck here because there is **no obvious "Publish" button** on the Dashboard — only "Delete", "Edit", and "Archive".

## Solution

### Option A: Edit Frontmatter (Basic Markdown Editor)

This is the most common case for API-created articles.

1. Go to https://dev.to/dashboard
2. Find your draft (marked with a yellow **Draft** badge)
3. Click **Edit**
4. Scroll to the **top** of the editor — you will see YAML frontmatter:

   ```yaml
   ---
   title: Your Article Title
   published: false
   tags: [ai, webdev]
   ---
   ```

5. Change `published: false` to `published: true`
6. Click **Save changes** at the bottom

The article is now live.

### Option B: Rich Editor (if available)

If you are using Dev.to's rich+markdown editor (configurable in [UX Settings](https://dev.to/settings/customization)):

1. Open the draft in Edit mode
2. Look for a **Publish** button at the bottom-left of the editor (next to "Save draft")
3. Click **Publish** and confirm

> **Note:** API-created articles typically open in the Basic Markdown editor, which does NOT show a Publish button — you must change the frontmatter as described in Option A.

## Why This Happens

Dev.to's API uses two sources for the `published` state:

1. The `published` field in the API request body (`POST /api/articles`)
2. The `published` field in the article's YAML frontmatter

**Frontmatter takes precedence.** Even if the API sends `"published": true`, a frontmatter `published: false` will override it and save the article as a draft.

reachforge v0.2+ handles this correctly by stripping the `published` field from frontmatter before sending, and controlling the state exclusively via the API parameter. If you are using an older version or created the article manually, you may need to fix the frontmatter as described above.

## reachforge-Specific Notes

### Controlling draft vs. published

reachforge provides three levels of control (highest priority first):

| Control | Example | Scope |
|---------|---------|-------|
| CLI flag | `reach publish --draft` | All articles in this publish run |
| Frontmatter | `published: false` in `devto.md` | Single article |
| Default | (no setting) | Published (`true`) |

### Typical workflows

```bash
# Publish as draft for review
reach publish --draft

# Publish live (default)
reach publish

# Per-article control: set in platform_versions/devto.md frontmatter
# published: false  → draft
# published: true   → live
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 on article URL | Article is a draft; URL only works with `?preview=` token | Change `published: true` and save |
| No "Publish" button in editor | Using Basic Markdown editor (default for API articles) | Change frontmatter, not button |
| Article shows "Draft" on Dashboard | `published: false` in frontmatter | Edit → change to `true` → Save |
| Published but not in feed | Dev.to indexing delay | Wait 5-10 minutes; check `/latest` |
