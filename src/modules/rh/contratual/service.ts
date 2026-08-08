/**
 * Escrita contratual — **ponto único** que grava cargo, departamento e remuneração de uma
 * pessoa. Mesmo papel que `usuarios/vinculo/service.ts` tem para setor/contratação e
 * `rh/catalogos/service.ts` para o rótulo do catálogo.
 *
 * A regra: `User.salarioBase`, `User.cargoId` e `User.departamentoId` são CACHE do último
 * `HistoricoContratual` vigente. Quem escrever nesses campos por fora daqui cria um estado em
 * que o valor exibido não tem registro correspondente — e o histórico deixa de ser prova de
 * qualquer coisa. `inconsistenciasContratuais` existe para detectar exatamente isso.
 *
 * Sem `server-only`: compartilhado por Server Actions, jobs e scripts (`tsx`).
 */
import { ActionError } from "@/lib/action-error";
import { Prisma } from "@/generated/prisma/client";
import { resolverClassificacao } from "@/modules/rh/catalogos/service";
import type { MotivoContratual } from "./motivos";

export { MOTIVOS_CONTRATUAIS, MOTIVO_LABELS, type MotivoContratual } from "./motivos";

type Db = Prisma.TransactionClient;

/**
 * Eixo ausente (`undefined`) = não mexe, mantém o valor vigente. `null` = limpar.
 * Essa distinção importa: `salvarSalario` só toca remuneração e não pode zerar o cargo.
 */
export type AlteracaoContratual = {
  cargoId?: string | null;
  departamentoId?: string | null;
  remuneracao?: Prisma.Decimal | number | null;
  /** Data a partir da qual o novo estado vale. Default: hoje. */
  vigenciaEm?: Date;
  motivo?: MotivoContratual;
  observacao?: string | null;
};

export type ResultadoAlteracao = {
  /** `false` quando nada mudou — não se cria registro de "alteração" que não alterou nada. */
  registrou: boolean;
  historicoId?: string;
};

const paraDecimal = (v: Prisma.Decimal | number | null | undefined): Prisma.Decimal | null =>
  v == null ? null : v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);

