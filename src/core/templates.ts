import * as path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { z } from 'zod';
import { TEMPLATES_DIR } from './constants.js';
import { DEFAULT_DRAFT_PROMPT, PLATFORM_PROMPTS } from '../llm/types.js';
import { basePlatform } from './filename-parser.js';

export const TemplateFileSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['draft', 'adapt']),
  platform: z.string().optional(),
  prompt: z.string().min(1),
  vars: z.record(z.string(), z.string()).optional(),
});

export type TemplateFile = z.infer<typeof TemplateFileSchema>;

export interface ResolvedPrompt {
  prompt: string;
  source: 'template' | 'built-in';
  templateName?: string;
}

export class TemplateResolver {
  private readonly projectTemplatesDir: string;
  private readonly workspaceTemplatesDir: string;

  constructor(projectDir: string, workspaceDir?: string) {
    this.projectTemplatesDir = path.join(projectDir, TEMPLATES_DIR);
    this.workspaceTemplatesDir = workspaceDir
      ? path.join(workspaceDir, TEMPLATES_DIR)
      : '';
  }

  async resolve(templateName: string): Promise<TemplateFile | null> {
    // Project templates take priority
    for (const dir of [this.projectTemplatesDir, this.workspaceTemplatesDir]) {
      if (!dir) continue;
      const filePath = path.join(dir, `${templateName}.yaml`);
      if (await fs.pathExists(filePath)) {
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          const parsed = yaml.load(raw);
          const result = TemplateFileSchema.safeParse(parsed);
          if (result.success) return result.data;
        } catch {
          // Skip invalid template files
        }
      }
    }
    return null;
  }

  async resolveDraftPrompt(templateName?: string): Promise<ResolvedPrompt> {
    if (templateName) {
      const tmpl = await this.resolve(templateName);
      if (tmpl && tmpl.type === 'draft') {
        return {
          prompt: TemplateResolver.interpolate(tmpl.prompt, tmpl.vars ?? {}),
          source: 'template',
          templateName: tmpl.name,
        };
      }
    }
    return { prompt: DEFAULT_DRAFT_PROMPT, source: 'built-in' };
  }

  async resolveAdaptPrompt(platform: string, templateName?: string): Promise<ResolvedPrompt> {
    // 1. Check explicit template from meta
    if (templateName) {
      const tmpl = await this.resolve(templateName);
      if (tmpl && tmpl.type === 'adapt' && (!tmpl.platform || tmpl.platform === platform)) {
        return {
          prompt: TemplateResolver.interpolate(tmpl.prompt, tmpl.vars ?? {}),
          source: 'template',
          templateName: tmpl.name,
        };
      }
    }

    // 2. Check convention-based platform template (templates/{platform}.yaml)
    const platformTmpl = await this.resolve(platform);
    if (platformTmpl && platformTmpl.type === 'adapt') {
      return {
        prompt: TemplateResolver.interpolate(platformTmpl.prompt, platformTmpl.vars ?? {}),
        source: 'template',
        templateName: platformTmpl.name,
      };
    }

    // 3. Fall back to built-in (try exact key, then base platform, then generic)
    const builtIn = PLATFORM_PROMPTS[platform]
      ?? PLATFORM_PROMPTS[basePlatform(platform)]
      ?? `Adapt this article for the ${platform} platform.`;
    return { prompt: builtIn, source: 'built-in' };
  }

  async listTemplates(): Promise<TemplateFile[]> {
    const templates: TemplateFile[] = [];
    const seen = new Set<string>();

    for (const dir of [this.projectTemplatesDir, this.workspaceTemplatesDir]) {
      if (!dir || !await fs.pathExists(dir)) continue;
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.yaml')) continue;
        const name = file.replace('.yaml', '');
        if (seen.has(name)) continue; // project overrides workspace
        try {
          const raw = await fs.readFile(path.join(dir, file), 'utf-8');
          const parsed = yaml.load(raw);
          const result = TemplateFileSchema.safeParse(parsed);
          if (result.success) {
            templates.push(result.data);
            seen.add(name);
          }
        } catch {
          // Skip invalid files
        }
      }
    }
    return templates;
  }

  static interpolate(prompt: string, vars: Record<string, string>): string {
    return prompt.replace(/\{(\w+)\}/g, (match, key) => {
      return vars[key] !== undefined ? vars[key] : match;
    });
  }
}
