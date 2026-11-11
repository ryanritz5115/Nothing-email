import { existsSync, watch } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
  PLATFORMS,
  ROOT,
  createEngine,
  defaultFixture,
  flatten,
  isPlatform,
  isSafeName,
  listFixtures,
  listTemplates,
  renderTemplate,
  templatePath,
  type Platform,
} from './lib.ts';

const PORT = Number(process.env.PORT ?? 3000);
const engine = createEngine();

/* ------------------------------------------------------------------ */
/* Live reload                                                          */
/* ------------------------------------------------------------------ */

const clients = new Set<ServerResponse>();
let reloadTimer: NodeJS.Timeout | undefined;

for (const dir of ['shared', 'shopify', 'recharge', 'fixtures']) {
  const path = join(ROOT, dir);
  if (!existsSync(path)) continue;
  watch(path, { recursive: true }, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      for (const res of clients) res.write('data: reload\n\n');
    }, 80);
  });
}

/* ------------------------------------------------------------------ */
/* HTML                                                                 */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const shellStyles = `
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f4f4f2;color:#111}
  header{position:sticky;top:0;z-index:2;background:#111;color:#fff;padding:14px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
  header a{color:#bbb;text-decoration:none}
  header a:hover{color:#fff}
  header strong{font-size:15px}
  main{padding:24px}
  h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777;margin:28px 0 10px}
  ul{list-style:none;padding:0;margin:0;display:grid;gap:8px;max-width:560px}
  li a{display:block;background:#fff;border:1px solid #e3e3e0;border-radius:8px;padding:12px 14px;color:#111;text-decoration:none}
  li a:hover{border-color:#77163F}
  .muted{color:#888}
  .pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
  .pill{background:#fff;border:1px solid #ddd;border-radius:999px;padding:6px 12px;color:#333;text-decoration:none;font-size:13px}
  .pill.on{background:#77163F;border-color:#77163F;color:#fff}
  .desc{margin:-8px 0 20px;color:#666}
  .frames{display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap}
  .frame label{display:block;font-size:12px;color:#777;margin-bottom:6px}
  iframe{border:1px solid #ddd;border-radius:12px;background:#fff;height:1600px}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${shellStyles}</style></head><body>${body}
<script>
  const es = new EventSource('/events');
  es.onmessage = () => {
    const frames = document.querySelectorAll('iframe');
    if (frames.length) frames.forEach(f => { f.src = f.src; });
    else location.reload();
  };
</script></body></html>`;
}

function indexPage(): string {
  const sections = PLATFORMS.map((platform) => {
    const templates = listTemplates(platform);
    const items = templates.length
      ? templates.map((t) => `<li><a href="/t/${platform}/${t}">${t}</a></li>`).join('')
      : `<li class="muted">No templates yet</li>`;
    return `<h2>${platform}</h2><ul>${items}</ul>`;
  }).join('');
  return page(
    'Porrada email',
    `<header><strong>Porrada email</strong><span class="muted">Local preview</span></header><main>${sections}</main>`,
  );
}

function templatePage(platform: Platform, name: string, fixture: string | undefined): string {
  const fixtures = listFixtures(platform, name);
  const active = fixtures.find((f) => f.name === fixture);
  const query = fixture ? `?fixture=${encodeURIComponent(fixture)}` : '';

  const pills = fixtures.length
    ? fixtures
        .map(
          (f) =>
            `<a class="pill${f.name === fixture ? ' on' : ''}" title="${escapeHtml(f.description)}" href="/t/${platform}/${name}?fixture=${encodeURIComponent(f.name)}">${f.name}</a>`,
        )
        .join('')
    : `<span class="muted">No fixtures in fixtures/${platform}/${name}/ yet</span>`;

  return page(
    `${name} · ${platform}`,
    `<header>
      <a href="/">&larr; All templates</a>
      <strong>${platform} / ${name}</strong>
      <a href="/src/${platform}/${name}" target="_blank">Paste-ready source</a>
    </header>
    <main>
      <div class="pills">${pills}</div>
      ${active?.description ? `<p class="desc">${escapeHtml(active.description)}</p>` : ''}
      <div class="frames">
        <div class="frame"><label>Mobile · 375px</label><iframe width="375" src="/render/${platform}/${name}${query}"></iframe></div>
        <div class="frame"><label>Desktop · 680px</label><iframe width="680" src="/render/${platform}/${name}${query}"></iframe></div>
      </div>
    </main>`,
  );
}

function errorHtml(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<!doctype html><html><body style="margin:0;padding:20px;font:13px/1.5 ui-monospace,Menlo,monospace;background:#fff4f4;color:#9b1c1c">
<strong>Render error</strong><pre style="white-space:pre-wrap">${escapeHtml(message)}</pre></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Server                                                               */
/* ------------------------------------------------------------------ */

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (parts.length === 0) return send(res, 200, 'text/html', indexPage());

  const [route, platform, name] = parts;
  if (!['t', 'render', 'src'].includes(route) || !platform || !name) {
    return send(res, 404, 'text/plain', 'Not found');
  }
  if (!isPlatform(platform) || !isSafeName(name) || !existsSync(templatePath(platform, name))) {
    return send(res, 404, 'text/plain', `Template not found: ${platform}/${name}`);
  }

  const requested = url.searchParams.get('fixture');
  const fixture = requested && isSafeName(requested) ? requested : defaultFixture(platform, name);

  try {
    if (route === 't') return send(res, 200, 'text/html', templatePage(platform, name, fixture));
    if (route === 'src') return send(res, 200, 'text/plain', flatten(templatePath(platform, name)));
    const html = await renderTemplate(engine, platform, name, fixture);
    return send(res, 200, 'text/html', html);
  } catch (error) {
    return send(res, 200, 'text/html', errorHtml(error));
  }
});

server.listen(PORT, () => {
  console.log(`\n  Porrada email preview  →  http://localhost:${PORT}\n`);
});
