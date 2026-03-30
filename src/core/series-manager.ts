import * as path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { SERIES_DIR } from './constants.js';
import { SeriesSchema, type Series, type SeriesStatus } from '../types/series.js';
import { ReachforgeError } from '../types/index.js';
import type { PipelineEngine } from './pipeline.js';

/** Valid state transitions: from → allowed next states */
const STATE_TRANSITIONS: Record<SeriesStatus, SeriesStatus[]> = {
  planned: ['outlined'],
  outlined: ['outline_approved'],
  outline_approved: ['detailed'],
  detailed: ['detail_approved'],
  detail_approved: ['drafting'],
  drafting: ['drafting', 'completed'],
  completed: [],
};

export class SeriesManager {
  private readonly seriesDir: string;

  constructor(private readonly projectDir: string) {
    this.seriesDir = path.join(projectDir, SERIES_DIR);
  }

  async ensureDir(): Promise<void> {
    await fs.ensureDir(this.seriesDir);
  }

  async readSeries(name: string): Promise<Series> {
    const filePath = path.join(this.seriesDir, `${name}.yaml`);
    if (!await fs.pathExists(filePath)) {
      throw new ReachforgeError(
        `Series "${name}" not found`,
        `Expected file: ${SERIES_DIR}/${name}.yaml`,
      );
    }
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(raw);
    const result = SeriesSchema.safeParse(parsed);
    if (!result.success) {
      throw new ReachforgeError(
        `Invalid series file: ${SERIES_DIR}/${name}.yaml`,
        result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return result.data;
  }

  async writeSeries(name: string, series: Series): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.seriesDir, `${name}.yaml`);
    const content = yaml.dump(series, { lineWidth: -1, noRefs: true, sortKeys: false });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async listSeries(): Promise<Array<{ name: string; title: string; articleCount: number; status: SeriesStatus }>> {
    if (!await fs.pathExists(this.seriesDir)) return [];
    const files = await fs.readdir(this.seriesDir);
    const results: Array<{ name: string; title: string; articleCount: number; status: SeriesStatus }> = [];
    for (const file of files) {
      if (!file.endsWith('.yaml')) continue;
      const name = file.replace('.yaml', '');
      try {
        const series = await this.readSeries(name);
        results.push({ name, title: series.title, articleCount: series.articles.length, status: series.status });
      } catch {
        // skip invalid files
      }
    }
    return results;
  }

  async scaffoldSeries(name: string, topic: string): Promise<Series> {
    const series: Series = {
      name,
      title: topic,
      description: '',
      audience: '',
      tone: 'professional',
      language: 'en',
      status: 'planned',
      articles: [],
    };
    await this.writeSeries(name, series);
    return series;
  }

  async transitionStatus(name: string, to: SeriesStatus): Promise<Series> {
    const series = await this.readSeries(name);
    const allowed = STATE_TRANSITIONS[series.status];
    if (!allowed.includes(to)) {
      const hints: Record<string, string> = {
        outlined: `Run: reach series outline ${name}`,
        outline_approved: `Review the outline, then run: reach series approve ${name} --outline`,
        detailed: `Run: reach series detail ${name}`,
        detail_approved: `Review the outlines, then run: reach series approve ${name} --detail`,
        drafting: `Run: reach series draft ${name}`,
      };
      throw new ReachforgeError(
        `Cannot transition "${name}" from "${series.status}" to "${to}"`,
        hints[to] ?? `Current status "${series.status}" does not allow this operation`,
      );
    }
    series.status = to;
    await this.writeSeries(name, series);
    return series;
  }

  calculateSchedule(series: Series): Map<string, string> {
    const schedule = series.schedule;
    if (!schedule) {
      throw new ReachforgeError(
        `Series "${series.name}" has no schedule configuration`,
        'Add a schedule block to series.yaml: schedule: { start: "YYYY-MM-DD", interval: "7d" }',
      );
    }

    const startDate = new Date(schedule.start);
    if (isNaN(startDate.getTime())) {
      throw new ReachforgeError(
        `Series schedule has invalid start date: "${schedule.start}"`,
        'Use ISO format: schedule: { start: "YYYY-MM-DD", interval: "7d" }',
      );
    }
    const intervalDays = this.parseIntervalDays(schedule.interval);
    const result = new Map<string, string>();

    for (const article of series.articles) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + intervalDays * (article.order - 1));
      result.set(article.slug, date.toISOString().split('T')[0]);
    }

    return result;
  }

  async assembleContext(
    series: Series,
    articleSlug: string,
    engine: PipelineEngine,
  ): Promise<string> {
    const article = series.articles.find(a => a.slug === articleSlug);
    if (!article) {
      throw new ReachforgeError(
        `Article "${articleSlug}" not found in series "${series.name}"`,
        'Check the slug in series.yaml',
      );
    }

    const parts: string[] = [];

    // 1. Master outline
    parts.push(`You are writing article ${article.order} of ${series.articles.length} in a series titled "${series.title}".`);
    parts.push('');
    if (series.outline) {
      parts.push('Series overview (approved outline):');
      parts.push(series.outline.trim());
      parts.push('');
    }

    // 2. All article titles + synopses
    parts.push('Series structure:');
    for (const a of series.articles) {
      const marker = a.slug === articleSlug ? '→' : '-';
      parts.push(`${marker} ${a.order}. ${a.title}: ${a.synopsis}`);
    }
    parts.push('');

    // 3. Current article outline
    parts.push(`Your task: Write article ${article.order}: "${article.title}"`);
    parts.push('');
    if (article.outline) {
      parts.push('Detailed outline for this article:');
      parts.push(article.outline.trim());
      parts.push('');
    }

    // 4. Previous 1-2 articles' summaries (first 200 words)
    const preceding = series.articles
      .filter(a => a.order < article.order)
      .sort((a, b) => b.order - a.order)
      .slice(0, 2);

    if (preceding.length > 0) {
      parts.push('For continuity, here is a summary of the preceding article(s):');
      for (const prev of preceding.reverse()) {
        try {
          const draftPath = engine.getArticlePath('01_drafts', prev.slug);
          if (await fs.pathExists(draftPath)) {
            const content = await fs.readFile(draftPath, 'utf-8');
            const words = content.split(/\s+/).slice(0, 200).join(' ');
            parts.push(`"${prev.title}": ${words}...`);
          } else {
            parts.push(`"${prev.title}": ${prev.synopsis}`);
          }
        } catch {
          parts.push(`"${prev.title}": ${prev.synopsis}`);
        }
      }
      parts.push('');
    }

    // 5. Guidelines
    parts.push('Guidelines:');
    parts.push('- Follow the approved outline closely');
    parts.push('- Maintain consistent terminology with the series overview');
    if (series.audience) parts.push(`- Target audience: ${series.audience}`);
    if (series.tone) parts.push(`- Tone: ${series.tone}`);

    return parts.join('\n');
  }

  findNextUndraftedArticle(series: Series, draftedSlugs: Set<string>): string | null {
    for (const article of series.articles.sort((a, b) => a.order - b.order)) {
      if (!draftedSlugs.has(article.slug)) {
        return article.slug;
      }
    }
    return null;
  }

  private parseIntervalDays(interval: string): number {
    const match = interval.match(/^(\d+)d$/);
    if (!match) {
      throw new ReachforgeError(
        `Invalid schedule interval: "${interval}"`,
        'Use format like "7d" for 7 days',
      );
    }
    return Number(match[1]);
  }
}
