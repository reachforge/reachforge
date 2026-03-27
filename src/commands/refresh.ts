import chalk from 'chalk';
import fs from 'fs-extra';
import * as path from 'path';
import type { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import { sanitizePath } from '../utils/path.js';
import { ReachforgeError } from '../types/index.js';

/**
 * Refresh a published article: copy it back to 01_drafts for re-editing.
 * The original stays in 03_published (archive). A fresh copy is placed in 01_drafts.
 * Metadata is reset to 'drafted' with publish results preserved for reference.
 */
export async function refreshCommand(
  engine: PipelineEngine,
  article: string,
  options: { json?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);
  await engine.initPipeline();

  // Find the article — check 03_published first, then 02_adapted
  let sourceStage: '03_published' | '02_adapted' | null = null;
  const publishedFiles = await engine.getArticleFiles(safeName, '03_published');
  if (publishedFiles.length > 0) {
    sourceStage = '03_published';
  } else {
    const adaptedFiles = await engine.getArticleFiles(safeName, '02_adapted');
    if (adaptedFiles.length > 0) {
      sourceStage = '02_adapted';
    }
  }

  if (!sourceStage) {
    throw new ReachforgeError(
      `Article "${safeName}" not found in 03_published or 02_adapted`,
      'Only published or adapted articles can be refreshed.',
    );
  }

  // Find the base content: prefer {article}.md (base), fallback to first platform file
  const files = await engine.getArticleFiles(safeName, sourceStage);
  const baseFile = files.find(f => f === `${safeName}.md`);
  const sourceFile = baseFile || files[0];
  const sourcePath = path.join(engine.projectDir, sourceStage, sourceFile);
  const content = await fs.readFile(sourcePath, 'utf-8');

  // Check for collision in 01_drafts
  const draftPath = engine.getArticlePath('01_drafts', safeName);
  if (await fs.pathExists(draftPath)) {
    throw new ReachforgeError(
      `Article "${safeName}" already exists in 01_drafts`,
      'Remove or rename the existing draft first, or use reach refine to edit it.',
    );
  }

  // Write to 01_drafts
  await engine.writeArticleFile('01_drafts', safeName, content);

  // Reset metadata: set to drafted, clear publish-specific fields
  await engine.metadata.writeArticleMeta(safeName, {
    status: 'drafted',
    schedule: undefined,
    adapted_platforms: undefined,
  } as Record<string, unknown>);

  if (options.json) {
    process.stdout.write(jsonSuccess('refresh', {
      article: safeName,
      from: sourceStage,
      to: '01_drafts',
    }));
    return;
  }

  console.log(chalk.green(`✅ Refreshed "${safeName}" from ${sourceStage} → 01_drafts. Ready for re-editing.`));
  console.log(chalk.dim(`  Next: reach refine ${safeName} -f "update with latest info"`));
}
