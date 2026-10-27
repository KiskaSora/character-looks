import assert from 'node:assert/strict';
import { siteUrls, parseLooks, normalizeMine, upsertMine, removeMine, cleanDesc } from '../src/looks.js';

assert.equal(siteUrls(''), null);
assert.equal(siteUrls('   '), null);
assert.deepEqual(siteUrls('example.github.io/w'), { site: 'https://example.github.io/w/', data: 'https://example.github.io/w/wardrobe.json' });
assert.deepEqual(siteUrls('https://x.io/a/index.html?q=1'), { site: 'https://x.io/a/', data: 'https://x.io/a/wardrobe.json' });
assert.deepEqual(siteUrls('https://x.io/a/data.json'), { site: 'https://x.io/a/', data: 'https://x.io/a/data.json' });

assert.deepEqual(parseLooks({ looks: [{ id: 1, name: ' Сора ', desc: 'a\r\n\r\n\r\nb' }, { name: 'no id' }, null] }), [{ id: '1', name: 'Сора', desc: 'a\n\nb' }]);
assert.deepEqual(parseLooks(null), []);
assert.equal(cleanDesc('  x   y  '), 'x y');

let n = 0;
const mk = () => 'my:' + (++n);
let r = upsertMine([], { name: 'Сора', desc: '1girl, long hair' }, mk);
assert.equal(r.list.length, 1);
assert.equal(r.look.id, 'my:1');
r = upsertMine(r.list, { name: 'Нил', desc: 'boy' }, mk);
assert.equal(r.list.length, 2);
r = upsertMine(r.list, { id: 'my:1', name: 'Сора', desc: 'short hair' }, mk);
assert.equal(r.list.length, 2);
assert.equal(r.list[0].desc, 'short hair');
assert.equal(r.list[0].id, 'my:1'); // id не меняется — пункт в Context Builder находится по нему
assert.throws(() => upsertMine(r.list, { name: '', desc: 'x' }, mk));
assert.throws(() => upsertMine(r.list, { name: 'x', desc: '  ' }, mk));
assert.deepEqual(removeMine(r.list, 'my:1').map(x => x.id), ['my:2']);
assert.deepEqual(normalizeMine([{ id: 'a', name: '', desc: 'd' }, { id: 'a' }, 'bad', null]), [{ id: 'a', name: 'Без имени', desc: 'd' }]);
assert.deepEqual(normalizeMine('nope'), []);
console.log('looks: PASS');
