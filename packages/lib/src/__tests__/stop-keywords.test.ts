import { describe, it, expect } from 'vitest';
import { detectConsentKeyword } from '../stop-keywords.js';

describe('detectConsentKeyword', () => {
  it.each([
    ['STOP', 'opt_out'],
    ['stop', 'opt_out'],
    ['Please stop sending messages', 'opt_out'],
    ['unsubscribe', 'opt_out'],
    ['BERHENTI', 'opt_out'],
    ['停止', 'opt_out'],
    ['退订', 'opt_out'],
    ['start', 'opt_in'],
    ['YES please', 'opt_in'],
    ['How much for a party?', null],
    ['', null],
  ])('detects %s -> %s', (input, expected) => {
    expect(detectConsentKeyword(input)).toBe(expected);
  });

  it('handles punctuation', () => {
    expect(detectConsentKeyword('STOP!')).toBe('opt_out');
    expect(detectConsentKeyword('unsubscribe,now')).toBe('opt_out');
  });

  it('returns null for unrelated content', () => {
    expect(detectConsentKeyword('Can you tell me about the parties')).toBeNull();
  });
});
