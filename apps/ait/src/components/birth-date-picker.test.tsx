import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  BirthDatePicker,
  buildBirthDateCalendar,
  formatIsoCalendarDate,
  isSelectableBirthDate,
} from './birth-date-picker';

describe('BirthDatePicker', () => {
  const maximumDate = new Date(2026, 7, 11, 12);

  it('formats and validates real non-future calendar dates', () => {
    expect(formatIsoCalendarDate(new Date(2026, 1, 3))).toBe('2026-02-03');
    expect(isSelectableBirthDate('2024-02-29', maximumDate)).toBe(true);
    expect(isSelectableBirthDate('2026-02-29', maximumDate)).toBe(false);
    expect(isSelectableBirthDate('2026-08-12', maximumDate)).toBe(false);
  });

  it('builds a six-week month grid and disables future days', () => {
    const days = buildBirthDateCalendar(2026, 7, maximumDate);
    expect(days).toHaveLength(42);
    expect(days[6]).toEqual({day: 1, isoDate: '2026-08-01', disabled: false});
    expect(days.find(day => day?.day === 11)?.disabled).toBe(false);
    expect(days.find(day => day?.day === 12)?.disabled).toBe(true);
  });

  it('opens the calendar and returns the selected ISO date', () => {
    const onChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<BirthDatePicker maximumDate={maximumDate} onChange={onChange} value="" />);
    });
    ReactTestRenderer.act(() => {
      renderer.root.findByProps({accessibilityLabel: '아기 생년월일 선택'}).props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root.findByProps({accessibilityLabel: '2026년 8월 5일'}).props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith('2026-08-05');
    expect(renderer.root.findAllByProps({accessibilityLabel: '아기 생년월일 달력'})).toHaveLength(0);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
