import { describe, expect, it } from 'vitest';
import { embeddingInputText } from '../../lib/ai/text';

describe('embeddingInputText', () => {
  it('combines title and description on separate lines', () => {
    expect(embeddingInputText({ title: 'Hello', description: 'World' })).toBe('Hello\nWorld');
  });

  it('uses title alone when description is missing', () => {
    expect(embeddingInputText({ title: 'Hello', description: null })).toBe('Hello');
  });

  it('returns null when there is no usable text', () => {
    expect(embeddingInputText({ title: null, description: null })).toBeNull();
    expect(embeddingInputText({ title: '', description: '   ' })).toBeNull();
  });
});
