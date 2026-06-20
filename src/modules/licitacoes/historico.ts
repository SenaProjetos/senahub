import type { Prisma } from "@/generated/prisma/client";
import { brl } from "@/lib/utils";
import { STATUS_LICITACAO_LABEL, type StatusLicitacao } from "./status";

type DB = Prisma.TransactionClient;

export async function registrarHistorico(
  db: DB,
  licitacaoId: string,
  descricao: string,
  autorId?: string | null,
): Promise<void> {
  await db.licitacaoHistorico.create({
    data: { licitacaoId, descricao, autorId: autorId ?? null },
  });
}

export function textoMudancaStatus(de: StatusLicitacao, para: StatusLicitacao): string {
  return `Status alterado: ${STATUS_LICITACAO_LABEL[de]} → ${STATUS_LICITACAO_LABEL[para]}`;
}

export function textoUploadDoc(titulo: string, numero: number): string {
  return `Documento '${titulo}' enviado (v${numero})`;
}

export function textoMedicao(numero: number, valor: number, data: string): string {
  const fmt = brl(valor);
  return `Medição nº ${numero} registrada — ${fmt} em ${data}`;
}

export function textoImportacao(codigo: string): string {
  return `Licitação importada para o projeto ${codigo}`;
}

export function textoExclusaoMedicao(numero: number, valor: number): string {
  const fmt = brl(valor);
  return `Medição nº ${numero} (${fmt}) removida.`;
}

export function textoExclusaoVersaoDoc(docTitulo: string, versaoNumero: number): string {
  return `Versão v${versaoNumero} do documento '${docTitulo}' removida.`;
}
