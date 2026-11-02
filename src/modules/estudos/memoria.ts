import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { montarMemoria } from "@/modules/ferramentas/service";
import type { MemoriaDoc } from "@/modules/ferramentas/memoria/types";

import { entradaDoMotor } from "./calculo";
import { FERRAMENTA_DO_ESTUDO } from "./acesso";
import { lerConteudo } from "./conteudo";
import { exigirAcesso } from "./service";

/**
 * Memória do estudo para os renderizadores PDF/Word/Excel da calculadora: o MESMO documento da
 * "Corrente e demanda" rodando sobre a lista achatada ("Ambiente — carga"), mais uma seção com a fonte
 * dos fatores de demanda e as observações. Sem subtotal por ambiente nesta versão. Lança `ActionError`
 * se a pessoa não pode ver; `null` se o estudo não existe ou o conteúdo gravado está ilegível.
 */
export async function memoriaDoEstudo(user: SessionUser, estudoId: string): Promise<{ doc: MemoriaDoc; nome: string } | null> {
  const estudo = await prisma.estudoProjeto.findUnique({
    where: { id: estudoId },
    select: {
      nome: true,
      projetoId: true,
      conteudo: true,
      updatedAt: true,
      atualizadoPor: { select: { name: true } },
      projeto: { select: { codigo: true, nome: true, endereco: true, cliente: { select: { nome: true } } } },
    },
  });
  if (!estudo) return null;
  await exigirAcesso(user, estudo.projetoId, false);
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
  return { doc, nome: estudo.nome };
}
