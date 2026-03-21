import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import { AdapterFactory } from '../llm/factory.js';
import { sanitizePath } from '../utils/path.js';
import { MASTER_FILENAME, PLATFORM_VERSIONS_DIR } from '../core/constants.js';
import { TemplateResolver } from '../core/templates.js';
import { jsonSuccess } from '../core/json-output.js';

const DEFAULT_PLATFORMS = ['x', 'wechat', 'zhihu'];

export async function adaptCommand(
  engine: PipelineEngine,
  article: string,
  options: { platforms?: string; force?: boolean; json?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);
  if (!options.json) console.log(chalk.cyan(`🤖 Starting AI adaptation for "${safeName}"...`));

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

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('adapt', { projectDir });
  const meta = await engine.metadata.readMeta('03_master', safeName).catch(() => null);
  const templateResolver = new TemplateResolver(projectDir);

  // Parallel adaptation via Promise.all
  const results = await Promise.all(
    platforms.map(async (platform) => {
      const versionPath = `${engine.getProjectPath('04_adapted', safeName)}/${PLATFORM_VERSIONS_DIR}/${platform}.md`;

      // Skip existing unless --force
      if (!options.force && await fs.pathExists(versionPath)) {
        if (!options.json) console.log(chalk.yellow(`  ⏭ ${platform}.md already exists, skipping (use --force to overwrite)`));
        return { platform, skipped: true };
      }

      const skills = await resolver.resolve('adapt', platform);
      const resolved = await templateResolver.resolveAdaptPrompt(platform, meta?.template);
      const prompt = `${resolved.prompt}\n\n${content}`;

      const result = await adapter.execute({
        prompt,
        cwd: projectDir,
        skillPaths: skills.map(s => s.path),
        sessionId: null,
        timeoutSec: 120,
        extraArgs: [],
      });

      if (!result.success) {
        throw new Error(`Adaptation for ${platform} failed: ${result.errorMessage ?? 'Unknown error'}`);
      }

      await engine.writeProjectFile('04_adapted', `${safeName}/${PLATFORM_VERSIONS_DIR}`, `${platform}.md`, result.content);
      if (!options.json) console.log(chalk.dim(`  ✔ ${platform} adaptation complete`));
      return { platform, skipped: false };
    })
  );

  await engine.metadata.writeMeta('04_adapted', safeName, {
    article: safeName,
    status: 'adapted',
    adapted_platforms: platforms,
  });

  if (options.json) {
    const adaptedItems = results.filter(r => !r.skipped).map(r => r.platform);
    process.stdout.write(jsonSuccess('adapt', {
      article: safeName,
      adaptedPlatforms: platforms,
      stage: '04_adapted' as const,
      items: adaptedItems,
    }));
    return;
  }

  const adapted = results.filter(r => !r.skipped).length;
  console.log(chalk.green(`✅ Adaptation complete! ${adapted}/${platforms.length} platforms. Check 04_adapted/${safeName}/${PLATFORM_VERSIONS_DIR}/`));
}
