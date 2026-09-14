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
