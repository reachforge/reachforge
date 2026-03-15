import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import type { LLMProvider } from '../llm/types.js';
import { sanitizePath } from '../utils/path.js';
import { MASTER_FILENAME, PLATFORM_VERSIONS_DIR } from '../core/constants.js';

const DEFAULT_PLATFORMS = ['x', 'wechat', 'zhihu'];

export async function adaptCommand(
  engine: PipelineEngine,
  llm: LLMProvider,
  article: string,
  options: { platforms?: string; force?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);
  console.log(chalk.cyan(`🤖 Starting AI adaptation for "${safeName}"...`));

  await engine.initPipeline();

  // Check master.md exists, with helpful error if draft.md exists instead
  const masterPath = engine.getProjectPath('03_master', safeName);
  const masterFile = `${masterPath}/${MASTER_FILENAME}`;
  if (!await fs.pathExists(masterFile)) {
    const draftFile = `${masterPath}/draft.md`;
    if (await fs.pathExists(draftFile)) {
      throw new Error(
        `Master article not found at 03_master/${safeName}/${MASTER_FILENAME}. Did you mean to rename draft.md to master.md?`
      );
    }
    throw new Error(`Master article not found at 03_master/${safeName}/${MASTER_FILENAME}`);
  }

  const content = await fs.readFile(masterFile, 'utf-8');
  const platforms = options.platforms
    ? options.platforms.split(',').map(p => p.trim())
    : DEFAULT_PLATFORMS;

  // Parallel adaptation via Promise.all (fixes Major: sequential API calls)
  const results = await Promise.all(
    platforms.map(async (platform) => {
      const versionPath = `${engine.getProjectPath('04_adapted', safeName)}/${PLATFORM_VERSIONS_DIR}/${platform}.md`;

      // Skip existing unless --force
      if (!options.force && await fs.pathExists(versionPath)) {
        console.log(chalk.yellow(`  ⏭ ${platform}.md already exists, skipping (use --force to overwrite)`));
        return { platform, skipped: true };
      }

      const result = await llm.adapt(content, { platform });
      await engine.writeProjectFile('04_adapted', `${safeName}/${PLATFORM_VERSIONS_DIR}`, `${platform}.md`, result.content);
      console.log(chalk.dim(`  ✔ ${platform} adaptation complete`));
      return { platform, skipped: false };
    })
  );

  await engine.metadata.writeMeta('04_adapted', safeName, {
    article: safeName,
    status: 'adapted',
    adapted_platforms: platforms,
  });

  const adapted = results.filter(r => !r.skipped).length;
  console.log(chalk.green(`✅ Adaptation complete! ${adapted}/${platforms.length} platforms. Check 04_adapted/${safeName}/${PLATFORM_VERSIONS_DIR}/`));
}
