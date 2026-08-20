/**
 * Vínculos que podem ser PEDIDOS no formulário público de solicitação de acesso.
 *
 * Nenhum concede nada — é palpite da própria pessoa; o admin decide o vínculo real ao aprovar.
 * Substitui `SOLICITACAO_CADASTRO_ROLES`: os mesmos 5 casos, agora nos eixos da reforma de
 * acesso (`TipoUsuario` × `Contratacao`), e com `pj` × `autonomo_rpa` separados NA ORIGEM —
 * quem se cadastra sabe se tem CNPJ, então pedidos novos já nascem classificados em vez de
 * entrar na fila de reclassificação manual do §9.2 do plano.
 *
 * Mora AQUI e não em `actions.ts` de propósito: aquele arquivo é `"use server"`, e ali todo
 * export precisa ser função async — exportar uma constante de lá compila, passa no lint e no
 * build, e **quebra em runtime**. É uma armadilha que este projeto já pagou uma vez.
 * Client-safe (sem `server-only`, sem Prisma client), mesmo padrão de
 * `modules/documentos/fontes-meta.ts` e `modules/usuarios/vinculo/labels.ts`.
 */
import type { Contratacao, TipoUsuario } from "@/generated/prisma/client";

export const VINCULOS_PRETENDIDOS = [
  { valor: "externo", tipo: "externo", contratacao: null, label: "Cliente" },
  { valor: "clt", tipo: "interno", contratacao: "clt", label: "CLT" },
  { valor: "estagio", tipo: "interno", contratacao: "estagio", label: "Estágio" },
  { valor: "pj", tipo: "interno", contratacao: "pj", label: "PJ (tenho CNPJ, emito nota)" },
  { valor: "autonomo_rpa", tipo: "interno", contratacao: "autonomo_rpa", label: "Autônomo (RPA)" },
] as const satisfies ReadonlyArray<{
  valor: string;
  tipo: TipoUsuario;
  contratacao: Contratacao | null;
  label: string;
}>;

export type VinculoPretendido = (typeof VINCULOS_PRETENDIDOS)[number]["valor"];

/** Só o que o `<Select>` precisa. */
export const OPCOES_VINCULO_PRETENDIDO = VINCULOS_PRETENDIDOS.map((v) => ({
  valor: v.valor,
  label: v.label,
}));

/** Valores aceitos pelo schema Zod da action pública. */
export const VALORES_VINCULO_PRETENDIDO = VINCULOS_PRETENDIDOS.map((v) => v.valor) as [
  VinculoPretendido,
  ...VinculoPretendido[],
];

export function acharVinculoPretendido(valor: VinculoPretendido) {
  return VINCULOS_PRETENDIDOS.find((v) => v.valor === valor)!;
}
