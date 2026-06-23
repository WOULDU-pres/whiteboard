import { describe, it, expect } from 'vitest';
import { validateImageFile, MAX_IMAGE_BYTES } from './image';

describe('validateImageFile', () => {
  it('허용 형식·정상 용량이면 ok', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toEqual({ ok: true });
  });
  it('허용되지 않은 형식은 거부', () => {
    const r = validateImageFile({ type: 'application/pdf', size: 1000 });
    expect(r.ok).toBe(false);
  });
  it('용량 초과는 거부', () => {
    const r = validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});
