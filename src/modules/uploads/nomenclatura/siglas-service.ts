/**
 * Espelho das colunas antigas de sigla (`DisciplinaCatalogo.codigo`/`sinonimos`,
 * `PranchaCatalogo.sigla`/`sinonimos`) em `SiglaNomenclatura` — spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`.
 *
 * Os formulários de catálogo continuam gravando as colunas. Enquanto as siglas do item forem só o
 * espelho delas (item que nunca passou por "Siglas por versão"), cada gravação regrava as linhas na
 * faixa do item. Depois que o item ganha siglas por versão, a tabela passa a ser a única fonte e o
 * espelho não roda mais — quem decide é `decidirSiglasAoSalvar` (`siglas-versao.ts`).
 *
 * Recebe o cliente como parâmetro para rodar dentro da transação da action e no seed.
 */

import type { Prisma } from "@/generated/prisma/client";
import { siglasDasColunas, type FaixaVersao } from "./siglas-versao";

type Cliente = Pick<Prisma.TransactionClient, "siglaNomenclatura">;

export type AlvoSiglas =
  | { tipo: "disciplina"; id: string; codigo: string | null; sinonimos: readonly string[] }
  | { tipo: "prancha"; id: string; categoria: "fase" | "tipo" | "folha"; sigla: string; sinonimos: readonly string[] };

function dadosDoAlvo(alvo: AlvoSiglas, faixa: FaixaVersao) {
  return alvo.tipo === "disciplina"
    ? {
        onde: { disciplinaCatalogoId: alvo.id },
        categoria: "disciplina" as const,
        linhas: siglasDasColunas(alvo.codigo, alvo.sinonimos, faixa),
      }
    : {
        onde: { pranchaCatalogoId: alvo.id },
        categoria: alvo.categoria,
        linhas: siglasDasColunas(alvo.sigla, alvo.sinonimos, faixa),
      };
}

/**
 * Regrava TODAS as linhas do item a partir das colunas, na faixa do item. Só para item novo ou
 * cujas siglas ainda são o espelho das colunas (`decidirSiglasAoSalvar` → "espelhar"): num item
 * com siglas por versão, apagaria as decisões registradas pela tela.
 */
export async function espelharSiglasDasColunas(db: Cliente, alvo: AlvoSiglas, faixa: FaixaVersao): Promise<void> {
  const { onde, categoria, linhas } = dadosDoAlvo(alvo, faixa);
  await db.siglaNomenclatura.deleteMany({ where: onde });
  if (linhas.length === 0) return;
  await db.siglaNomenclatura.createMany({
    data: linhas.map((l) => ({ ...onde, categoria, sigla: l.sigla, oficial: l.oficial, versaoDesde: l.versaoDesde, versaoAte: l.versaoAte })),
  });
}

type ClienteSeed = Pick<Prisma.TransactionClient, "siglaNomenclatura" | "disciplinaCatalogo" | "pranchaCatalogo">;

/**
 * Seed: cria as siglas de todo item de catálogo que ainda não tem NENHUMA linha. Instalação nova
 * sai com a tabela preenchida; banco no ar não é tocado (item já espelhado tem linha, e item
 * cadastrado pela tela nova também). Idempotente — o `db:seed` roda em todo deploy.
 */
export async function semearSiglasFaltantes(db: ClienteSeed): Promise<{ criadas: number }> {
  const faixaSelect = { versaoDesde: true, versaoAte: true } as const;
  const [disciplinas, pranchas] = await Promise.all([
    db.disciplinaCatalogo.findMany({
      where: { siglas: { none: {} } },
      select: { id: true, codigo: true, sinonimos: true, ...faixaSelect },
    }),
    db.pranchaCatalogo.findMany({
      where: { siglas: { none: {} } },
      select: { id: true, categoria: true, sigla: true, sinonimos: true, ...faixaSelect },
    }),
  ]);
  const alvos: { alvo: AlvoSiglas; faixa: FaixaVersao }[] = [
    ...disciplinas.map((d) => ({
      alvo: { tipo: "disciplina" as const, id: d.id, codigo: d.codigo, sinonimos: d.sinonimos },
      faixa: { versaoDesde: d.versaoDesde, versaoAte: d.versaoAte },
    })),
    ...pranchas.map((p) => ({
      alvo: { tipo: "prancha" as const, id: p.id, categoria: p.categoria, sigla: p.sigla, sinonimos: p.sinonimos },
      faixa: { versaoDesde: p.versaoDesde, versaoAte: p.versaoAte },
    })),
  ];
  const data = alvos.flatMap(({ alvo, faixa }) => {
    const { onde, categoria, linhas } = dadosDoAlvo(alvo, faixa);
    return linhas.map((l) => ({ ...onde, categoria, sigla: l.sigla, oficial: l.oficial, versaoDesde: l.versaoDesde, versaoAte: l.versaoAte }));
  });
  if (data.length === 0) return { criadas: 0 };
  const { count } = await db.siglaNomenclatura.createMany({ data });
  return { criadas: count };
}
