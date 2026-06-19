import { describe, it, expect } from 'vitest';
import { percentual, taxaVitoria } from './kpis';

describe('KPIs Dashboard', () => {
  describe('percentual', () => {
    it('calculates 1/4 as 25', () => {
      expect(percentual(1, 4)).toBe(25);
    });

    it('calculates 1/3 as 33.33 (rounded to 2 decimals)', () => {
      expect(percentual(1, 3)).toBe(33.33);
    });

    it('returns 0 when both parte and total are 0', () => {
      expect(percentual(0, 0)).toBe(0);
    });

    it('returns 0 when total is 0 and parte is non-zero', () => {
      expect(percentual(5, 0)).toBe(0);
    });
  });

  describe('taxaVitoria', () => {
    it('calculates 3 ganhas / (3+1) = 75', () => {
      expect(taxaVitoria(3, 1)).toBe(75);
    });

    it('calculates 1 ganhas / (1+0) = 100', () => {
      expect(taxaVitoria(1, 0)).toBe(100);
    });

    it('returns 0 when no matches decided (0 ganhas, 0 perdidas)', () => {
      expect(taxaVitoria(0, 0)).toBe(0);
    });

    it('calculates 1 ganhas / (1+2) = 33.33', () => {
      expect(taxaVitoria(1, 2)).toBe(33.33);
    });
  });
});
