export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function validateImageFile(
  file: { type: string; size: number }
): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, reason: 'jpg·png·gif·webp 이미지만 올릴 수 있어요.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: '사진은 5MB 이하만 올릴 수 있어요.' };
  }
  return { ok: true };
}

// 브라우저 전용: 긴 변을 maxEdge로 줄여 JPEG Blob 반환. gif는 원본 유지.
export async function downscaleImage(file: File, maxEdge = 1600): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85)
  );
}
