const assert = require('assert');

describe('Number comparisons', function() {
  it('equality comparison', function() {
    assert.strictEqual(2 + 2, 4);
  });

  it('greater-than comparison', function() {
    assert.ok(5 > 3);
  });

  it('less-than comparison', function() {
    assert.ok(3 < 5);
  });
});