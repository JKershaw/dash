/**
 * ANSI color helpers (no external library)
 */

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  boldCyan: '\x1b[1;36m',
  boldGreen: '\x1b[1;32m',
  boldRed: '\x1b[1;31m',
  boldYellow: '\x1b[1;33m',
  boldWhite: '\x1b[1;37m',
};

export function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

export function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`;
}

export function red(text: string): string {
  return `${ANSI.red}${text}${ANSI.reset}`;
}

export function green(text: string): string {
  return `${ANSI.green}${text}${ANSI.reset}`;
}

export function yellow(text: string): string {
  return `${ANSI.yellow}${text}${ANSI.reset}`;
}

export function cyan(text: string): string {
  return `${ANSI.cyan}${text}${ANSI.reset}`;
}

export function boldCyan(text: string): string {
  return `${ANSI.boldCyan}${text}${ANSI.reset}`;
}

export function boldGreen(text: string): string {
  return `${ANSI.boldGreen}${text}${ANSI.reset}`;
}

export function boldRed(text: string): string {
  return `${ANSI.boldRed}${text}${ANSI.reset}`;
}
