import { Liquid } from 'liquidjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PLATFORMS = ['shopify', 'recharge'] as const;
export type Platform = (typeof PLATFORMS)[number];

const NAME_RE = /^[a-z0-9-]+$/;

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function isSafeName(value: string): boolean {
  return NAME_RE.test(value);
}

/* ------------------------------------------------------------------ */
/* Liquid engine with Shopify filter shims                             */
/* ------------------------------------------------------------------ */
/* LiquidJS is close to Shopify's Liquid but not identical. These       */
/* shims cover the Shopify-only filters the templates use. Local        */
/* preview is the design loop; Shopify's preview and a real test order  */
/* are the final check.                                                 */

function formatMoney(cents: unknown): string {
  const value = Number(cents ?? 0) / 100;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

type Address = {
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province_code?: string;
  zip?: string;
  country?: string;
};

export function createEngine(): Liquid {
  const engine = new Liquid({
    root: [ROOT],
    extname: '.liquid',
    strictVariables: false,
    strictFilters: true,
  });

  engine.registerFilter('money', (cents: unknown) => formatMoney(cents));
  engine.registerFilter('money_with_currency', (cents: unknown) => `${formatMoney(cents)} USD`);
  engine.registerFilter('money_without_currency', (cents: unknown) =>
    (Number(cents ?? 0) / 100).toFixed(2),
  );

  // Shopify: {{ line | img_url: 'compact_cropped' }} or {{ image | img_url: '200x200' }}
  engine.registerFilter('img_url', (input: unknown) => {
    if (!input) return '';
    if (typeof input === 'string') return input;
    const obj = input as { image?: unknown; src?: string };
    if (obj.image) return typeof obj.image === 'string' ? obj.image : (obj.image as { src?: string }).src ?? '';
    return obj.src ?? '';
  });

  engine.registerFilter('format_address', (input: unknown) => {
    if (!input) return '';
    const a = input as Address;
    const name = a.name ?? [a.first_name, a.last_name].filter(Boolean).join(' ');
    const cityLine = [a.city, a.province_code, a.zip].filter(Boolean).join(' ');
    return [name, a.company, a.address1, a.address2, cityLine, a.country].filter(Boolean).join('<br>');
  });

  engine.registerFilter('shopify_asset_url', (input: unknown) => String(input ?? ''));

  return engine;
}

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

export function templatePath(platform: Platform, name: string): string {
  return join(ROOT, platform, `${name}.liquid`);
}

export function listTemplates(platform: Platform): string[] {
  const dir = join(ROOT, platform);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.liquid'))
    .map((f) => f.replace(/\.liquid$/, ''))
    .sort();
}

/* Shopify notifications can't include snippets, so {% include %} tags   */
/* are inlined into one paste-ready file. Preview renders the flattened  */
/* output too, so what you see is exactly what you paste.                */

const INCLUDE_RE = /\{%-?\s*include\s+['"]([^'"]+)['"]\s*-?%\}/g;

export function flatten(file: string, stack: string[] = []): string {
  if (stack.includes(file)) {
    throw new Error(`Include cycle: ${[...stack, file].join(' -> ')}`);
  }
  const source = readFileSync(file, 'utf8');
  return source.replace(INCLUDE_RE, (_match, name: string) => {
    const target = join(ROOT, name.endsWith('.liquid') ? name : `${name}.liquid`);
    if (!existsSync(target)) {
      throw new Error(`Missing include "${name}" referenced in ${file.replace(ROOT + '/', '')}`);
    }
    return flatten(target, [...stack, file]);
  });
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */
/* A fixture can start from another with "$extends": "order-paid" and  */
/* override only what changes. Objects merge deeply; arrays and          */
/* primitives replace. Use null to remove a field from the base.        */

type Json = Record<string, unknown>;

export type FixtureInfo = { name: string; description: string };

function isPlainObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: Json, override: Json): Json {
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] =
      isPlainObject(value) && isPlainObject(base[key])
        ? deepMerge(base[key] as Json, value)
        : value;
  }
  return out;
}

function readFixture(platform: Platform, name: string): Json {
  const file = join(ROOT, 'fixtures', platform, `${name}.json`);
  if (!existsSync(file)) throw new Error(`Fixture not found: fixtures/${platform}/${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Json;
}

function loadMerged(platform: Platform, name: string, stack: string[]): Json {
  if (stack.includes(name)) throw new Error(`Fixture $extends cycle: ${[...stack, name].join(' -> ')}`);
  const raw = readFixture(platform, name);
  const { $extends, $description: _description, ...rest } = raw;
  const base = typeof $extends === 'string' ? loadMerged(platform, $extends, [...stack, name]) : {};
  return deepMerge(base, rest);
}

export function loadFixture(platform: Platform, name: string): Json {
  const data = loadMerged(platform, name, []);

  // Shopify exposes subtotal_line_items (all lines except tips). Default it
  // from line_items so fixtures only have to define one list. Applied after
  // merging so a child fixture's line_items always win.
  if (platform === 'shopify' && data.subtotal_line_items === undefined && Array.isArray(data.line_items)) {
    data.subtotal_line_items = data.line_items;
  }
  return data;
}

export function listFixtures(platform: Platform): FixtureInfo[] {
  const dir = join(ROOT, 'fixtures', platform);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const name = f.replace(/\.json$/, '');
      const raw = readFixture(platform, name);
      return { name, description: String(raw.$description ?? '') };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function defaultFixture(platform: Platform): string | undefined {
  const fixtures = listFixtures(platform);
  return (fixtures.find((f) => f.name === 'order-paid') ?? fixtures[0])?.name;
}

/* ------------------------------------------------------------------ */
/* Render                                                               */
/* ------------------------------------------------------------------ */

export async function renderTemplate(
  engine: Liquid,
  platform: Platform,
  name: string,
  fixture?: string,
): Promise<string> {
  const source = flatten(templatePath(platform, name));
  const data = fixture ? loadFixture(platform, fixture) : {};
  return engine.parseAndRender(source, data);
}
