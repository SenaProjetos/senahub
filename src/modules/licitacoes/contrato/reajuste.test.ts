import { describe, it, expect } from 'vitest';
import { valorReajustado, ehAniversarioReajuste } from './reajuste';

describe('reajuste module', () => {
  describe('valorReajustado', () => {
    it('case 1: 1000 com 10% reajuste = 1100', () => {
      expect(valorReajustado(1000, 10)).toBe(1100);
    });

    it('case 2: 1000 com 0% reajuste = 1000', () => {
      expect(valorReajustado(1000, 0)).toBe(1000);
    });

    it('case 3: 1000 com 5.5% reajuste = 1055', () => {
      expect(valorReajustado(1000, 5.5)).toBe(1055);
    });

    it('case 4: 333.33 com 10% reajuste = 366.66 (rounding)', () => {
      expect(valorReajustado(333.33, 10)).toBe(366.66);
    });

    it('case 5: 1000 com -10% reajuste = 900 (negativo)', () => {
      expect(valorReajustado(1000, -10)).toBe(900);
    });
  });

  describe('ehAniversarioReajuste', () => {
    it('case 6: 2024-06-19 e 2025-06-19 = true', () => {
      expect(ehAniversarioReajuste('2024-06-19', '2025-06-19')).toBe(true);
    });

    it('case 7: 2024-06-19 e 2025-06-18 = false (dia diferente)', () => {
      expect(ehAniversarioReajuste('2024-06-19', '2025-06-18')).toBe(false);
    });

    it('case 8: 2024-06-19 e 2024-06-19 = false (mesmo ano)', () => {
      expect(ehAniversarioReajuste('2024-06-19', '2024-06-19')).toBe(false);
    });

    it('case 9: 2024-06-19 e 2026-06-19 = true (2 anos depois)', () => {
      expect(ehAniversarioReajuste('2024-06-19', '2026-06-19')).toBe(true);
    });

    it('case 10: 2024-02-15 e 2025-03-15 = false (mês diferente)', () => {
      expect(ehAniversarioReajuste('2024-02-15', '2025-03-15')).toBe(false);
    });
  });
});
