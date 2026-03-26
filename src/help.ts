import { Command, Help } from 'commander';

/**
 * Command group definitions for organized help output.
 * Order within each group determines display order.
 */
const COMMAND_GROUPS: Array<{ title: string; commands: string[] }> = [
  {
    title: 'Quick Start',
    commands: ['go', 'new', 'status', 'publish'],
  },
  {
    title: 'Pipeline Steps',
    commands: ['draft', 'approve', 'refine', 'adapt', 'schedule', 'rollback'],
  },
  {
    title: 'System',
    commands: ['init', 'workspace', 'watch', 'analytics', 'asset', 'mcp'],
  },
];

/** All grouped command names for fast lookup. */
const GROUPED_COMMANDS = new Set(COMMAND_GROUPS.flatMap(g => g.commands));

/**
 * Build the full command reference text for --help --all.
 * Returns structured plain text suitable for both humans and AI agents.
 */
export function buildFullReference(program: Command): string {
  const help = new Help();
  const lines: string[] = [];

  lines.push(`reach — ReachForge CLI Reference`);
  lines.push('');
  lines.push('Workflow: inbox → draft → approve → refine → adapt → schedule → publish');
  lines.push('');

  const allCommands = help.visibleCommands(program);

  for (const group of COMMAND_GROUPS) {
    lines.push(`## ${group.title}`);
    lines.push('');

    for (const cmdName of group.commands) {
      const cmd = allCommands.find(c => c.name() === cmdName);
      if (!cmd) continue;

      const term = help.subcommandTerm(cmd);
      const desc = help.subcommandDescription(cmd);
      lines.push(`  ${term}`);
      lines.push(`    ${desc}`);

      // Show options for this command
      const cmdHelp = new Help();
      const opts = cmdHelp.visibleOptions(cmd).filter(o => !['help', 'version'].includes(o.long?.replace('--', '') ?? ''));
      if (opts.length > 0) {
        for (const opt of opts) {
          lines.push(`    ${cmdHelp.optionTerm(opt).padEnd(28)} ${cmdHelp.optionDescription(opt)}`);
        }
      }
      lines.push('');
    }
  }

  // Show ungrouped commands (if any new command was added but not grouped)
  const ungrouped = allCommands.filter(c => !GROUPED_COMMANDS.has(c.name()) && c.name() !== 'help');
  if (ungrouped.length > 0) {
    lines.push('## Other');
    lines.push('');
    for (const cmd of ungrouped) {
      lines.push(`  ${help.subcommandTerm(cmd)}`);
      lines.push(`    ${help.subcommandDescription(cmd)}`);
      lines.push('');
    }
  }

  lines.push('Global Options:');
  const globalOpts = help.visibleOptions(program)
    .filter(o => !['help', 'version', 'all'].includes(o.long?.replace('--', '') ?? ''));
  for (const opt of globalOpts) {
    lines.push(`  ${help.optionTerm(opt).padEnd(28)} ${help.optionDescription(opt)}`);
  }
  lines.push('');
  lines.push('MCP Integration:  reach mcp (structured tool discovery for AI agents)');
  lines.push('Full manual:      man reach (if installed globally)');

  return lines.join('\n');
}

/**
 * Configure grouped help display on the given Commander program.
 */
export function configureGroupedHelp(program: Command): void {
  program.configureHelp({
    formatHelp(cmd: Command, helper: Help): string {
      // Only customize top-level help, not subcommand help
      if (cmd.parent) {
        return Help.prototype.formatHelp.call(helper, cmd, helper);
      }

      const lines: string[] = [];

      // Header
      lines.push(helper.commandDescription(cmd));
      lines.push('');
      lines.push(`Usage: ${helper.commandUsage(cmd)}`);
      lines.push('');
      lines.push('Workflow: inbox → draft → approve → refine → adapt → schedule → publish');
      lines.push('');

      const allCommands = helper.visibleCommands(cmd);
      const padWidth = helper.padWidth(cmd, helper);

      for (const group of COMMAND_GROUPS) {
        lines.push(`${group.title}:`);
        for (const cmdName of group.commands) {
          const sub = allCommands.find(c => c.name() === cmdName);
          if (!sub) continue;
          const term = helper.subcommandTerm(sub).padEnd(padWidth);
          const desc = helper.subcommandDescription(sub);
          lines.push(`  ${term}  ${desc}`);
        }
        lines.push('');
      }

      // Show any ungrouped commands
      const ungrouped = allCommands.filter(c => !GROUPED_COMMANDS.has(c.name()) && c.name() !== 'help');
      if (ungrouped.length > 0) {
        lines.push('Other:');
        for (const sub of ungrouped) {
          const term = helper.subcommandTerm(sub).padEnd(padWidth);
          const desc = helper.subcommandDescription(sub);
          lines.push(`  ${term}  ${desc}`);
        }
        lines.push('');
      }

      // Global options
      lines.push('Global Options:');
      const globalOpts = helper.visibleOptions(cmd);
      const optPad = helper.longestOptionTermLength(cmd, helper);
      for (const opt of globalOpts) {
        const term = helper.optionTerm(opt).padEnd(optPad);
        const desc = helper.optionDescription(opt);
        lines.push(`  ${term}  ${desc}`);
      }
      lines.push('');

      lines.push('For full command reference:  reach --help --all');
      lines.push('');

      return lines.join('\n');
    },
  });
}
