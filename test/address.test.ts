import { describe, expect, it } from 'vitest';
import { checkPrefix, normalizeAddress } from '../src/shared/address';

describe('前缀校验', () => {
  it.each(['abc', 'john.doe', 'a_b-c', 'x'.repeat(32), 'k3j9x2ab'])('合法: %s', (p) => {
    expect(checkPrefix(p)).toBeNull();
  });
  it.each([
    ['ab', 'length'],
    ['x'.repeat(33), 'length'],
    ['Abc', 'chars'],
    ['a+b', 'chars'],
    ['中文前缀', 'chars'],
    ['.abc', 'dots'],
    ['a..b', 'dots'],
    ['admin', 'reserved'],
    ['postmaster', 'reserved'],
    ['abuse', 'reserved'],
    ['support', 'reserved'],
  ])('非法: %s → %s', (p, err) => {
    expect(checkPrefix(p)).toBe(err);
  });
  it('额外保留前缀', () => {
    expect(checkPrefix('boss', ['boss'])).toBe('reserved');
  });
});

describe('完整地址', () => {
  it('转小写并校验域名', () => {
    expect(normalizeAddress('Hello.World@Example.com', 'example.com')).toBe('hello.world@example.com');
    expect(normalizeAddress('hello@other.com', 'example.com')).toBeNull();
    expect(normalizeAddress('admin@example.com', 'example.com')).toBeNull();
    expect(normalizeAddress('@example.com', 'example.com')).toBeNull();
  });
});
