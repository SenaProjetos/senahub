import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { montarMemoria } from "@/modules/ferramentas/service";
import type { MemoriaDoc } from "@/modules/ferramentas/memoria/types";

import { diaDeSaoPaulo } from "@/lib/data";

import { entradaDoMotor } from "./calculo";
import { FERRAMENTA_DO_ESTUDO, TIPO_ESTUDO_CARGAS, TIPO_ESTUDO_CARGAS_DEMANDA } from "./acesso";
import { lerConteudo as lerConteudoCargasDemanda } from "./cargas-demanda/conteudo";
import { montarRelatorio } from "./cargas-demanda/relatorio/montar";
import type { RelatorioCargas } from "./cargas-demanda/relatorio/tipos";
import { lerConteudo } from "./conteudo";
import { exigirAcesso } from "./service";
import { tipoDaLinha } from "./tipos";

/** O que a rota exporta: a memória do estudo por ambiente (legado) ou o relatório do estudo de cargas e demanda. */
export type ExportacaoDoEstudo =
  | { tipo: typeof TIPO_ESTUDO_CARGAS; doc: MemoriaDoc; nome: string }
  | { tipo: typeof TIPO_ESTUDO_CARGAS_DEMANDA; relatorio: RelatorioCargas; nome: string };

/**
 * Memória do estudo para os renderizadores PDF/Word/Excel da calculadora: o MESMO documento da
 * "Corrente e demanda" rodando sobre a lista achatada ("Ambiente — carga"), mais uma seção com a fonte
 * dos fatores de demanda e as observações. Sem subtotal por ambiente nesta versão. Lança `ActionError`
 * se a pessoa não pode ver; `null` se o estudo não existe ou o conteúdo gravado está ilegível.
 */
export async function memoriaDoEstudo(user: SessionUser, estudoId: string): Promise<ExportacaoDoEstudo | null> {
  const estudo = await prisma.estudoProjeto.findUnique({
    where: { id: estudoId },
    select: {
      tipo: true,
      nome: true,
      projetoId: true,
      conteudo: true,
      updatedAt: true,
      atualizadoPor: { select: { name: true } },
      projeto: { select: { codigo: true, nome: true, endereco: true, cliente: { select: { nome: true } } } },
    },
  });
  if (!estudo) return null;
  const tipo = tipoDaLinha(estudo.tipo);
  if (tipo === TIPO_ESTUDO_CARGAS_DEMANDA) {
    await exigirAcesso(user, estudo.projetoId, false, TIPO_ESTUDO_CARGAS_DEMANDA);
    const doc = lerConteudoCargasDemanda(estudo.conteudo);
    if (!doc) return null;
    const relatorio = montarRelatorio(doc, {
      nomeEstudo: estudo.nome,
      obra: `${estudo.projeto.codigo} — ${estudo.projeto.nome}`,
      cliente: estudo.projeto.cliente.nome,
      local: estudo.projeto.endereco ?? undefined,
      emissao: diaDeSaoPaulo(),
    });
    return { tipo, relatorio, nome: estudo.nome };
  }
  await exigirAcesso(user, estudo.projetoId, false, TIPO_ESTUDO_CARGAS);
  const conteudo = lerConteudo(estudo.conteudo);
  if (!conteudo || conteudo.ambientes.every((a) => a.cargas.length === 0)) return null;

  const obra = `${estudo.projeto.codigo} — ${estudo.projeto.nome}`;
  const doc = montarMemoria(FERRAMENTA_DO_ESTUDO, entradaDoMotor(conteudo) as unknown as Record<string, unknown>, {
    titulo: estudo.nome,
    autor: estudo.atualizadoPor.name,
    projeto: obra,
    identificacao: { obra, cliente: estudo.projeto.cliente.nome, local: estudo.projeto.endereco ?? undefined },
    geradoEm: estudo.updatedAt.toISOString(),
  });

  const paragrafos = [
    conteudo.fonteFatorDemanda ? `Fonte dos fatores de demanda: ${conteudo.fonteFatorDemanda}` : "Fonte dos fatores de demanda: não informada.",
    ...(conteudo.observacoes ? [`Observações: ${conteudo.observacoes}`] : []),
  ];
  doc.secoes.push({ titulo: "Origem dos fatores e observações do estudo", paragrafos });
  return { tipo: TIPO_ESTUDO_CARGAS, doc, nome: estudo.nome };
}
