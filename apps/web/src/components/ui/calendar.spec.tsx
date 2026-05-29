import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Calendar } from './calendar';

describe('Calendar Component', () => {
  it('應能正確渲染日曆', () => {
    render(<Calendar />);
    // 檢查是否渲染了星期幾（例如：一 或 Mon）
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('點擊日期時應呼叫 onSelect', () => {
    const onSelect = vi.fn();
    render(<Calendar mode="single" onSelect={onSelect} />);
    
    // 找包含 "15" 的元素（可能是 td 或 button）
    const day15 = screen.getByText('15');
    
    fireEvent.click(day15);
    expect(onSelect).toHaveBeenCalled();
  });

  it('應能正確標示自定義修飾符 (modifiers)', () => {
    const bookedDate = new Date();
    bookedDate.setDate(10);
    
    render(
      <Calendar 
        modifiers={{ hasBooking: [bookedDate] }}
        modifiersClassNames={{ hasBooking: 'has-booking-class' }}
      />
    );
    
    // 尋找文字為 10 的元素，並檢查它或其父層是否有 has-booking-class
    const day10 = screen.getByText('10');
    const container = day10.closest('.has-booking-class') || day10;
    expect(container).toHaveClass('has-booking-class');
  });
});
