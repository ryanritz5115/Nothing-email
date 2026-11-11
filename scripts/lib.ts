import { Liquid } from 'liquidjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenRecharge, renderRecharge } from './recharge.ts';

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
  // Shopify displays gift card codes in groups of four characters.
  engine.registerFilter('format_code', (input: unknown) =>
    String(input ?? '').replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? '',
  );

  // Shopify: {{ line | img_url: 'compact_cropped' }} or {{ image | img_url: '200x200' }}
  engine.registerFilter('img_url', (input: unknown) => {
    if (!input) return '';
    if (typeof input === 'string') return input;
    const obj = input as { image?: unknown; src?: string };
    if (obj.image) return typeof obj.image === 'string' ? obj.image : (obj.image as { src?: string }).src ?? '';
    return obj.src ?? '';
  });

  engine.registerFilter('shopify_asset_url', (input: unknown) => String(input ?? ''));

  return engine;
}

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

export function templatePath(platform: Platform, name: string): string {
  return join(ROOT, platform, `${name}${templateExtension(platform)}`);
}

export function templateExtension(platform: Platform): '.liquid' | '.jinja' {
  return platform === 'recharge' ? '.jinja' : '.liquid';
}

export function listTemplates(platform: Platform): string[] {
  const dir = join(ROOT, platform);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(templateExtension(platform)))
    .map((f) => f.slice(0, -templateExtension(platform).length))
    .sort();
}

/* Shopify notifications can't include snippets, so {% include %} tags   */
/* are inlined into one paste-ready file. Preview renders the flattened  */
/* output too, so what you see is exactly what you paste.                */

const INCLUDE_RE = /\{%-?\s*include\s+['"]([^'"]+)['"]\s*-?%\}/g;

export function flatten(file: string, stack: string[] = []): string {
  if (file.endsWith('.jinja')) return flattenRecharge(file, stack);
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
/* Fixtures live in fixtures/<platform>/<template>/, one file per        */
/* scenario. A fixture can start from another with "$extends" and        */
/* override only what changes: "order-paid" is a sibling in the same      */
/* folder, "order-confirmation/order-paid" reaches another template's     */
/* folder. Objects merge deeply; arrays and primitives replace. Use null  */
/* to remove a field from the base.                                       */

type Json = Record<string, unknown>;

export type FixtureInfo = { name: string; description: string; isBase: boolean };

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

function fixtureDir(platform: Platform, template: string): string {
  return join(ROOT, 'fixtures', platform, template);
}

/* Resolves an $extends value against the folder of the fixture using it. */
function resolveRef(ref: string, fromFolder: string): { folder: string; name: string } {
  const parts = ref.split('/');
  const [folder, name] = parts.length === 2 ? parts : [fromFolder, parts[0]];
  if (parts.length > 2 || !isSafeName(folder) || !isSafeName(name)) {
    throw new Error(`Invalid fixture reference "${ref}". Use "name" or "template/name".`);
  }
  return { folder, name };
}

function readFixture(platform: Platform, folder: string, name: string): Json {
  const file = join(fixtureDir(platform, folder), `${name}.json`);
  if (!existsSync(file)) throw new Error(`Fixture not found: fixtures/${platform}/${folder}/${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Json;
}

function loadMerged(platform: Platform, folder: string, name: string, stack: string[]): Json {
  const id = `${folder}/${name}`;
  if (stack.includes(id)) throw new Error(`Fixture $extends cycle: ${[...stack, id].join(' -> ')}`);
  const raw = readFixture(platform, folder, name);
  const { $extends, $description: _description, ...rest } = raw;
  let base: Json = {};
  if (typeof $extends === 'string') {
    const ref = resolveRef($extends, folder);
    base = loadMerged(platform, ref.folder, ref.name, [...stack, id]);
  }
  return deepMerge(base, rest);
}

export function loadFixture(platform: Platform, template: string, name: string): Json {
  const data = loadMerged(platform, template, name, []);

  // Shopify exposes subtotal_line_items (all lines except tips). Default it
  // from line_items so fixtures only have to define one list. Applied after
  // merging so a child fixture's line_items always win.
  if (platform === 'shopify' && data.subtotal_line_items === undefined && Array.isArray(data.line_items)) {
    data.subtotal_line_items = data.line_items;
  }
  return data;
}

export function listFixtures(platform: Platform, template: string): FixtureInfo[] {
  const dir = fixtureDir(platform, template);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const name = f.replace(/\.json$/, '');
      const raw = readFixture(platform, template, name);
      // A base fixture starts from nothing or from another template's folder.
      const isBase = typeof raw.$extends !== 'string' || raw.$extends.includes('/');
      return { name, description: String(raw.$description ?? ''), isBase };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function defaultFixture(platform: Platform, template: string): string | undefined {
  const fixtures = listFixtures(platform, template);
  return (fixtures.find((f) => f.isBase) ?? fixtures[0])?.name;
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
  const data = fixture ? loadFixture(platform, name, fixture) : {};
  if (platform === 'recharge') return renderRecharge(source, data);
  return engine.parseAndRender(source, data);
}
