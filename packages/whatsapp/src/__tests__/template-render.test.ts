import { describe, it, expect } from 'vitest';
import { renderTemplate, extractVariableKeys } from '../template-render.js';

describe('renderTemplate', () => {
  it('substitutes named variables', () => {
    expect(renderTemplate('Hi {{name}}!', { name: 'Alice' })).toBe('Hi Alice!');
  });

  it('substitutes positional variables', () => {
    expect(renderTemplate('Hi {{1}}, see you at {{2}}', { '1': 'Bob', '2': '6pm' })).toBe(
      'Hi Bob, see you at 6pm',
    );
  });

  it('leaves unknown variables intact', () => {
    expect(renderTemplate('Hi {{unknown}}', {})).toBe('Hi {{unknown}}');
  });

  it('handles multiple occurrences of the same variable', () => {
    expect(renderTemplate('{{x}} and {{x}}', { x: 'A' })).toBe('A and A');
  });
});

describe('extractVariableKeys', () => {
  it('returns deduped variable keys', () => {
    expect(extractVariableKeys('{{a}} {{b}} {{a}}').sort()).toEqual(['a', 'b']);
  });
});
