import { describe, it, expect } from 'vitest';
import {
  somaDeltas,
  somaAcrescimos,
  saldoContratual,
  acrescimoAcumuladoPct,
  limiteExcedido,
  proximoDoLimite,
} from './saldo';

describe('saldo module', () => {
  // Test 1: somaDeltas with positive, negative, and null deltas
  it('test 1: somaDeltas sums net deltas (acrescimos - supressoes)', () => {
    const result = somaDeltas([
      { valorDelta: 100 },
      { valorDelta: -30 },
      { valorDelta: null },
    ]);
    expect(result).toBe(70);
  });

  // Test 2: somaAcrescimos sums only positive deltas
  it('test 2: somaAcrescimos sums only acrescimos (positive deltas)', () => {
    const result = somaAcrescimos([
      { valorDelta: 100 },
      { valorDelta: -30 },
      { valorDelta: null },
    ]);
    expect(result).toBe(100);
  });

  // Test 3: saldoContratual calculation
  it('test 3: saldoContratual = (homologado + deltas) - medicoes', () => {
    const result = saldoContratual(1000, 200, 300);
    expect(result).toBe(900);
  });

  // Test 4: saldoContratual when homologado = medicoes
  it('test 4: saldoContratual when fully measured', () => {
    const result = saldoContratual(1000, 0, 1000);
    expect(result).toBe(0);
  });

  // Test 5: saldoContratual can be negative
  it('test 5: saldoContratual can be negative when over-measured', () => {
    const result = saldoContratual(1000, 0, 1200);
    expect(result).toBe(-200);
  });

  // Test 6: acrescimoAcumuladoPct basic calculation
  it('test 6: acrescimoAcumuladoPct = (acrescimos / homologado) * 100', () => {
    const result = acrescimoAcumuladoPct(1000, 250);
    expect(result).toBe(25);
  });

  // Test 7: acrescimoAcumuladoPct guards against division by zero
  it('test 7: acrescimoAcumuladoPct returns 0 when homologado <= 0', () => {
    const result = acrescimoAcumuladoPct(0, 100);
    expect(result).toBe(0);
  });

  // Test 8: acrescimoAcumuladoPct with rounding to 2 decimals
  it('test 8: acrescimoAcumuladoPct rounds to 2 decimals', () => {
    const result = acrescimoAcumuladoPct(3000, 1000);
    expect(result).toBe(33.33);
  });

  // Test 9: limiteExcedido checks if acrescimo exceeds limit
  it('test 9: limiteExcedido is true when acrescimoPct > limitePct', () => {
    expect(limiteExcedido(26, 25)).toBe(true);
    expect(limiteExcedido(25, 25)).toBe(false);
    expect(limiteExcedido(24, 25)).toBe(false);
  });

  // Test 10: proximoDoLimite checks if in warning zone
  it('test 10: proximoDoLimite checks warning zone (acrescimoPct >= limite * fator)', () => {
    expect(proximoDoLimite(20, 25, 0.8)).toBe(true); // 20 >= 25*0.8=20
    expect(proximoDoLimite(19.99, 25, 0.8)).toBe(false); // 19.99 < 20
    expect(proximoDoLimite(30, 25, 0.8)).toBe(true); // 30 >= 20
  });
});
