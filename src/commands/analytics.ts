import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import type { Receipt } from '../types/index.js';
import { validateDate } from '../utils/path.js';

interface PlatformStats {
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

export interface AnalyticsResult {
  totalProjects: number;
  dateRange: { from: string | null; to: string | null };
  platforms: Record<string, PlatformStats>;
  overallSuccess: number;
  overallTotal: number;
}

export async function collectAnalytics(
  engine: PipelineEngine,
  options: { from?: string; to?: string } = {},
): Promise<AnalyticsResult> {
  if (options.from && !validateDate(options.from)) {
    throw new Error(`Invalid --from date "${options.from}". Must be YYYY-MM-DD.`);
  }
  if (options.to && !validateDate(options.to)) {
    throw new Error(`Invalid --to date "${options.to}". Must be YYYY-MM-DD.`);
  }

  const projects = await engine.listProjects('06_sent');
  const platforms: Record<string, PlatformStats> = {};
  let totalProjects = 0;

  for (const project of projects) {
    let receipt: Receipt | null = null;
    try {
      receipt = await engine.metadata.readReceipt('06_sent', project);
    } catch {
      continue; // skip corrupted receipts
    }
    if (!receipt) continue;

    // Date filtering
    const pubDate = receipt.published_at?.split('T')[0];
    if (options.from && pubDate && pubDate < options.from) continue;
    if (options.to && pubDate && pubDate > options.to) continue;

    totalProjects++;

    for (const item of receipt.items) {
      if (!platforms[item.platform]) {
        platforms[item.platform] = { total: 0, success: 0, failed: 0, successRate: 0 };
      }
      const stats = platforms[item.platform];
      stats.total++;
      if (item.status === 'success') stats.success++;
      else if (item.status === 'failed') stats.failed++;
    }
  }

  // Compute rates
  let overallSuccess = 0;
  let overallTotal = 0;
  for (const stats of Object.values(platforms)) {
    stats.successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
    overallSuccess += stats.success;
    overallTotal += stats.total;
  }

  return {
    totalProjects,
    dateRange: { from: options.from ?? null, to: options.to ?? null },
    platforms,
    overallSuccess,
    overallTotal,
  };
}

export async function analyticsCommand(
  engine: PipelineEngine,
  options: { from?: string; to?: string; json?: boolean } = {},
): Promise<void> {
  await engine.initPipeline();
  const result = await collectAnalytics(engine, options);

  if (options.json) {
    process.stdout.write(jsonSuccess('analytics', result));
    return;
  }

  if (result.totalProjects === 0) {
    console.log(chalk.gray('No published items found in 06_sent.'));
    return;
  }

  console.log(chalk.blue.bold('\n  Publishing Analytics\n'));

  if (result.dateRange.from || result.dateRange.to) {
    const from = result.dateRange.from ?? 'all';
    const to = result.dateRange.to ?? 'now';
    console.log(chalk.dim(`  Period: ${from} to ${to}\n`));
  }

  // Per-platform stats
  const sortedPlatforms = Object.entries(result.platforms).sort((a, b) => b[1].total - a[1].total);
  for (const [platform, stats] of sortedPlatforms) {
    const rateColor = stats.successRate >= 80 ? chalk.green : stats.successRate >= 50 ? chalk.yellow : chalk.red;
    console.log(`  ${chalk.white(platform.padEnd(12))} ${rateColor(`${stats.successRate}%`)} success  (${stats.success}/${stats.total})`);
  }

  // Overall
  const overallRate = result.overallTotal > 0 ? Math.round((result.overallSuccess / result.overallTotal) * 100) : 0;
  const overallColor = overallRate >= 80 ? chalk.green.bold : overallRate >= 50 ? chalk.yellow.bold : chalk.red.bold;
  console.log(`\n  ${overallColor(`Overall: ${overallRate}% success`)} (${result.overallSuccess}/${result.overallTotal} across ${result.totalProjects} project(s))\n`);
}
