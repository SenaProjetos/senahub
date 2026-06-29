"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  ativoSchema,
  ativoEditarSchema,
  maquinaSchema,
  maquinaEditarSchema,
  componenteSchema,
  manutencaoSchema,
  idSchema,
} from "@/modules/patrimonio/schemas";

const revInv = () => revalidatePath("/patrimonio");
const revTi = () => {
  revalidatePath("/patrimonio/ti");
  revalidatePath("/patrimonio");
};

// ── Inventário (patrimonio:gerir) ─────────────────────────────
export const criarAtivo = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "gerir", acao: "criar-ativo", entidade: "Ativo", schema: ativoSchema },
  async (i) => {
    const a = await prisma.ativo.create({
      data: {
        nome: i.nome,
        categoria: i.categoria || null,
        localizacao: i.localizacao || null,
        responsavelId: i.responsavelId || null,
        dataAquisicao: i.dataAquisicao ? new Date(i.dataAquisicao) : null,
        valor: i.valor ?? null,
        status: i.status,
        observacao: i.observacao || null,
      },
    });
    revInv();
    return { id: a.id };
  },
);

export const editarAtivo = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "gerir", acao: "editar-ativo", entidade: "Ativo", schema: ativoEditarSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    await prisma.ativo.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        categoria: i.categoria || null,
        localizacao: i.localizacao || null,
        responsavelId: i.responsavelId || null,
        dataAquisicao: i.dataAquisicao ? new Date(i.dataAquisicao) : null,
        valor: i.valor ?? null,
        status: i.status,
        observacao: i.observacao || null,
      },
    });
    revInv();
    return { id: i.id };
  },
);

export const excluirAtivo = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "gerir", acao: "excluir-ativo", entidade: "Ativo", schema: idSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    await prisma.ativo.delete({ where: { id: i.id } });
    revInv();
    return { id: i.id };
  },
);

// ── Gerenciamento de TI (patrimonio:ti) ───────────────────────
export const criarMaquina = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "ti", acao: "criar-maquina", entidade: "MaquinaTI", schema: maquinaSchema },
  async (i) => {
    const m = await prisma.maquinaTI.create({
      data: {
        nome: i.nome,
        patrimonioId: i.patrimonioId || null,
        responsavelId: i.responsavelId || null,
        cpu: i.cpu || null,
        ram: i.ram || null,
        armazenamento: i.armazenamento || null,
        so: i.so || null,
        observacao: i.observacao || null,
      },
    });
    revTi();
    return { id: m.id };
  },
);

export const editarMaquina = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "ti", acao: "editar-maquina", entidade: "MaquinaTI", schema: maquinaEditarSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    await prisma.maquinaTI.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        patrimonioId: i.patrimonioId || null,
        responsavelId: i.responsavelId || null,
        cpu: i.cpu || null,
        ram: i.ram || null,
        armazenamento: i.armazenamento || null,
        so: i.so || null,
        observacao: i.observacao || null,
      },
    });
    revTi();
    return { id: i.id };
  },
);

export const excluirMaquina = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "ti", acao: "excluir-maquina", entidade: "MaquinaTI", schema: idSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    await prisma.maquinaTI.delete({ where: { id: i.id } });
    revTi();
    return { id: i.id };
  },
);

export const adicionarComponente = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "ti", acao: "add-componente", entidade: "ComponenteMaquina", schema: componenteSchema },
  async (i) => {
    const c = await prisma.componenteMaquina.create({
      data: { maquinaId: i.maquinaId, tipo: i.tipo, descricao: i.descricao, quantidade: i.quantidade },
    });
    revTi();
    return { id: c.id };
  },
);

export const removerComponente = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "ti", acao: "rm-componente", entidade: "ComponenteMaquina", schema: idSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    await prisma.componenteMaquina.delete({ where: { id: i.id } });
    revTi();
    return { id: i.id };
  },
);

export const adicionarManutencao = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "ti", acao: "add-manutencao", entidade: "ManutencaoMaquina", schema: manutencaoSchema },
  async (i) => {
    const m = await prisma.manutencaoMaquina.create({
      data: { maquinaId: i.maquinaId, data: new Date(i.data), descricao: i.descricao, custo: i.custo ?? null },
    });
    revTi();
    return { id: m.id };
  },
);

export const removerManutencao = defineAction(
  { modulo: "patrimonio", recurso: "patrimonio", permissao: "ti", acao: "rm-manutencao", entidade: "ManutencaoMaquina", schema: idSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    await prisma.manutencaoMaquina.delete({ where: { id: i.id } });
    revTi();
    return { id: i.id };
  },
);
