import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { STAGES } from '../core/constants.js';

export async function statusCommand(engine: PipelineEngine): Promise<void> {
  const status = await engine.getStatus();

  console.log(chalk.blue.bold('\n🚀 aphype Content Factory Dashboard\n'));

  for (const stage of STAGES) {
    const data = status.stages[stage];
    const icon = data.count > 0 ? chalk.green('✔') : chalk.gray('○');
    console.log(`${icon} ${stage.padEnd(15)} : ${chalk.yellow(String(data.count))} items`);
    if (data.count > 0) {
      data.items.forEach((p: string) => console.log(chalk.dim(`   └─ ${p}`)));
    }
  }

  if (status.dueToday.length > 0) {
    console.log(chalk.magenta.bold(`\n📅 Due today: ${status.dueToday.join(', ')}`));
  }

  console.log('');
}
