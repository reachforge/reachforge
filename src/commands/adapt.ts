import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import { AdapterFactory } from '../llm/factory.js';
import { sanitizePath } from '../utils/path.js';
import { TemplateResolver } from '../core/templates.js';
import { jsonSuccess } from '../core/json-output.js';
import { LANGUAGE_NAMES } from '../core/constants.js';
import { ProviderLoader } from '../providers/loader.js';

const DEFAULT_PLATFORMS = ['x', 'wechat', 'zhihu'];

/**
 * Resolve the target language for a platform.
 * Priority: --lang override > provider default. 'auto' means no language instruction.
 */
function resolveTargetLanguage(platform: string, providerLoader: ProviderLoader, langOverride?: string): string {
  if (langOverride) return langOverride;
  return providerLoader.getLanguage(platform);
}

/**
 * Build a language instruction for the adapt prompt.
 * Returns empty string for 'auto' (let the LLM decide based on content).
 */
function buildLanguageInstruction(targetLanguage: string): string {
  if (targetLanguage === 'auto') return '';
  const targetName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
  return `Output MUST be in ${targetName}. Translate the content if it is in a different language.`;
}

export async function adaptCommand(
  engine: PipelineEngine,
  article: string,
  options: { platforms?: string; lang?: string; force?: boolean; json?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);
  if (!options.json) console.log(chalk.cyan(`🤖 Starting AI adaptation for "${safeName}"...`));

  await engine.initPipeline();

  // Read draft: 01_drafts/{article}.md
  const draftFile = engine.getArticlePath('01_drafts', safeName);
  if (!await fs.pathExists(draftFile)) {
    throw new Error(`Article not found at 01_drafts/${safeName}.md`);
  }
  const content = await fs.readFile(draftFile, 'utf-8');

  const meta = await engine.metadata.readArticleMeta(safeName);

  // Platform resolution: CLI flag > project.yaml > default
  const { readProjectConfig } = await import('../core/project-config.js');
  const projConfig = await readProjectConfig(engine.projectDir);

  let platforms: string[];
  if (options.platforms) {
    platforms = options.platforms.split(',').map(p => p.trim());
  } else {
    platforms = projConfig?.platforms && projConfig.platforms.length > 0
      ? projConfig.platforms
      : DEFAULT_PLATFORMS;
  }

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('adapt', { projectDir });
  const templateResolver = new TemplateResolver(projectDir);
  // ProviderLoader for language resolution (empty config OK — only need language defaults)
  const providerLoader = new ProviderLoader({});

  // Parallel adaptation via Promise.allSettled (partial failure safe)
  const settled = await Promise.allSettled(
    platforms.map(async (platform) => {
      const versionPath = engine.getArticlePath('02_adapted', safeName, platform);

      // Skip existing unless --force
      if (!options.force && await fs.pathExists(versionPath)) {
        if (!options.json) console.log(chalk.yellow(`  ⏭ ${safeName}.${platform}.md already exists, skipping (use --force to overwrite)`));
        return { platform, skipped: true, failed: false };
      }

      const skills = await resolver.resolve('adapt', platform);
      const resolved = await templateResolver.resolveAdaptPrompt(platform, meta?.template);

      // Inject language instruction into the prompt
      const targetLang = resolveTargetLanguage(platform, providerLoader, options.lang);
      const langInstruction = buildLanguageInstruction(targetLang);
      const prompt = langInstruction
        ? `${resolved.prompt}\n\nLanguage: ${langInstruction}\n\n${content}`
        : `${resolved.prompt}\n\n${content}`;

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

      // Write flat file: 02_adapted/{article}.{platform}.md
      await engine.writeArticleFile('02_adapted', safeName, result.content, platform);
      const targetName = LANGUAGE_NAMES[targetLang] ?? targetLang;
      if (!options.json) console.log(chalk.dim(`  ✔ ${platform} (${targetName}) adaptation complete`));
      return { platform, skipped: false, failed: false };
    })
  );

  // Collect results: succeeded, skipped, and failed
  const succeeded: string[] = [];
  const skipped: string[] = [];
  const failures: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      if (s.value.skipped) skipped.push(platforms[i]);
      else succeeded.push(platforms[i]);
    } else {
      failures.push(platforms[i]);
      if (!options.json) console.log(chalk.red(`  ✘ ${platforms[i]}: ${s.reason?.message ?? 'Unknown error'}`));
    }
  }

  // Merge with existing adapted_platforms (additive — only add succeeded platforms)
  const existingMeta = await engine.metadata.readArticleMeta(safeName);
  const existingPlatforms = existingMeta?.adapted_platforms ?? [];
  const mergedPlatforms = [...new Set([...existingPlatforms, ...succeeded, ...skipped])];

  await engine.metadata.writeArticleMeta(safeName, {
    status: 'adapted',
    adapted_platforms: mergedPlatforms,
  });

  if (options.json) {
    process.stdout.write(jsonSuccess('adapt', {
      article: safeName,
      adaptedPlatforms: mergedPlatforms,
      stage: '02_adapted' as const,
      items: succeeded,
      failed: failures,
    }));
    return;
  }

  const total = succeeded.length + skipped.length + failures.length;
  if (failures.length > 0) {
    console.log(chalk.yellow(`⚠ Adaptation partial: ${succeeded.length}/${total} succeeded, ${failures.length} failed. Retry failed platforms with --force.`));
  } else {
    console.log(chalk.green(`✅ Adaptation complete! ${succeeded.length + skipped.length}/${total} platforms. Check 02_adapted/`));
  }
}
