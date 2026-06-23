import { describe, it, expect } from 'vitest';
import { generateBoardCode } from './boardCode';

describe('generateBoardCode', () => {
  it('형용사-명사-NN 형식을 만든다', () => {
    const code = generateBoardCode(() => 0);
    expect(code).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  it('rand=0이면 각 목록의 첫 항목과 숫자 00을 쓴다', () => {
    expect(generateBoardCode(() => 0)).toBe('happy-tiger-00');
  });

  it('서로 다른 난수면 다른 코드가 나올 수 있다', () => {
    const a = generateBoardCode(() => 0);
    const b = generateBoardCode(() => 0.999);
    expect(a).not.toBe(b);
  });
});
