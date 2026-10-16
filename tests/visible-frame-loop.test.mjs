import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisibleFrameLoop } from '../src/utils/visibleFrameLoop.ts';

test('frames pause for hidden/offscreen/covered views and resume without catch-up', () => {
  const saved = Object.fromEntries(['document', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const document = new EventTarget(); document.hidden = false;
  let intersect;
  const frames = new Map(); let serial = 0;
  let disconnected = false;
  globalThis.document = document;
  globalThis.IntersectionObserver = class {
    constructor(callback) { intersect = callback; }
    observe() {} disconnect() { disconnected = true; }
  };
  globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  let enabled = true, draws = 0, lastDelta = 0;
  const element = { dataset: {}, getClientRects: () => [{}] };
  try {
    const loop = createVisibleFrameLoop(element, (_time, delta) => { draws++; lastDelta = delta; }, () => enabled);
    assert.equal(element.dataset.rendering, 'running'); assert.equal(frames.size, 1);
    loop.sync(); assert.equal(frames.size, 1); // no duplicate loops
    const advance = time => { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time); };
    advance(performance.now() + 16); assert.equal(draws, 1);
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(frames.size, 0); assert.equal(element.dataset.rendering, 'paused');
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    advance(performance.now() + 3600000);
    assert.ok(lastDelta <= 0.1); assert.equal(draws, 2);
    intersect([{ isIntersecting: false }]); assert.equal(frames.size, 0);
    intersect([{ isIntersecting: true }]); assert.equal(frames.size, 1);
    enabled = false; loop.sync(); assert.equal(frames.size, 0);
    enabled = true; loop.sync(); assert.equal(frames.size, 1);
    loop.dispose(); assert.equal(frames.size, 0); assert.ok(disconnected);
    document.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 0);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
