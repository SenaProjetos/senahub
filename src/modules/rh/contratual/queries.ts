import "server-only";
import { prisma } from "@/lib/prisma";

/** Uma diferença entre a linha e a anterior — é assim que "valor anterior × novo" é derivado. */
export type MudancaContratual = { campo: "Cargo" | "Departamento" | "Remuneração"; de: string | null; para: string | null };

const dinheiro = (v: unknown) => (v == null ? null : Number(v).toFixed(2));

/**
 * Histórico contratual de uma pessoa, do mais recente para o mais antigo.
 *
 * **Dado de folha** (contém remuneração): quem chama tem de estar sob `rh:folha` — a query não
 * gateia sozinha, igual a `contasDoColaborador`.
 *
 * As linhas são snapshots; o "de → para" sai de comparar cada uma com a anterior no tempo. Faz
 * o diff aqui, no servidor, para a tela não precisar reimplementar a regra.
 */
export async function historicoContratualDaPessoa(userId: string) {
  const linhas = await prisma.historicoContratual.findMany({
    where: { userId },
    // Ascendente para diferenciar contra a anterior; a saída é invertida no fim.
    orderBy: [{ vigenciaEm: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true, vigenciaEm: true, motivo: true, observacao: true,
      cargoNome: true, departamentoNome: true, remuneracao: true, criadoEm: true,
      autor: { select: { name: true } },
    },
  });

  const comDiff = linhas.map((l, i) => {
    const ant = i > 0 ? linhas[i - 1] : null;
    const mudancas: MudancaContratual[] = [];
    if (ant) {
      if (ant.cargoNome !== l.cargoNome) mudancas.push({ campo: "Cargo", de: ant.cargoNome, para: l.cargoNome });
      if (ant.departamentoNome !== l.departamentoNome) {
        mudancas.push({ campo: "Departamento", de: ant.departamentoNome, para: l.departamentoNome });
      }
      if (dinheiro(ant.remuneracao) !== dinheiro(l.remuneracao)) {
        mudancas.push({ campo: "Remuneração", de: dinheiro(ant.remuneracao), para: dinheiro(l.remuneracao) });
      }
    }
    return {
      id: l.id,
      vigenciaEm: l.vigenciaEm.toISOString().slice(0, 10),
      motivo: l.motivo,
      observacao: l.observacao,
      autor: l.autor.name,
      registradoEm: l.criadoEm.toISOString(),
      cargoNome: l.cargoNome,
      departamentoNome: l.departamentoNome,
      remuneracao: l.remuneracao == null ? null : Number(l.remuneracao),
      /** Vazio na primeira linha (não há anterior) — a tela mostra o estado inicial. */
      mudancas,
    };
  });

  return comDiff.reverse();
}

export type HistoricoContratualPessoa = Awaited<ReturnType<typeof historicoContratualDaPessoa>>;
