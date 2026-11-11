import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, listTemplates, loadFixture, templatePath } from './lib.ts';
import { flattenRecharge, renderRecharge } from './recharge.ts';

const config = flattenRecharge(join(ROOT, 'shared/config.liquid'));
const component = (name: string) => flattenRecharge(join(ROOT, 'shared/components', name));
const accountUrl = 'https://porradanutra.com/account';

function paragraphs(html: string): { style: string; text: string }[] {
  return [...html.matchAll(/<p\b[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, style, text]) => ({ style, text: text.replace(/<[^>]+>/g, '').trim() }));
}

function anchors(html: string): { href: string; style: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, href, style, text]) => ({ href, style, text: text.replace(/<[^>]+>/g, '').trim() }));
}

async function fixtureHtml(template: string, fixture: string): Promise<string> {
  return renderRecharge(flattenRecharge(templatePath('recharge', template)), loadFixture('recharge', template, fixture));
}

test('Recharge rendering rejects an unguarded missing variable', async () => {
  await assert.rejects(renderRecharge('{{ missing_recharge_variable }}', {}), /UndefinedError:.*missing_recharge_variable/);
});

test('detail and total rows accept omitted emphasis on first use', async () => {
  const detail = await renderRecharge(config + component('detail.liquid'), {
    detail_label: 'Question', detail_value: 'Answer',
  });
  assert.match(paragraphs(detail).find(row => row.text === 'Answer')?.style ?? '', /font-size:12px/);
  const total = await renderRecharge(config + component('total-row.liquid'), {
    total_label: 'Subtotal', total_value: '$12.00',
  });
  assert.match(paragraphs(total).find(row => row.text === '$12.00')?.style ?? '', /font-size:12px/);
});

test('detail defaults survive a preceding captured card', async () => {
  const detail = component('detail.liquid');
  const source = config + `
    {% set card_body %}
      {% set detail_label = 'Status' %}{% set detail_value = 'Active' %}
      {% set detail_emphasis = true %}${detail}
    {% endset %}
    {{ card_body }}
    {% set detail_label = 'Question' %}{% set detail_value = 'Answer' %}${detail}`;
  const rows = paragraphs(await renderRecharge(source, {}));
  assert.match(rows.find(row => row.text === 'Active')?.style ?? '', /font-size:16px/);
  assert.match(rows.find(row => row.text === 'Answer')?.style ?? '', /font-size:12px/);
});

test('merchant information does not enable legal terms without its optional flag', async () => {
  const html = await renderRecharge(config + component('recharge-merchant-info.jinja'), {
    shop_address: 'Porrada warehouse', shop_legal_text: '<p>Optional legal terms</p>',
  });
  assert(html.includes('Porrada warehouse'));
  assert(!html.includes('Optional legal terms'));
});

test('every Recharge template handles absent and sparse payloads with the configured colors and account route', async () => {
  const sparse = {
    tone: 'dark', unknown_optional_field: 'ignored',
    line_items: [{}], line_item_modifications: [{}],
    customer: {}, charge: { line_items: [{}], shipping_address: {} },
  };
  for (const name of listTemplates('recharge')) {
    const source = flattenRecharge(templatePath('recharge', name));
    for (const [scenario, context] of [['empty', {}], ['sparse', sparse]] as const) {
      const html = await renderRecharge(source, context);
      const label = `${name}/${scenario}`;
      assert.match(html, /<body\b[^>]*bgcolor="#FFFFFF"[^>]*color:#000000;/, label);
      assert.match(html, /<h1\b[^>]*color:#000000;/, label);
      assert.match(html, /<h2\b[^>]*color:#FFFFFF;/, label);
      const accountLinks = anchors(html).filter(link => /^(?:Manage your subscription|View your account|Go to your account|Open your account|Update payment method)$/.test(link.text));
      assert(accountLinks.length > 0, `${label}: missing account action`);
      for (const link of accountLinks) {
        assert.equal(link.href, accountUrl, label);
        assert.match(link.style, /color:#FFFFFF;/, label);
      }
      assert(!html.includes('$0.00'), `${label}: missing amounts became zero`);
    }
  }
});

test('zero amounts stay visible while missing currency and final totals stay absent', async () => {
  for (const [template, fixture] of [
    ['subscription-activation', 'zero-amounts'],
    ['subscription-recurring-charge-confirmation', 'zero-amount'],
    ['upcoming-order-email', 'zero-totals'],
  ]) {
    assert.match(await fixtureHtml(template, fixture), /(?:\$)?0\.00/, `${template}/${fixture}`);
  }
  for (const [template, fixture] of [
    ['subscription-activation', 'currency-unavailable'],
    ['subscription-recurring-charge-confirmation', 'amount-without-currency'],
    ['upcoming-order-email', 'no-currency'],
  ]) {
    const html = await fixtureHtml(template, fixture);
    assert(!html.includes('$'), `${template}/${fixture}: invented dollar amount`);
    assert(!html.includes('USD'), `${template}/${fixture}: invented currency`);
  }
  const noTotal = await fixtureHtml('upcoming-order-email', 'no-total');
  assert(!paragraphs(noTotal).some(row => row.text === 'Upcoming total'));
  assert(paragraphs(noTotal).some(row => row.text === 'Taxes'));
});
