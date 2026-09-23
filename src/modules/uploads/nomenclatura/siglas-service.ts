/**
 * Espelho das colunas antigas de sigla em `SiglaNomenclatura` — TRANSITÓRIO (F1 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`).
 *
 * Até a F4, as telas de catálogo continuam gravando `DisciplinaCatalogo.codigo`/`sinonimos` e
 * `PranchaCatalogo.sigla`/`sinonimos`. Cada gravação chama `sincronizarSiglasV1` para a tabela
 * nova não ficar para trás. Só mexe nas linhas "v1 em diante" (`versaoDesde = 1`, sem fim), que
 * são as únicas que existem antes da F4 — uma linha com outra faixa já é decisão da tela nova e
 * não é tocada. Na F4 a tela passa a gravar direto aqui e este espelho sai.
 *
 * Recebe o cliente como parâmetro para rodar dentro da transação da action e no seed.
 */

import type { Prisma } from "@/generated/prisma/client";
import { siglasDasColunas } from "./siglas-versao";

type Cliente = Pick<Prisma.TransactionClient, "siglaNomenclatura">;

export type AlvoSiglas =
  | { tipo: "disciplina"; id: string; codigo: string | null; sinonimos: readonly string[] }
  | { tipo: "prancha"; id: string; categoria: "fase" | "tipo" | "folha"; sigla: string; sinonimos: readonly string[] };

function dadosDoAlvo(alvo: AlvoSiglas) {
  return alvo.tipo === "disciplina"
    ? {
        onde: { disciplinaCatalogoId: alvo.id },
        categoria: "disciplina" as const,
        linhas: siglasDasColunas(alvo.codigo, alvo.sinonimos),
      }
    : {
        onde: { pranchaCatalogoId: alvo.id },
        categoria: alvo.categoria,
        linhas: siglasDasColunas(alvo.sigla, alvo.sinonimos),
      };
}

/** Reescreve as linhas "v1 em diante" do item a partir das colunas que a tela acabou de gravar. */
export async function sincronizarSiglasV1(db: Cliente, alvo: AlvoSiglas): Promise<void> {
  const { onde, categoria, linhas } = dadosDoAlvo(alvo);
  await db.siglaNomenclatura.deleteMany({ where: { ...onde, versaoDesde: 1, versaoAte: null } });
  if (linhas.length === 0) return;
  await db.siglaNomenclatura.createMany({
    data: linhas.map((l) => ({ ...onde, categoria, sigla: l.sigla, oficial: l.oficial, versaoDesde: 1 })),
  });
}

type ClienteSeed = Pick<Prisma.TransactionClient, "siglaNomenclatura" | "disciplinaCatalogo" | "pranchaCatalogo">;

/**
 * Seed: cria as siglas de todo item de catálogo que ainda não tem NENHUMA linha. Instalação nova
 * sai com a tabela preenchida; banco no ar não é tocado (item já espelhado tem linha, e item
 * cadastrado pela tela nova também). Idempotente — o `db:seed` roda em todo deploy.
 */
export async function semearSiglasFaltantes(db: ClienteSeed): Promise<{ criadas: number }> {
  const [disciplinas, pranchas] = await Promise.all([
    db.disciplinaCatalogo.findMany({
      where: { siglas: { none: {} } },
      select: { id: true, codigo: true, sinonimos: true },
    }),
    db.pranchaCatalogo.findMany({
      where: { siglas: { none: {} } },
      select: { id: true, categoria: true, sigla: true, sinonimos: true },
    }),
  ]);
  const alvos: AlvoSiglas[] = [
    ...disciplinas.map((d) => ({ tipo: "disciplina" as const, ...d })),
    ...pranchas.map((p) => ({ tipo: "prancha" as const, ...p })),
  ];
  const data = alvos.flatMap((alvo) => {
    const { onde, categoria, linhas } = dadosDoAlvo(alvo);
    return linhas.map((l) => ({ ...onde, categoria, sigla: l.sigla, oficial: l.oficial, versaoDesde: 1 }));
  });
  if (data.length === 0) return { criadas: 0 };
  const { count } = await db.siglaNomenclatura.createMany({ data });
  return { criadas: count };
}
