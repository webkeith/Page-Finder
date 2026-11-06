import { describe, expect, it } from 'vitest';
import { mergeKeywords, parseKeywords } from '@/lib/keywords';

describe('parseKeywords', () => {
  it('parses a single keyword', () => expect(parseKeywords('refund')).toEqual(['refund']));
  it('splits on commas and newlines, trimming whitespace', () =>
    expect(parseKeywords(' refund ,\n return policy \r\n\nmoney   back,')).toEqual(['refund', 'return policy', 'money back']));
  it('removes case-insensitive duplicates, keeping the first spelling', () =>
    expect(parseKeywords('Refund\nrefund, REFUND ,Return')).toEqual(['Refund', 'Return']));
  it('returns an empty list for empty or whitespace-only input', () => {
    expect(parseKeywords('')).toEqual([]);
    expect(parseKeywords('   \n\t , ,  ')).toEqual([]);
  });
  it('keeps special characters as typed', () => expect(parseKeywords('$5.00 (USD)\nC++')).toEqual(['$5.00 (USD)', 'C++']));
});

describe('mergeKeywords', () => {
  it('adds only new keywords to an existing list', () =>
    expect(mergeKeywords(['refund'], ['Refund', ' returns ', ''])).toEqual(['refund', 'returns']));
});
