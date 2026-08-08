"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { chaveMatch } from "@/lib/import/valores";
import { renomearCargo, renomearDepartamento } from "./service";
import {
  criarCargoSchema,
  editarCargoSchema,
  criarDepartamentoSchema,
  editarDepartamentoSchema,
  idSchema,
  reordenarSchema,
} from "./schemas";

/**
 * Gate por PERMISSÃO fina, não por `roles`: `administrativo` recebe `rh:catalogos` no seed e
 * precisa alcançar a tela. Um `requireRole("admin","supervisor")` o deixaria de fora.
 */
const base = { modulo: "rh", recurso: "rh", permissao: "catalogos" } as const;
const rev = () => {
  revalidatePath("/rh/catalogos");
  revalidatePath("/rh/pessoas");
};

/** Nome duplicado ignorando caixa/acento vira erro amigável em vez de violação de unique. */
async function garantirNomeLivre(tabela: "cargo" | "departamento", nome: string, ignoreId?: string) {
  const existentes =
    tabela === "cargo"
      ? await prisma.cargo.findMany({ select: { id: true, nome: true } })
      : await prisma.departamento.findMany({ select: { id: true, nome: true } });
  const alvo = chaveMatch(nome);
  const colisao = existentes.find((e) => e.id !== ignoreId && chaveMatch(e.nome) === alvo);
  if (colisao) {
    throw new ActionError(`Já existe "${colisao.nome}" na lista — use esse item ou escolha outro nome.`);
  }
}

export const criarCargo = defineAction(
  { ...base, acao: "criar-cargo", entidade: "Cargo", schema: criarCargoSchema },
  async (i) => {
    await garantirNomeLivre("cargo", i.nome);
    const ultimo = await prisma.cargo.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } });
    const c = await prisma.cargo.create({ data: { nome: i.nome, ordem: (ultimo?.ordem ?? -1) + 1 } });
    rev();
    return { id: c.id };
  },
);

export const editarCargo = defineAction(
  {
    ...base,
    acao: "editar-cargo",
    entidade: "Cargo",
    schema: editarCargoSchema,
    capturarAntes: async (i) => prisma.cargo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    await garantirNomeLivre("cargo", i.nome, i.id);
    // Renomear PRECISA propagar o rótulo em cache (`User.cargo`), senão projetos/dashboard
    // continuam exibindo a grafia antiga. Por isso passa pelo service, dentro de transação.
    const afetados = await prisma.$transaction((tx) => renomearCargo(tx, i.id, i.nome));
    rev();
    return { id: i.id, usuariosAtualizados: afetados };
  },
);

export const arquivarCargo = defineAction(
  { ...base, acao: "arquivar-cargo", entidade: "Cargo", schema: idSchema },
  async (i) => {
    const c = await prisma.cargo.findUnique({ where: { id: i.id }, select: { ativo: true } });
    if (!c) throw new ActionError("Cargo não encontrado.");
    await prisma.cargo.update({ where: { id: i.id }, data: { ativo: !c.ativo } });
    rev();
    return { id: i.id, ativo: !c.ativo };
  },
);

export const excluirCargo = defineAction(
  { ...base, acao: "excluir-cargo", entidade: "Cargo", schema: idSchema },
  async (i) => {
    const emUso = await prisma.user.count({ where: { cargoId: i.id } });
    if (emUso > 0) {
      throw new ActionError(`Este cargo está em uso por ${emUso} pessoa(s). Arquive-o em vez de excluir.`);
    }
    await prisma.cargo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

export const criarDepartamento = defineAction(
  { ...base, acao: "criar-departamento", entidade: "Departamento", schema: criarDepartamentoSchema },
  async (i) => {
    await garantirNomeLivre("departamento", i.nome);
    const ultimo = await prisma.departamento.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } });
    const d = await prisma.departamento.create({
      data: { nome: i.nome, setor: i.setor ?? null, ordem: (ultimo?.ordem ?? -1) + 1 },
    });
    rev();
    return { id: d.id };
  },
);

export const editarDepartamento = defineAction(
  {
    ...base,
    acao: "editar-departamento",
    entidade: "Departamento",
    schema: editarDepartamentoSchema,
    capturarAntes: async (i) => prisma.departamento.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    await garantirNomeLivre("departamento", i.nome, i.id);
    const afetados = await prisma.$transaction(async (tx) => {
      const n = await renomearDepartamento(tx, i.id, i.nome);
      await tx.departamento.update({ where: { id: i.id }, data: { setor: i.setor ?? null } });
      return n;
    });
    rev();
    return { id: i.id, usuariosAtualizados: afetados };
  },
);

export const arquivarDepartamento = defineAction(
  { ...base, acao: "arquivar-departamento", entidade: "Departamento", schema: idSchema },
  async (i) => {
    const d = await prisma.departamento.findUnique({ where: { id: i.id }, select: { ativo: true } });
    if (!d) throw new ActionError("Departamento não encontrado.");
    await prisma.departamento.update({ where: { id: i.id }, data: { ativo: !d.ativo } });
    rev();
    return { id: i.id, ativo: !d.ativo };
  },
);

export const excluirDepartamento = defineAction(
  { ...base, acao: "excluir-departamento", entidade: "Departamento", schema: idSchema },
  async (i) => {
    const emUso = await prisma.user.count({ where: { departamentoId: i.id } });
    if (emUso > 0) {
      throw new ActionError(`Este departamento está em uso por ${emUso} pessoa(s). Arquive-o em vez de excluir.`);
    }
    await prisma.departamento.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/**
 * Reordena a lista inteira, normalizando `ordem` para 0..n-1. Normalizar é o que conserta as
 * colisões herdadas do seed e do backfill (que numeram independentes, a partir de zero).
 * `audit: false` como no catálogo de disciplinas: reordenar é preferência de exibição.
 */
export const reordenarCargos = defineAction(
  { ...base, acao: "reordenar-cargos", schema: reordenarSchema, audit: false },
  async (i) => {
    await prisma.$transaction(i.ids.map((id, ordem) => prisma.cargo.update({ where: { id }, data: { ordem } })));
    rev();
    return { total: i.ids.length };
  },
);

export const reordenarDepartamentos = defineAction(
  { ...base, acao: "reordenar-departamentos", schema: reordenarSchema, audit: false },
  async (i) => {
    await prisma.$transaction(i.ids.map((id, ordem) => prisma.departamento.update({ where: { id }, data: { ordem } })));
    rev();
    return { total: i.ids.length };
  },
);
