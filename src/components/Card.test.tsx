import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CardView from './Card';
import type { Card } from '../lib/types';

const card: Card = {
  id: 'c1', board_id: 'b1', type: 'text', content: '안녕', image_url: null,
  x: 10, y: 10, width: 160, height: 160, color: '#fff3a0', owner_id: 'me',
  z_index: 0, created_at: 't', updated_at: 't',
};
const noop = () => {};

describe('CardView', () => {
  it('텍스트 내용을 보여준다', () => {
    render(<CardView card={card} myId="me" onChange={noop} onDelete={noop} onDragEnd={noop} onFocusCard={noop} />);
    expect(screen.getByText('안녕')).toBeInTheDocument();
  });
  it('소유자에게는 삭제 버튼이 보인다', () => {
    render(<CardView card={card} myId="me" onChange={noop} onDelete={noop} onDragEnd={noop} onFocusCard={noop} />);
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });
  it('소유자가 아니면 삭제 버튼이 없다', () => {
    render(<CardView card={card} myId="other" onChange={noop} onDelete={noop} onDragEnd={noop} onFocusCard={noop} />);
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });
});
