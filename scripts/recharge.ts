import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_RE = /\{%-?\s*include\s+['"]([^'"]+)['"]\s*-?%\}/g;
const PATH_RE = /^[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*$/;

// Shared Liquid is a deliberately small build-time language here. The output
// contains only standard Jinja and Recharge's documented money filter; it does
// not depend on a custom filter, macro, or include installed in Recharge.
function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let quote = '';
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === separator) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote) throw new Error(`Unclosed string in shared Liquid: ${value}`);
  parts.push(value.slice(start).trim());
  return parts;
}

function atom(value: string): string {
  if (/^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")$/.test(value)) return value;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  if (value === 'nil' || value === 'null') return 'none';
  if (['true', 'false'].includes(value) || PATH_RE.test(value)) return value;
  throw new Error(`Unsupported shared Liquid expression: ${value}`);
}

function expression(value: string): string {
  const [input, ...filters] = splitOutsideQuotes(value, '|');
  let output = atom(input);
  for (const filter of filters) {
    const [name, ...args] = splitOutsideQuotes(filter, ':');
    if (name === 'escape' && args.length === 0) output = `(${output}) | e`;
    else if (name === 'append' && args.length === 1) output = `(${output} ~ ${atom(args[0])})`;
    else throw new Error(`Unsupported shared Liquid filter: ${filter}`);
  }
  return output;
}

function condition(value: string): string {
  const tokenRe = /\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*|-?\d+(?:\.\d+)?|==|!=|>=|<=|[><()])\s*/gy;
  const tokens: string[] = [];
  while (tokenRe.lastIndex < value.length) {
    const match = tokenRe.exec(value);
    if (!match) throw new Error(`Unsupported shared Liquid condition: ${value}`);
    tokens.push(match[1]);
  }
  const output: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (['==', '!='].includes(tokens[i + 1]) && tokens[i + 2] === 'blank') {
      const input = atom(token);
      // Liquid blank includes undefined, null, false, empty containers and
      // whitespace-only text. This uses standard Jinja tests, not a shim.
      const blank = `(${input} is undefined or ${input} is none or ${input} is sameas false or (${input} is string and ${input} | trim == '') or (${input} is sequence and ${input} is not string and ${input} | length == 0) or (${input} is mapping and ${input} | length == 0))`;
      output.push(tokens[i + 1] === '!=' ? `(not ${blank})` : blank);
      i += 2;
    } else if (['and', 'or', 'not', '==', '!=', '>=', '<=', '>', '<', '(', ')'].includes(token)) output.push(token);
    else if (token === 'blank') throw new Error(`Unsupported blank comparison: ${value}`);
    else output.push(atom(token));
  }
  return output.join(' ');
}

export function compileSharedLiquid(source: string, filename: string): string {
  try {
    // Strip Liquid comments before scanning so documentation can mention tags.
    const clean = source.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
    return clean.replace(/\{\{(-?)([\s\S]*?)(-?)\}\}|\{%(-?)([\s\S]*?)(-?)%\}/g,
      (_match, outputLeft: string | undefined, output: string | undefined, outputRight: string | undefined,
        tagLeft: string | undefined, tag: string | undefined, tagRight: string | undefined) => {
        if (output !== undefined) return `{{${outputLeft} ${expression(output.trim())} ${outputRight}}}`;
        const text = tag!.trim();
        const match = /^(\w+)(?:\s+([\s\S]*))?$/.exec(text);
        if (!match) throw new Error(`Unsupported shared Liquid tag: ${text}`);
        const [, name, arg = ''] = match;
        let translated: string;
        if (name === 'assign') {
          const assignment = /^([a-zA-Z_]\w*)\s*=\s*([\s\S]+)$/.exec(arg);
          if (!assignment) throw new Error(`Unsupported shared Liquid assignment: ${arg}`);
          translated = `set ${assignment[1]} = ${expression(assignment[2])}`;
        } else if (name === 'capture' && /^[a-zA-Z_]\w*$/.test(arg)) translated = `set ${arg}`;
        else if (name === 'include' && /^['"][a-zA-Z0-9_./-]+['"]$/.test(arg)) translated = `include ${arg}`;
        else if (name === 'endcapture' && !arg) translated = 'endset';
        else if (name === 'if' || name === 'elsif') translated = `${name === 'elsif' ? 'elif' : 'if'} ${condition(arg)}`;
        else if (['else', 'endif'].includes(name) && !arg) translated = name;
        else throw new Error(`Unsupported shared Liquid tag: ${text}`);
        return `{%${tagLeft} ${translated} ${tagRight}%}`;
      });
  } catch (error) {
    throw new Error(`${filename.replace(ROOT + '/', '')}: ${(error as Error).message}`);
  }
}

export function flattenRecharge(file: string, stack: string[] = []): string {
  const absolute = resolve(file);
  if (!absolute.startsWith(ROOT + '/')) throw new Error(`Include outside project: ${file}`);
  if (stack.includes(absolute)) throw new Error(`Include cycle: ${[...stack, absolute].join(' -> ')}`);
  const source = readFileSync(absolute, 'utf8');
  // Compile each shared file before expansion: native Jinja files never pass
  // through the Liquid translator, and unsupported Liquid fails immediately.
  const compiled = extname(absolute) === '.liquid' ? compileSharedLiquid(source, absolute) : source;
  const flat = compiled.replace(INCLUDE_RE, (_match, name: string) => {
    const targets = extname(name) ? [join(ROOT, name)] : [join(ROOT, `${name}.jinja`), join(ROOT, `${name}.liquid`)];
    const target = targets.find(existsSync);
    if (!target) throw new Error(`Missing include "${name}" referenced in ${absolute.replace(ROOT + '/', '')}`);
    return flattenRecharge(target, [...stack, absolute]);
  });
  if (/\{%-?\s*(?:include|import|from|extends)\b/.test(flat)) {
    throw new Error(`Recharge output must be self-contained; unsupported dynamic include or import in ${absolute.replace(ROOT + '/', '')}`);
  }
  return flat;
}

function runJinja(source: string, context: Record<string, unknown>, validateOnly = false): Promise<string> {
  const python = process.env.PORRADA_PYTHON ?? join(ROOT, '.venv', 'bin', 'python');
  if (!existsSync(python)) throw new Error('Recharge preview requires Jinja2. Run npm run setup:recharge first.');
  return new Promise((resolveResult, reject) => {
    const child = spawn(python, [join(ROOT, 'scripts', 'recharge-render.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Recharge Jinja rendering timed out.')); }, 30_000);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveResult(stdout);
      else reject(new Error(stderr.trim() || `Recharge renderer exited with code ${code}`));
    });
    child.stdin.on('error', () => { /* process failure is reported by close */ });
    child.stdin.end(JSON.stringify({ source, context, validate_only: validateOnly }));
  });
}

export async function validateRecharge(source: string): Promise<void> {
  await runJinja(source, {}, true);
}

export function renderRecharge(source: string, context: Record<string, unknown>): Promise<string> {
  return runJinja(source, context);
}
