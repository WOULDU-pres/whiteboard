import { useRef } from 'react';

export type ToolMode = 'pan' | 'note';

interface Props {
  mode: ToolMode;
  onMode: (m: ToolMode) => void;
  onPickImage: (file: File) => void;
}

export default function Toolbar({ mode, onMode, onPickImage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-2xl bg-white px-3 py-2 shadow-lg">
      <button
        className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'pan' ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
        onClick={() => onMode('pan')}
      >🖐️ 이동</button>
      <button
        className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'note' ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
        onClick={() => onMode('note')}
      >📝 메모</button>
      <button
        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600"
        onClick={() => fileRef.current?.click()}
      >🖼️ 사진</button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickImage(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
