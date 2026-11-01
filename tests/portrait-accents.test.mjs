import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORTRAIT_ACCENTS, renderPortraitAccent } from '../src/portrait-accents.js';
import { mountPortraitDecor } from '../src/portrait-decor.js';
import { renderSite } from '../src/render-site.js';

const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url)));

test('all fifteen portraits retain individual artwork-bound accents after reordering', () => {
  assert.equal(site.porkies.length, 15);
  const accents = site.porkies.map(p => renderPortraitAccent(p.image));
  assert.equal(new Set(accents).size, 15);
  assert.equal(new Set(Object.values(PORTRAIT_ACCENTS).map(a => a.motif)).size, 15);
  const html = renderSite({ ...site, porkies: [...site.porkies].reverse() });
  assert.equal((html.match(/class="portrait-accent"/g) ?? []).length, 15);
  for (const accent of accents) {
    assert.ok(accent.includes('aria-hidden="true"'));
    assert.ok(html.includes(accent));
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('unrecognized or replaced artwork does not receive an incorrectly aligned accent', () => {
  for (const src of ['', '/porkies/new.webp', '/uploads/xiaozhu.webp', 'https://example.com/porkies/xiaozhu.webp', '/porkies/<script>.webp']) {
    assert.equal(renderPortraitAccent(src), '');
  }
  assert.ok(renderPortraitAccent('/porkies/xiaozhu.png'));
});

function environment(hostname = 'www.cochonnetvilla.ca', search = '') {
  const attributes = new Set();
  const makeEvents = () => {
    const listeners = new Map();
    return {
      listeners,
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: name => listeners.delete(name),
    };
  };
  return {
    root: {
      toggleAttribute(name, active) { active ? attributes.add(name) : attributes.delete(name); },
      removeAttribute: name => attributes.delete(name),
      hasAttribute: name => attributes.has(name),
    },
    location: { hostname, search }, window: makeEvents(), document: makeEvents(),
  };
}

test('portrait state follows midnight and resume, and cleanup removes timers and listeners', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-11-01T03:59:59Z') });
  const env = environment();
  const active = () => env.root.hasAttribute('data-portrait-decor');
  const stop = mountPortraitDecor(env);
  assert.equal(active(), false);
  t.mock.timers.tick(1010);
  assert.equal(active(), true);
  t.mock.timers.setTime(Date.parse('2026-11-02T05:00:00Z'));
  env.window.listeners.get('pageshow')();
  assert.equal(active(), false);
  stop();
  assert.equal(env.window.listeners.size, 0);
  assert.equal(env.document.listeners.size, 0);
  t.mock.timers.setTime(Date.parse('2027-11-01T05:00:00Z'));
  t.mock.timers.tick(61000);
  assert.equal(active(), false);
});

test('decor preview works only on loopback and never persists or overrides the public calendar', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-30T12:00:00Z') });
  for (const [host, expected] of [['127.0.0.1', true], ['localhost', true], ['[::1]', true], ['www.cochonnetvilla.ca', false], ['localhost.example.com', false]]) {
    const env = environment(host, '?decor=on');
    const stop = mountPortraitDecor(env);
    assert.equal(env.root.hasAttribute('data-portrait-decor'), expected, host);
    stop();
  }
  t.mock.timers.setTime(Date.parse('2026-11-01T12:00:00Z'));
  for (const [host, expected] of [['localhost', false], ['www.cochonnetvilla.ca', true]]) {
    const env = environment(host, '?decor=off');
    const stop = mountPortraitDecor(env);
    assert.equal(env.root.hasAttribute('data-portrait-decor'), expected);
    stop();
  }
});
