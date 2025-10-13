const test = require('node:test');
const assert = require('node:assert/strict');
const pagination = require('../pagination');

test('limit of 0 defaults to 1', () => {
  const result = pagination(0, 0, 10);
  assert.equal(result.perPage, 1);
  assert.equal(result.totalPages, 10);
  assert.equal(result.currentPage, 1);
});

test('negative offset defaults to 0', () => {
  const result = pagination(10, -5, 100);
  assert.equal(result.currentPage, 1);
  assert.equal(result.totalPages, 10);
});

test('handles totalCount of 0', () => {
  const result = pagination(10, 0, 0);
  assert.deepEqual(result, {
    totalPages: 0,
    currentPage: 0,
    totalCount: 0,
    perPage: 10,
  });
});
