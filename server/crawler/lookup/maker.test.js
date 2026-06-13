const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalMaker } = require('./maker');

test('maps Japanese maker names to the canonical key via the dictionary', () => {
  assert.equal(canonicalMaker('トヨタ'), 'toyota');
  assert.equal(canonicalMaker('日産'), 'nissan');
});

test('lowercases unknown / latin makers', () => {
  assert.equal(canonicalMaker('Toyota'), 'toyota');
  assert.equal(canonicalMaker('  BMW '), 'bmw');
});

test('is idempotent on an already-canonical value', () => {
  assert.equal(canonicalMaker('toyota'), 'toyota');
  assert.equal(canonicalMaker('mercedes-benz'), 'mercedes-benz');
});

test('passes through null/empty unchanged', () => {
  assert.equal(canonicalMaker(null), null);
  assert.equal(canonicalMaker(''), '');
});
