import { ReactNode, useRef } from 'react';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

interface Props {
  children: ReactNode;
  /** 빈 공간 클릭 시 캔버스 논리 좌표를 전달 */
  onAddAt?: (x: number, y: number) => void;
  /** 메모 추가 모드일 때만 클릭으로 좌표를 잡음 */
  addMode?: boolean;
}

const WORLD = 5000; // 논리 좌표 평면 크기(px)

export default function Canvas({ children, onAddAt, addMode }: Props) {
  const ref = useRef<ReactZoomPanPinchRef | null>(null);

  function handleClick(e: React.MouseEvent) {
    if (!addMode || !onAddAt) return;
    const state = ref.current?.state;
    if (!state) return;
    // e.currentTarget(dotgrid div)의 getBoundingClientRect는 이미 CSS transform(pan)
    // 적용 후 화면 좌표라 rect.left/top에 positionX/Y가 포함돼 있다. 따라서 positionX/Y를
    // 다시 빼면 안 되고, scale로만 나눠 논리 좌표를 얻는다.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;
    onAddAt(x, y);
  }

  return (
    <TransformWrapper
      ref={ref}
      minScale={0.25}
      maxScale={3}
      initialScale={1}
      limitToBounds={false}
      panning={{ disabled: addMode, velocityDisabled: true }}
      doubleClick={{ disabled: true }}
      wheel={{ step: 0.08 }}
    >
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%' }}
        contentStyle={{ width: WORLD, height: WORLD }}
      >
        <div
          className="dotgrid relative"
          style={{ width: WORLD, height: WORLD, cursor: addMode ? 'crosshair' : 'grab' }}
          onClick={handleClick}
        >
          {children}
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}
