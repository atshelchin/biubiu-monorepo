/**
 * Utility functions for examples
 */

// ANSI color codes
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Alias for convenience
export const c = colors;

export function log(message: string) {
  const time = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`${colors.dim}[${time}]${colors.reset} ${message}`);
}

export function success(message: string) {
  log(`${colors.green}✓${colors.reset} ${message}`);
}

export function error(message: string) {
  log(`${colors.red}✗${colors.reset} ${message}`);
}

export function warn(message: string) {
  log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

export function info(message: string) {
  log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

export function header(title: string) {
  console.log();
  console.log(`${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
  console.log();
}

export function section(title: string) {
  console.log();
  console.log(`${colors.bright}${colors.magenta}── ${title} ${'─'.repeat(50 - title.length)}${colors.reset}`);
  console.log();
}

export function taskStatus(
  id: string,
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused',
  details?: string
) {
  const statusColors = {
    pending: colors.dim,
    running: colors.yellow,
    completed: colors.green,
    failed: colors.red,
    paused: colors.blue,
  };
  const statusIcons = {
    pending: '○',
    running: '◐',
    completed: '●',
    failed: '✗',
    paused: '❚❚',
  };
  const color = statusColors[status];
  const icon = statusIcons[status];
  const detailStr = details ? ` ${colors.dim}(${details})${colors.reset}` : '';
  log(`  ${color}${icon}${colors.reset} ${colors.bright}${id}${colors.reset}${detailStr}`);
}

export function jobStatus(
  status: 'start' | 'complete' | 'failed' | 'retry',
  jobId: string,
  details?: string
) {
  const statusColors = {
    start: colors.yellow,
    complete: colors.green,
    failed: colors.red,
    retry: colors.magenta,
  };
  const statusIcons = {
    start: '→',
    complete: '✓',
    failed: '✗',
    retry: '↻',
  };
  const color = statusColors[status];
  const icon = statusIcons[status];
  const detailStr = details ? ` ${colors.dim}${details}${colors.reset}` : '';
  log(`  ${color}${icon}${colors.reset} ${jobId}${detailStr}`);
}

export function metrics(data: Record<string, string | number>) {
  const entries = Object.entries(data);
  const parts = entries.map(([k, v]) => `${colors.dim}${k}:${colors.reset} ${colors.bright}${v}${colors.reset}`);
  log(`  ${parts.join('  │  ')}`);
}

export function progress(current: number, total: number, label?: string) {
  const width = 30;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  const percent = Math.round((current / total) * 100);
  const labelStr = label ? ` ${label}` : '';
  log(`  ${colors.cyan}${bar}${colors.reset} ${percent}%${labelStr}`);
}

export function concurrencyIndicator(current: number, max: number) {
  const width = 20;
  const filled = Math.round((current / max) * width);
  const empty = width - filled;
  const bar = `${'▓'.repeat(filled)}${'░'.repeat(empty)}`;
  log(`  ${colors.yellow}并发${colors.reset} ${bar} ${current}/${max}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}min`;
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(date: Date): string {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function progressBar(current: number, total: number, prefix: string, extra?: string) {
  const width = 30;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  const percent = Math.round((current / total) * 100);
  const extraStr = extra ? ` ${colors.dim}${extra}${colors.reset}` : '';
  process.stdout.write(`\r${colors.dim}[${prefix}]${colors.reset} ${colors.cyan}${bar}${colors.reset} ${percent}%${extraStr}    `);
}

export function spinner(text: string): { stop: () => void } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${colors.cyan}${frames[i]}${colors.reset} ${text}`);
    i = (i + 1) % frames.length;
  }, 80);

  return {
    stop: () => {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(text.length + 3) + '\r');
    },
  };
}
