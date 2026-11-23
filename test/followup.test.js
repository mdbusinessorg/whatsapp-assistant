process.env.GROQ_API_KEY ||= 'test';
process.env.WEB_TOKEN ||= 'test';
process.env.ASSISTANT_MODE = 'business';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'wa-test-'));
const test = require('node:test');
const assert = require('node:assert');
const { dueLeads, inBusinessHours } = require('../src/sales/followup');
const { blank } = require('../src/sales/profiles');
const { compute } = require('../src/sales/analytics');

const pol = { followUpHours: [24, 72, 168], maxFollowUps: 3, followUpMinScore: 30 };

test('20 conversas paradas: follow-up só quando permitido (consentimento, frequência, máximo)', () => {
  const H = 3600e3, now = Date.UTC(2026, 10, 23, 12);
  const mk = (o) => ({ ...blank(o.id), score: 50, lastCustomerAt: now - o.h * H, lastBotAt: now - o.h * H + 60000, ...o });
  const cases = [
    [{ id: 1, h: 25 }, true], [{ id: 2, h: 10 }, false], [{ id: 3, h: 30, optOut: true }, false], [{ id: 4, h: 30, declined: true }, false],
    [{ id: 5, h: 30, score: 10 }, false], [{ id: 6, h: 30, status: 'won' }, false], [{ id: 7, h: 30, status: 'lost' }, false],
    [{ id: 8, h: 50, followUps: [{ at: now - 26 * H }] }, false], [{ id: 9, h: 73, followUps: [{ at: now - 49 * H }] }, true],
    [{ id: 10, h: 100, followUps: [{ at: now - 76 * H }, { at: now - 28 * H }] }, false],
    [{ id: 11, h: 170, followUps: [{ at: now - 146 * H }, { at: now - 98 * H }] }, true],
    [{ id: 12, h: 300, followUps: [{ at: now - 270 * H }, { at: now - 200 * H }, { at: now - 100 * H }] }, false],
    [{ id: 13, h: 30, lastBotAt: now - 31 * H }, false], [{ id: 14, h: 24 }, true], [{ id: 15, h: 23.9 }, false],
    [{ id: 16, h: 48, score: 30 }, true], [{ id: 17, h: 48, score: 29 }, false], [{ id: 18, h: 200 }, true],
    [{ id: 19, h: 80, followUps: [{ at: now - 100 * H }] }, true], [{ id: 20, h: 30, optOut: true, score: 90 }, false],
  ];
  const due = new Set(dueLeads(cases.map(([o]) => mk(o)), now, pol).map((l) => l.jid));
  assert.deepStrictEqual(cases.filter(([o, exp]) => due.has(o.id) !== exp).map(([o]) => o.id), []);
});

test('follow-ups só em horário comercial de Angola', () => {
  assert.ok(inBusinessHours(Date.UTC(2026, 10, 23, 10)));
  assert.ok(!inBusinessHours(Date.UTC(2026, 10, 23, 22)));
});

test('analytics só com dados reais', () => {
  const a = blank('x'), b = blank('y');
  Object.assign(a, { status: 'won', products: ['Website Profissional'], category: 'ready', followUps: [{ at: 1 }], recovered: true });
  Object.assign(b, { objections: [{ type: 'price' }], category: 'hot', score: 65 });
  const d = compute([a, b]);
  assert.strictEqual(d.total, 2);
  assert.strictEqual(d.won, 1);
  assert.strictEqual(d.conversionRate, 50);
  assert.strictEqual(d.recovered, 1);
  assert.deepStrictEqual(d.topObjections, [['price', 1]]);
  assert.deepStrictEqual(compute([]).leads, []);
});
