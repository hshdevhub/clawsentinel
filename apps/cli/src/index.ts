#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { enableCommand } from './commands/enable.js';
import { disableCommand } from './commands/disable.js';
import { vaultCommand } from './commands/vault.js';

const program = new Command();

program
  .name('clawsentinel')
  .description('The active security layer for OpenClaw — one install, five layers, complete protection.')
  .version('0.1.0');

program.addCommand(initCommand());
program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(statusCommand());
program.addCommand(logsCommand());
program.addCommand(enableCommand());
program.addCommand(disableCommand());
program.addCommand(vaultCommand());

program.parse();
