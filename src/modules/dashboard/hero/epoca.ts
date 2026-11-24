/**
 * Datas comemorativas do herocard — regras puras (sem React, sem I/O), rodam no navegador.
 * Datas em `YYYY-MM-DD` (dia de São Paulo). Quem desenha cada tema é `hero-sky.tsx`.
 */

import { diasEntre, somarDias } from "@/modules/dashboard/hero/ceu";

const dois = (n: number) => String(n).padStart(2, "0");

/** Domingo de Páscoa no calendário gregoriano (algoritmo de Meeus/Jones/Butcher). */
export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return `${ano}-${dois(Math.floor(n / 31))}-${dois((n % 31) + 1)}`;
}

/** Terça-feira de Carnaval: 47 dias antes da Páscoa. */
export function tercaDeCarnaval(ano: number): string {
  return somarDias(domingoDePascoa(ano), -47);
}

/** O Carnaval começa no sábado da semana ANTERIOR (as prévias de Recife) e vai até a Quarta de Cinzas. */
export const DIAS_ANTES_DO_CARNAVAL = 10;
/** A Páscoa vai do Domingo de Ramos ao Domingo de Páscoa. */
export const DIAS_ANTES_DA_PASCOA = 7;

export type TemaDaEpoca = "mulher" | "carnaval" | "pascoa" | "junino" | "natal" | null;

/**
 * Tema da decoração do dia. 8 de março (Dia Internacional da Mulher) vence o Carnaval quando os dois
 * caem juntos; os outros nunca se cruzam.
 */
export function temaDaEpoca(dia: string): TemaDaEpoca {
  const [ano, m, d] = dia.split("-").map(Number);
  if (m === 3 && d === 8) return "mulher";
  if (m === 6) return "junino";
  if (m === 12 || (m === 1 && d <= 6)) return "natal";
  const doCarnaval = diasEntre(tercaDeCarnaval(ano), dia);
  if (doCarnaval >= -DIAS_ANTES_DO_CARNAVAL && doCarnaval <= 1) return "carnaval";
  const daPascoa = diasEntre(domingoDePascoa(ano), dia);
  if (daPascoa >= -DIAS_ANTES_DA_PASCOA && daPascoa <= 0) return "pascoa";
  return null;
}

/** Chip ao lado da data, para o tema que precisa de nome. */
export function rotuloDoTema(tema: TemaDaEpoca): string | null {
  return tema === "mulher" ? "Dia Internacional da Mulher" : null;
}

/** Fogos de Réveillon: de 26/12 a 1º/01 — só à noite, quem desenha decide pela claridade do céu. */
export function temFogos(dia: string): boolean {
  const [, m, d] = dia.split("-").map(Number);
  return (m === 12 && d >= 26) || (m === 1 && d === 1);
}

export type Campanha = { nome: string; cor: string };

const CAMPANHAS: Record<number, Campanha> = {
  9: { nome: "Setembro Amarelo", cor: "#FACC15" },
  10: { nome: "Outubro Rosa", cor: "#F472B6" },
  11: { nome: "Novembro Azul", cor: "#3B82F6" },
};

/** Campanha de conscientização do mês (laço na grua + chip), se houver. */
export function campanhaDoMes(dia: string): Campanha | null {
  return CAMPANHAS[Number(dia.slice(5, 7))] ?? null;
}
