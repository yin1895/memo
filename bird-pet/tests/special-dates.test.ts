/**
 * SpecialDateManager - 日期校验单元测试
 */
import { describe, it, expect } from 'vitest';
import { isValidDate } from '../src/features/special-dates';

describe('isValidDate', () => {
  it('should accept standard valid dates', () => {
    expect(isValidDate(1, 1)).toBe(true);
    expect(isValidDate(1, 31)).toBe(true);
    expect(isValidDate(3, 31)).toBe(true);
    expect(isValidDate(5, 31)).toBe(true);
    expect(isValidDate(7, 31)).toBe(true);
    expect(isValidDate(8, 31)).toBe(true);
    expect(isValidDate(10, 31)).toBe(true);
    expect(isValidDate(12, 31)).toBe(true);
    expect(isValidDate(4, 30)).toBe(true);
    expect(isValidDate(6, 30)).toBe(true);
    expect(isValidDate(9, 30)).toBe(true);
    expect(isValidDate(11, 30)).toBe(true);
    expect(isValidDate(2, 28)).toBe(true);
  });

  it('should accept Feb 29 (leap year birthday/anniversary is valid)', () => {
    expect(isValidDate(2, 29)).toBe(true);
  });

  it('should reject invalid day-month combinations (non-existent dates)', () => {
    expect(isValidDate(2, 30)).toBe(false);  // 2月没有30号
    expect(isValidDate(2, 31)).toBe(false);  // 2月没有31号
    expect(isValidDate(4, 31)).toBe(false);  // 4月没有31号
    expect(isValidDate(6, 31)).toBe(false);  // 6月没有31号
    expect(isValidDate(9, 31)).toBe(false);  // 9月没有31号
    expect(isValidDate(11, 31)).toBe(false); // 11月没有31号
  });

  it('should reject out-of-range month values', () => {
    expect(isValidDate(0, 15)).toBe(false);
    expect(isValidDate(13, 15)).toBe(false);
    expect(isValidDate(-1, 15)).toBe(false);
  });

  it('should reject out-of-range day values', () => {
    expect(isValidDate(1, 0)).toBe(false);
    expect(isValidDate(1, 32)).toBe(false);
    expect(isValidDate(6, -1)).toBe(false);
  });
});
