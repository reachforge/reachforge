import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { publishCommand } from './publish.js';
import { logger } from '../utils/logger.js';
import { MIN_WATCH_INTERVAL_MINUTES } from '../core/constants.js';

export async function watchCommand(
  engine: PipelineEngine,
  options: { interval?: string } = {},
): Promise<void> {
  const minutes = parseInt(options.interval || '60', 10);

  if (isNaN(minutes) || minutes < MIN_WATCH_INTERVAL_MINUTES) {
    throw new Error(
      `Invalid interval: ${options.interval}. Minimum is ${MIN_WATCH_INTERVAL_MINUTES} minute(s).`
    );
  }

  const intervalMs = minutes * 60 * 1000;
  console.log(chalk.blue.bold(`\n🕵️  reachforge Daemon is now watching (interval: ${minutes}m)...`));

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    const timestamp = new Date().toLocaleTimeString();
    logger.info(`Checking for due content`, { timestamp });
    try {
      await publishCommand(engine);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Publish tick failed: ${message}`);
      console.error(chalk.red(`❌ Watch tick error: ${message}`));
    }
  };

  // Graceful shutdown handler (fixes Critical: no SIGINT/SIGTERM)
  const shutdown = (signal: string) => {
    console.log(chalk.yellow(`\n🛑 Received ${signal}. Shutting down gracefully...`));
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await tick();
  intervalHandle = setInterval(tick, intervalMs);
}
