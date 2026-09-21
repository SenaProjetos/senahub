"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { CHAVE_DADOS_EMPRESA, dadosEmpresa, type DadosEmpresa } from "./queries";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

const salvarSchema = z.object({
  razaoSocial: z.string().min(1, "Informe a razão social."),
  cnpj: z.string().trim().optional(),
  endereco: z.string().trim().optional(),
  logoPath: z.string().trim().optional(),
  encarregadoDados: z.string().trim().max(200).optional(),
  foro: z.string().trim().max(120).optional(),
  // ADR-0006: contato, dados bancarios e assinatura usados pela proposta composta.
  telefone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  banco: z.string().trim().max(80).optional(),
  agencia: z.string().trim().max(20).optional(),
  conta: z.string().trim().max(30).optional(),
  pix: z.string().trim().max(160).optional(),
  responsavelNome: z.string().trim().max(120).optional(),
  responsavelCargo: z.string().trim().max(120).optional(),
  responsavelRegistro: z.string().trim().max(60).optional(),
});

/**
 * Substitui o registro inteiro (não há histórico de versões — é o timbrado atual). Se o novo
 * `logoPath` vem diferente do salvo, o arquivo antigo é removido do disco depois do commit —
 * mesmo cuidado do reimport da folha (`importar-service.ts`), pra não acumular logo órfão.
 */
export const salvarDadosEmpresa = defineAction(
  { ...base, acao: "salvar-dados-empresa", entidade: "ConfigSistema", schema: salvarSchema },
  async (i) => {
    const anterior = await dadosEmpresa();
    const valor: DadosEmpresa = {
      razaoSocial: i.razaoSocial,
      cnpj: i.cnpj || null,
      endereco: i.endereco || null,
      logoPath: i.logoPath || null,
      encarregadoDados: i.encarregadoDados || null,
      foro: i.foro || null,
      telefone: i.telefone || null,
      email: i.email || null,
      banco: i.banco || null,
      agencia: i.agencia || null,
      conta: i.conta || null,
      pix: i.pix || null,
      responsavelNome: i.responsavelNome || null,
      responsavelCargo: i.responsavelCargo || null,
      responsavelRegistro: i.responsavelRegistro || null,
    };
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_DADOS_EMPRESA },
      create: { chave: CHAVE_DADOS_EMPRESA, valor },
      update: { valor },
    });
    if (anterior?.logoPath && anterior.logoPath !== valor.logoPath) {
      await removerArquivo(anterior.logoPath).catch(() => {});
    }
    revalidatePath("/configuracoes/empresa");
    // O Termo de Uso lê estes dados na hora de exibir — nada a revalidar além da própria tela.
    return {};
  },
);
