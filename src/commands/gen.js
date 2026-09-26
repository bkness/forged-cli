import { randomBytes, randomInt, randomUUID } from 'crypto';

const green  = '\x1b[32m';
const yellow = '\x1b[33m';
const red    = '\x1b[31m';
const blue   = '\x1b[34m';
const bold   = '\x1b[1m';
const reset  = '\x1b[0m';
const dim    = '\x1b[2m';

const UPPER   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER   = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS  = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?';
const SAFE    = '-_';

// randomInt is uniform; `randomBytes(1)[0] % n` over-weights low indexes
// whenever 256 isn't a multiple of n.
function randomChar(charset) {
  return charset[randomInt(charset.length)];
}

export function generatePassword(length, safe = false) {
  const symbols = safe ? SAFE : SYMBOLS;
  const charset = UPPER + LOWER + DIGITS + symbols;
  const required = [
    randomChar(UPPER),
    randomChar(LOWER),
    randomChar(DIGITS),
    randomChar(symbols),
  ];
  const rest = Array.from({ length: length - required.length }, () => randomChar(charset));
  const all = [...required, ...rest];
  for (let i = all.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

function colorize(password) {
  return password.split('').map(char => {
    if (/[0-9]/.test(char))      return `${yellow}${char}${reset}`;
    if (/[^a-zA-Z0-9]/.test(char)) return `${red}${char}${reset}`;
    return char;
  }).join('');
}

export function generatePin(length) {
  return Array.from({ length }, () => randomInt(10)).join('');
}

// null when no flag given; NaN when the value isn't a whole number
export function parseLength(args) {
  const lenArg = args.find(a => /^(-l=|--length=)/.test(a));
  if (!lenArg) return null;
  const raw = lenArg.split('=')[1];
  return /^\d+$/.test(raw) ? Number(raw) : NaN;
}

export async function genCommand(args) {
  const sub    = args[0];
  const safe   = args.includes('--safe') || args.includes('--ascii');
  const length = parseLength(args);

  if (Number.isNaN(length)) {
    console.log(`  ${red}--length must be a whole number${reset}`);
    return;
  }

  if (!sub || sub === 'help') {
    console.log(`
  ${bold}forged gen${reset} — generate secure credentials

  ${dim}Usage:${reset}
    forged gen pass              Secure password ${dim}(default 20 chars)${reset}
    forged gen pass --safe       ASCII-only, no symbols — safe for routers
    forged gen secret            32-byte hex — JWT secrets, API keys
    forged gen pin               6-digit numeric PIN
    forged gen uuid              UUID v4

  ${dim}Options:${reset}
    --length=N, -l=N             Custom length (pass, pin)
    --safe, --ascii              Letters + numbers only
    `);
    return;
  }

  if (sub === 'pass') {
    const len = length ?? 20;
    if (len < 4) { console.log(`  ${red}Length must be at least 4${reset}`); return; }
    const pass = generatePassword(len, safe);
    console.log(`\n  ${bold}Password${reset}  ${colorize(pass)}`);
    if (safe) console.log(`  ${dim}ASCII-safe — router/device friendly${reset}`);
    console.log();
    return;
  }

  if (sub === 'secret') {
    console.log(`\n  ${bold}Secret${reset}    ${green}${randomBytes(32).toString('hex')}${reset}\n`);
    return;
  }

  if (sub === 'pin') {
    const len = length ?? 6;
    if (len < 1) { console.log(`  ${red}Length must be at least 1${reset}`); return; }
    console.log(`\n  ${bold}PIN${reset}       ${yellow}${generatePin(len)}${reset}\n`);
    return;
  }

  if (sub === 'uuid') {
    console.log(`\n  ${bold}UUID${reset}      ${blue}${randomUUID()}${reset}\n`);
    return;
  }

  console.log(`  ${red}Unknown:${reset} '${sub}' — run ${bold}forged gen help${reset}`);
}
