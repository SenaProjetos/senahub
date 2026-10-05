"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { campo } from "@/lib/campos/zod";
import { exigirCamposValidos } from "@/lib/campos/exigir";
import { TIPOS_PIX, validarChavePix } from "@/modules/rh/contas/pix";
import { CHAVE_DADOS_EMPRESA, dadosEmpresa, type DadosEmpresa } from "./queries";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

/** A chave PIX da empresa não tem campo de tipo: vale se for válida como qualquer um dos tipos. */
const pixValido = (v: string) => TIPOS_PIX.some((t) => validarChavePix(t, v).ok);
const MSG_PIX = "Chave PIX inválida. Use CPF, CNPJ, e-mail, telefone ou chave aleatória.";

// Dados já gravados que a tela reabre: o inválido antigo passa sem mexer (D4), o novo é recusado
// em `exigirCamposValidos` com a mensagem no campo.
const salvarSchema = z.object({
  razaoSocial: z.string().min(1, "Informe a razão social."),
  cnpj: campo.cnpj({ legado: true }),
  endereco: z.string().trim().optional(),
  logoPath: z.string().trim().optional(),
  encarregadoDados: z.string().trim().max(200).optional(),
  foro: z.string().trim().max(120).optional(),
  // ADR-0006: contato, dados bancarios e assinatura usados pela proposta composta.
  telefone: campo.telefone({ legado: true }),
  email: campo.email({ legado: true }),
  banco: z.string().trim().max(80).optional(),
  agencia: campo.agencia({ legado: true }),
  conta: campo.conta({ legado: true }),
  pix: z.string().trim().max(160, "Chave PIX longa demais (até 160 caracteres).").optional(), // campo-ok: PIX da empresa sem tipo; a regra (válido por qualquer tipo, só se mudou) fica no handler
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
    // Antes de qualquer escrita: só o valor que MUDOU é validado; o inválido já gravado segue salvando.
    exigirCamposValidos(i, anterior, {
      cnpj: "cnpj", telefone: "telefone", email: "email", agencia: "agencia", conta: "conta",
    });
    // PIX sem tipo: vale se for válido como QUALQUER tipo; o inválido já gravado segue salvando (D4).
    if (i.pix && !pixValido(i.pix) && i.pix !== (anterior?.pix ?? "").trim()) {
      throw new ActionError(MSG_PIX, { pix: MSG_PIX });
    }
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
