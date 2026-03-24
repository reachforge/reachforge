import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import { AdapterFactory } from '../llm/factory.js';
import { sanitizePath } from '../utils/path.js';
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

  // Read master: 03_master/{article}.md
  const masterFile = engine.getArticlePath('03_master', safeName);
  if (!await fs.pathExists(masterFile)) {
    throw new Error(`Master article not found at 03_master/${safeName}.md`);
  }
  const content = await fs.readFile(masterFile, 'utf-8');

  const meta = await engine.metadata.readArticleMeta(safeName);

  // Platform resolution: CLI flag > meta > project.yaml > default
  let platforms: string[];
  if (options.platforms) {
    platforms = options.platforms.split(',').map(p => p.trim());
  } else {
    const projectPlatforms = meta?.adapted_platforms;
    if (projectPlatforms && projectPlatforms.length > 0) {
      platforms = projectPlatforms;
    } else {
      const { readProjectConfig } = await import('../core/project-config.js');
      const projConfig = await readProjectConfig(engine.projectDir);
      platforms = projConfig?.platforms && projConfig.platforms.length > 0
        ? projConfig.platforms
        : DEFAULT_PLATFORMS;
    }
  }

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('adapt', { projectDir });
  const templateResolver = new TemplateResolver(projectDir);

  // Parallel adaptation via Promise.all
  const results = await Promise.all(
    platforms.map(async (platform) => {
      const versionPath = engine.getArticlePath('04_adapted', safeName, platform);

      // Skip existing unless --force
      if (!options.force && await fs.pathExists(versionPath)) {
        if (!options.json) console.log(chalk.yellow(`  ⏭ ${safeName}.${platform}.md already exists, skipping (use --force to overwrite)`));
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
        timeoutSec: 300,
        extraArgs: [],
      });

      if (!result.success) {
        throw new Error(`Adaptation for ${platform} failed: ${result.errorMessage ?? 'Unknown error'}`);
      }

      // Write flat file: 04_adapted/{article}.{platform}.md
      await engine.writeArticleFile('04_adapted', safeName, result.content, platform);
      if (!options.json) console.log(chalk.dim(`  ✔ ${platform} adaptation complete`));
      return { platform, skipped: false };
    })
  );

  await engine.metadata.writeArticleMeta(safeName, {
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
  console.log(chalk.green(`✅ Adaptation complete! ${adapted}/${platforms.length} platforms. Check 04_adapted/`));
}
