/**
 * Escrita da classificação organizacional — **ponto único** que mantém `User.cargo` e
 * `User.departamento` (CACHE do rótulo) em sincronia com `User.cargoId`/`User.departamentoId`
 * (fonte de verdade). Mesmo papel que `modules/usuarios/vinculo/service.ts` tem para
 * setor/contratação.
 *
 * A regra que justifica este arquivo: os textos em `User` são cache, lidos fora do RH sem join
 * (`projetos/queries.ts`, `dashboard/queries.ts`, `usuarios/preferencias/queries.ts`). Se
 * qualquer tela escrever o texto direto, o rótulo e a FK divergem sem ninguém perceber — e
 * renomear um cargo no catálogo deixaria a grafia velha espalhada pelo sistema.
 *
 * Sem `server-only`: é compartilhado por Server Actions, jobs e scripts (`tsx`), como os demais
 * `service.ts` do projeto.
 */
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";

/** Cliente Prisma ou transação — permite compor com outras escritas. */
type Db = Prisma.TransactionClient;

/**
 * Escolha vinda da tela. `undefined` = eixo não informado (não mexe); `null` = limpar a
 * classificação; `string` = id do item de catálogo.
 */
export type EntradaClassificacao = {
  cargoId?: string | null;
  departamentoId?: string | null;
};

/** Fragmento pronto para espalhar num `user.update`: FK e rótulo sempre juntos, nunca só um. */
export type Classificacao = Partial<{
  cargoId: string | null;
  cargo: string | null;
  departamentoId: string | null;
  departamento: string | null;
}>;

/**
 * Traduz os ids escolhidos em FK + rótulo. Devolve fragmento em vez de gravar para o chamador
 * fazer UM `update` só, junto do resto do cadastro — sem janela em que a FK já mudou e o rótulo
 * ainda não.
 *
 * Rejeita item arquivado: `ativo = false` significa "não use mais em cadastro novo". Quem já
 * aponta para ele continua apontando (por isso arquiva-se em vez de excluir).
 */
export async function resolverClassificacao(db: Db, e: EntradaClassificacao): Promise<Classificacao> {
  const out: Classificacao = {};

  if (e.cargoId !== undefined) {
    if (e.cargoId === null) {
      out.cargoId = null;
      out.cargo = null;
    } else {
      const c = await db.cargo.findUnique({ where: { id: e.cargoId }, select: { nome: true, ativo: true } });
      if (!c) throw new ActionError("Cargo não encontrado no catálogo.");
      if (!c.ativo) throw new ActionError(`O cargo "${c.nome}" está arquivado e não pode ser atribuído.`);
      out.cargoId = e.cargoId;
      out.cargo = c.nome;
    }
  }

  if (e.departamentoId !== undefined) {
    if (e.departamentoId === null) {
      out.departamentoId = null;
      out.departamento = null;
    } else {
      const d = await db.departamento.findUnique({
        where: { id: e.departamentoId },
        select: { nome: true, ativo: true },
      });
      if (!d) throw new ActionError("Departamento não encontrado no catálogo.");
      if (!d.ativo) throw new ActionError(`O departamento "${d.nome}" está arquivado e não pode ser atribuído.`);
      out.departamentoId = e.departamentoId;
      out.departamento = d.nome;
    }
  }

  return out;
}

/**
 * Renomeia um cargo e **propaga o novo rótulo** para o cache de quem aponta para ele.
 * Sem essa propagação, renomear no catálogo deixaria a grafia antiga em `User.cargo` — e é ela
 * que projetos/dashboard/preferências exibem.
 *
 * Deve rodar dentro de transação (o chamador passa o `tx`).
 */
export async function renomearCargo(db: Db, id: string, nome: string): Promise<number> {
  await db.cargo.update({ where: { id }, data: { nome } });
  const r = await db.user.updateMany({ where: { cargoId: id }, data: { cargo: nome } });
  return r.count;
}

/** Igual a `renomearCargo`, para departamento. */
export async function renomearDepartamento(db: Db, id: string, nome: string): Promise<number> {
  await db.departamento.update({ where: { id }, data: { nome } });
  const r = await db.user.updateMany({ where: { departamentoId: id }, data: { departamento: nome } });
  return r.count;
}

export type InconsistenciaCatalogo = { userId: string; nome: string; problema: string };

export type DiagnosticoCatalogo = {
  /**
   * Cache diverge da FK. **Não-vazio = defeito**: alguém escreveu `User.cargo`/`User.departamento`
   * por fora deste service. É este o portão pós-deploy.
   */
  divergentes: InconsistenciaCatalogo[];
  /**
   * Tem rótulo em texto mas nenhuma FK. **Esperado** entre a migration da 2.1 e a execução do
   * `backfill-cargos.ts` — separado dos divergentes justamente para não afogar o sinal de defeito
   * na janela em que todo mundo ainda está por classificar.
   */
  naoClassificados: InconsistenciaCatalogo[];
};

/**
 * Diagnóstico do par fonte-de-verdade (FK) × cache (texto).
 * Espelha `inconsistenciasDeCache` de `usuarios/vinculo/service.ts`, mas separa "ainda não
 * migrado" de "inconsistente" — os dois têm causas e urgências diferentes.
 */
export async function inconsistenciasDeCatalogo(db: Db): Promise<DiagnosticoCatalogo> {
  const usuarios = await db.user.findMany({
    where: { OR: [{ cargoId: { not: null } }, { departamentoId: { not: null } }, { cargo: { not: null } }, { departamento: { not: null } }] },
    select: {
      id: true,
      name: true,
      cargo: true,
      departamento: true,
      cargoRef: { select: { nome: true } },
      departamentoRef: { select: { nome: true } },
    },
  });

  const divergentes: InconsistenciaCatalogo[] = [];
  const naoClassificados: InconsistenciaCatalogo[] = [];
  for (const u of usuarios) {
    if (u.cargoRef && u.cargo !== u.cargoRef.nome) {
      divergentes.push({ userId: u.id, nome: u.name, problema: `cargo em cache ("${u.cargo}") difere do catálogo ("${u.cargoRef.nome}")` });
    }
    if (!u.cargoRef && u.cargo) {
      naoClassificados.push({ userId: u.id, nome: u.name, problema: `cargo "${u.cargo}" ainda sem item de catálogo` });
    }
    if (u.departamentoRef && u.departamento !== u.departamentoRef.nome) {
      divergentes.push({ userId: u.id, nome: u.name, problema: `departamento em cache ("${u.departamento}") difere do catálogo ("${u.departamentoRef.nome}")` });
    }
    if (!u.departamentoRef && u.departamento) {
      naoClassificados.push({ userId: u.id, nome: u.name, problema: `departamento "${u.departamento}" ainda sem item de catálogo` });
    }
  }
  return { divergentes, naoClassificados };
}