/** Compara remuneração por VALOR: `Decimal(1000)` e `Decimal(1000.00)` são o mesmo salário. */
function mesmaRemuneracao(a: Prisma.Decimal | null, b: Prisma.Decimal | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/** Data sem hora, no fuso UTC — o campo é `@db.Date`, como o resto do módulo. */
function hojeUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Registra a alteração e atualiza o cache no MESMO passo. Devolve `registrou: false` quando o
 * estado resultante é idêntico ao vigente (salvar o formulário sem mexer em nada não deve
 * poluir o histórico).
 *
 * Deve rodar dentro de transação — o chamador passa o `tx`.
 */
export async function registrarAlteracaoContratual(
  db: Db,
  userId: string,
  dados: AlteracaoContratual,
  autorId: string,
): Promise<ResultadoAlteracao> {
  const atual = await db.user.findUnique({
    where: { id: userId },
    select: {
      cargoId: true, departamentoId: true, salarioBase: true,
      cargo: true, departamento: true, vinculoAtivoId: true,
    },
  });
  if (!atual) throw new ActionError("Colaborador não encontrado.");

  // Eixos informados passam pelo catálogo (valida existência e item arquivado, e devolve o
  // rótulo); os não informados permanecem como estão.
  const classificacao = await resolverClassificacao(db, {
    cargoId: dados.cargoId,
    departamentoId: dados.departamentoId,
  });

  const novoCargoId = "cargoId" in classificacao ? classificacao.cargoId! : atual.cargoId;
  const novoCargoNome = "cargo" in classificacao ? classificacao.cargo! : atual.cargo;
  const novoDeptoId = "departamentoId" in classificacao ? classificacao.departamentoId! : atual.departamentoId;
  const novoDeptoNome = "departamento" in classificacao ? classificacao.departamento! : atual.departamento;
  const novaRemuneracao =
    dados.remuneracao !== undefined ? paraDecimal(dados.remuneracao) : atual.salarioBase;

  const semMudanca =
    novoCargoId === atual.cargoId &&
    novoDeptoId === atual.departamentoId &&
    mesmaRemuneracao(novaRemuneracao, atual.salarioBase);

  if (semMudanca) return { registrou: false };

  const historico = await db.historicoContratual.create({
    data: {
      userId,
      vinculoId: atual.vinculoAtivoId,
      vigenciaEm: dados.vigenciaEm ?? hojeUtc(),
      cargoId: novoCargoId,
      departamentoId: novoDeptoId,
      // Rótulos congelados: renomear o catálogo depois não pode reescrever o passado.
      cargoNome: novoCargoNome,
      departamentoNome: novoDeptoNome,
      remuneracao: novaRemuneracao,
      motivo: dados.motivo ?? null,
      observacao: dados.observacao ?? null,
      autorId,
    },
    select: { id: true },
  });

  await db.user.update({
    where: { id: userId },
    data: {
      cargoId: novoCargoId,
      cargo: novoCargoNome,
      departamentoId: novoDeptoId,
      departamento: novoDeptoNome,
      salarioBase: novaRemuneracao,
    },
  });

  return { registrou: true, historicoId: historico.id };
}

export type InconsistenciaContratual = { userId: string; nome: string; problema: string };

export type DiagnosticoContratual = {
  /**
   * Cache do `User` diverge da última linha vigente. **Não-vazio = defeito**: alguém escreveu
   * salário/cargo/departamento por fora deste service.
   */
  divergentes: InconsistenciaContratual[];
  /**
   * Tem valor contratual no cache mas nenhuma linha de histórico. **Esperado** entre a migration
   * e a carga inicial; separado para não afogar o sinal de defeito.
   */
  semHistorico: InconsistenciaContratual[];
};

/**
 * Confronta o cache com a última linha vigente (`vigenciaEm <= hoje`).
 * Espelha `inconsistenciasDeCache` de `usuarios/vinculo/service.ts`.
 */
export async function inconsistenciasContratuais(db: Db): Promise<DiagnosticoContratual> {
  const hoje = hojeUtc();
  const usuarios = await db.user.findMany({
    where: {
      OR: [{ cargoId: { not: null } }, { departamentoId: { not: null } }, { salarioBase: { not: null } }],
    },
    select: {
      id: true, name: true, cargoId: true, departamentoId: true, salarioBase: true,
      historicoContratual: {
        where: { vigenciaEm: { lte: hoje } },
        orderBy: [{ vigenciaEm: "desc" }, { criadoEm: "desc" }],
        take: 1,
        select: { cargoId: true, departamentoId: true, remuneracao: true, vigenciaEm: true },
      },
    },
  });

  const divergentes: InconsistenciaContratual[] = [];
  const semHistorico: InconsistenciaContratual[] = [];

  for (const u of usuarios) {
    const vigente = u.historicoContratual[0];
    if (!vigente) {
      semHistorico.push({ userId: u.id, nome: u.name, problema: "tem cargo/departamento/salário sem nenhuma linha de histórico" });
      continue;
    }
    if (vigente.cargoId !== u.cargoId) {
      divergentes.push({ userId: u.id, nome: u.name, problema: "cargo em cache difere da última vigência" });
    }
    if (vigente.departamentoId !== u.departamentoId) {
      divergentes.push({ userId: u.id, nome: u.name, problema: "departamento em cache difere da última vigência" });
    }
    if (!mesmaRemuneracao(vigente.remuneracao, u.salarioBase)) {
      divergentes.push({
        userId: u.id,
        nome: u.name,
        problema: `salário em cache (${u.salarioBase ?? "—"}) difere da última vigência (${vigente.remuneracao ?? "—"}, ${vigente.vigenciaEm.toISOString().slice(0, 10)})`,
      });
    }
  }

  return { divergentes, semHistorico };
}
