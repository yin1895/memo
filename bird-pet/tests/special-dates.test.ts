/**
 * SpecialDateManager - 日期校验 & 闰年处理单元测试
 */
import { describe, it, expect } from 'vitest';
import { isValidDate, isLeapYear, resolveLeapDay } from '../src/features/special-dates';

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
    expect(isValidDate(2, 30)).toBe(false); // 2月没有30号
    expect(isValidDate(2, 31)).toBe(false); // 2月没有31号
    expect(isValidDate(4, 31)).toBe(false); // 4月没有31号
    expect(isValidDate(6, 31)).toBe(false); // 6月没有31号
    expect(isValidDate(9, 31)).toBe(false); // 9月没有31号
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

describe('isLeapYear', () => {
  it('should identify common leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2000)).toBe(true); // 能被 400 整除
  });

  it('should identify common non-leap years', () => {
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2027)).toBe(false);
  });

  it('should handle century years correctly', () => {
    expect(isLeapYear(1900)).toBe(false); // 能被 100 整除但不能被 400 整除
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2400)).toBe(true); // 能被 400 整除
  });
});

describe('resolveLeapDay', () => {
  it('should keep 2/29 in leap years', () => {
    expect(resolveLeapDay(2, 29, 2024)).toEqual({ month: 2, day: 29 });
    expect(resolveLeapDay(2, 29, 2000)).toEqual({ month: 2, day: 29 });
  });

  it('should fall back 2/29 to 2/28 in non-leap years', () => {
    expect(resolveLeapDay(2, 29, 2025)).toEqual({ month: 2, day: 28 });
    expect(resolveLeapDay(2, 29, 2026)).toEqual({ month: 2, day: 28 });
    expect(resolveLeapDay(2, 29, 1900)).toEqual({ month: 2, day: 28 });
  });

  it('should not affect other dates regardless of year', () => {
    expect(resolveLeapDay(2, 28, 2025)).toEqual({ month: 2, day: 28 });
    expect(resolveLeapDay(12, 25, 2025)).toEqual({ month: 12, day: 25 });
    expect(resolveLeapDay(1, 1, 2024)).toEqual({ month: 1, day: 1 });
    expect(resolveLeapDay(2, 14, 2025)).toEqual({ month: 2, day: 14 });
  });

  it('should ensure non-leap year 2/29 does NOT overflow to 3/1', () => {
    // 这是该 bug 的核心场景：之前 new Date(2025, 1, 29) 会溢出到 3/1
    const resolved = resolveLeapDay(2, 29, 2025);
    const date = new Date(2025, resolved.month - 1, resolved.day);
    expect(date.getMonth()).toBe(1); // February (0-indexed)
    expect(date.getDate()).toBe(28);
  });
});
