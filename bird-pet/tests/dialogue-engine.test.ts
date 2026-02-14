/**
 * DialogueEngine 单元测试
 */
import { describe, it, expect } from 'vitest';
import { DialogueEngine, type DialogueEntry } from '../src/features/dialogue-engine';

/** 测试用台词条目 */
const TEST_ENTRIES: DialogueEntry[] = [
  {
    scene: 'click',
    lines: ['哈喽！', '你好呀！', '啾啾！'],
  },
  {
    scene: 'greeting_morning',
    conditions: { hourRange: [6, 12] },
    lines: ['早上好，{nickname}！'],
  },
  {
    scene: 'greeting_night',
    conditions: { hourRange: [22, 6] },
    lines: ['晚安，{name}！'],
  },
  {
    scene: 'reflective_streak',
    conditions: { streak: { min: 7 } },
    lines: ['连续 {streak} 天了！'],
  },
  {
    scene: 'reflective_affinity',
    conditions: { affinityLevel: 3 },
    lines: ['我们好亲密~'],
  },
  {
    scene: 'special_anniversary',
    lines: ['认识 {daysSinceMet} 天了！'],
  },
  {
    scene: 'context_coding',
    lines: ['写代码辛苦啦'],
  },
];

describe('DialogueEngine', () => {
  it('should return a line from the matching scene', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    const line = engine.getLine('click');
    expect(['哈喽！', '你好呀！', '啾啾！']).toContain(line);
  });

  it('should return fallback when scene has no entries', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    const line = engine.getLine('idle_care');
    expect(line).toBe('啾啾！');
  });

  it('should match hour range conditions', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    // Morning (hour 8 in [6,12))
    const morning = engine.getLine('greeting_morning', { hour: 8 });
    expect(morning).toContain('早上好');
  });

  it('should handle cross-midnight hour ranges', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    // Night (hour 23 in [22,6))
    const result = engine.getLine('greeting_night', { hour: 23 });
    expect(result).toContain('晚安');
    // Hour 3 also in [22,6)
    const result2 = engine.getLine('greeting_night', { hour: 3 });
    expect(result2).toContain('晚安');
  });

  it('should fail when hour out of range', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    // Hour 14 not in [6,12) → no match, fallback
    const result = engine.getLine('greeting_morning', { hour: 14 });
    expect(result).toBe('啾啾！');
  });

  it('should match streak condition', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    const result = engine.getLine('reflective_streak', { streak: 10 });
    expect(result).toContain('10');
  });

  it('should fail streak condition when below min', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    const result = engine.getLine('reflective_streak', { streak: 3 });
    expect(result).toBe('啾啾！');
  });

  it('should match affinity level condition', () => {
    const engine = new DialogueEngine(TEST_ENTRIES);
    const result = engine.getLine('reflective_affinity', { affinityLevel: 4 });
    expect(result).toContain('亲密');
  });

  describe('template variables', () => {
    it('should replace {nickname} from global vars', () => {
      const engine = new DialogueEngine(TEST_ENTRIES);
      engine.setGlobalVars({
        name: '雨芊',
        nickname: '芊芊',
        nicknames: ['芊芊'],
        metDate: '2026-01-20',
        daysSinceMet: 100,
      });
      const line = engine.getLine('greeting_morning', { hour: 8 });
      expect(line).toBe('早上好，芊芊！');
    });

    it('should replace {name} from global vars', () => {
      const engine = new DialogueEngine(TEST_ENTRIES);
      engine.setGlobalVars({
        name: '雨芊',
        nickname: '芊芊',
        nicknames: ['芊芊'],
        metDate: '2026-01-20',
        daysSinceMet: 100,
      });
      const line = engine.getLine('greeting_night', { hour: 23 });
      expect(line).toBe('晚安，雨芊！');
    });

    it('should replace {daysSinceMet} from global vars', () => {
      const engine = new DialogueEngine(TEST_ENTRIES);
      engine.setGlobalVars({
        name: '雨芊',
        nickname: '芊芊',
        nicknames: ['芊芊'],
        metDate: '2026-01-20',
        daysSinceMet: 365,
      });
      const line = engine.getLine('special_anniversary');
      expect(line).toBe('认识 365 天了！');
    });

    it('should replace context variables like {streak}', () => {
      const engine = new DialogueEngine(TEST_ENTRIES);
      const line = engine.getLine('reflective_streak', { streak: 14 });
      expect(line).toContain('14');
    });
  });

  describe('dedup', () => {
    it('should not repeat the same line consecutively', () => {
      // Use entries with exactly 2 lines
      const entries: DialogueEntry[] = [
        {
          scene: 'click',
          lines: ['A', 'B'],
        },
      ];
      const engine = new DialogueEngine(entries);

      const lines = new Set<string>();
      // After 20 draws with only 2 options and dedup, both should appear
      for (let i = 0; i < 20; i++) {
        lines.add(engine.getLine('click'));
      }
      expect(lines.size).toBe(2);
    });
  });

  describe('getContextLine', () => {
    it('should return a context-specific line', () => {
      const engine = new DialogueEngine(TEST_ENTRIES);
      const line = engine.getContextLine('coding');
      expect(line).toBe('写代码辛苦啦');
    });

    it('should return null for unknown context', () => {
      const engine = new DialogueEngine(TEST_ENTRIES);
      const line = engine.getContextLine('unknown');
      expect(line).toBeNull();
    });
  });
});
