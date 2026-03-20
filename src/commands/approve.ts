import chalk from 'chalk';
import fs from 'fs-extra';
import * as path from 'path';
import type { PipelineEngine } from '../core/pipeline.js';
import { sanitizePath } from '../utils/path.js';
import { DRAFT_FILENAME, MASTER_FILENAME } from '../core/constants.js';

export async function approveCommand(
  engine: PipelineEngine,
  article: string,
): Promise<void> {
  const safeName = sanitizePath(article);

  await engine.initPipeline();

  // Verify draft exists
  const draftDir = engine.getProjectPath('02_drafts', safeName);
  if (!await fs.pathExists(draftDir)) {
    throw new Error(`Draft "${safeName}" not found in 02_drafts`);
  }

  // Move project from 02_drafts to 03_master
  const result = await engine.moveProject(safeName, '02_drafts', '03_master');

  // Rename draft.md to master.md in the target
  const masterDir = engine.getProjectPath('03_master', result.project);
  const draftFile = path.join(masterDir, DRAFT_FILENAME);
  const masterFile = path.join(masterDir, MASTER_FILENAME);

  if (await fs.pathExists(draftFile)) {
    await fs.rename(draftFile, masterFile);
  }

  console.log(chalk.green(`✅ Approved: "${safeName}" promoted to 03_master/${result.project}`));
}
