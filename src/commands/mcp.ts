import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';

export async function mcpCommand(
  engine: PipelineEngine,
  apcore: any,
  serve: Function,
  options: { port?: string; transport?: string } = {},
): Promise<void> {
  const port = parseInt(options.port || '8000', 10);
  const transport = options.transport || 'stdio';

  console.log(chalk.blue.bold(`\n🔌 Launching reach MCP Server (Transport: ${transport})...`));

  await serve(apcore, {
    name: 'reach',
    version: '0.1.0',
    transport: transport as any,
    port,
    explorer: true,
    explorerProjectName: 'reach',
  });
}
