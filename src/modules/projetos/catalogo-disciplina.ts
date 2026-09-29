/**
 * Qual entrada do catálogo uma disciplina do projeto É, pelo nome — PURO.
 *
 * Existe porque criar disciplina gravava só o texto (`disciplinaTextoLegado`) e deixava a FK
 * (`disciplinaId`) nula: só o backfill da F1.19c a preenchia, uma vez. Todo projeto criado depois
 * ficava sem disciplina ligada ao catálogo — e o que fala em id de catálogo (modelos de EAP, "Gerar
 * EAP das disciplinas") recusava o projeto inteiro com "Este projeto não tem disciplina ligada ao
 * catálogo".
 *
 * A regra é a do backfill (nome exato), com uma folga só: caixa e acento. "estrutural" é a mesma
 * disciplina que "Estrutural"; já "Estrutural - Torre A" não casa — aproximar apontaria a disciplina
 * para a entrada errada sem ninguém ver. Se a folga achar mais de uma entrada, não escolhe.
 */
import type { Prisma } from "@/generated/prisma/client";
import { normalizar } from "@/lib/disciplinas-core";

export type EntradaCatalogo = { id: string; nome: string };

/** O catálogo inteiro, arquivadas incluídas: arquivar tira do seletor, não muda o que a disciplina é. */
export function catalogoDeDisciplinas(db: Pick<Prisma.TransactionClient, "disciplinaCatalogo">): Promise<EntradaCatalogo[]> {
  return db.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
}

export function casarCatalogo(nome: string, catalogo: readonly EntradaCatalogo[]): string | null {
  const alvo = nome.trim();
  if (!alvo) return null;
  const exato = catalogo.find((c) => c.nome === alvo);
  if (exato) return exato.id;
  const chave = normalizar(alvo);
  const parecidos = catalogo.filter((c) => normalizar(c.nome) === chave);
  return parecidos.length === 1 ? parecidos[0].id : null;
}
