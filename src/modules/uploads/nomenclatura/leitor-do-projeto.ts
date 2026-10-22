import "server-only";
import { prisma } from "@/lib/prisma";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { interpretarNomeArquivo, type Interpretacao } from "./interpretar";
import { carregarCatalogosNomenclaturaDaVersao, carregarExtensoesNomenclatura } from "./queries";
import { montarVocabulario, type Vocabulario } from "./vocabulario";

/**
 * O motor de nomenclatura com o contexto de UM projeto — o mesmo que o envio de arquivo monta
 * (`api/uploads/route.ts`): padrão e vocabulário da versão que o projeto segue, catálogo de
 * extensões e o card da disciplina. Carrega tudo uma vez; ler cada nome é puro.
 */
export async function leitorDoProjeto(
  projetoId: string,
  disciplinaCatalogoId: string | null,
): Promise<{ ler: (nome: string) => Interpretacao; vocabulario: Vocabulario }> {
  const [projeto, nomenclatura, extensoes] = await Promise.all([
    prisma.projeto.findUniqueOrThrow({ where: { id: projetoId }, select: { codigo: true, ano: true, sequencial: true } }),
    resolverNomenclatura(projetoId),
    carregarExtensoesNomenclatura(),
  ]);
  const catalogos = await carregarCatalogosNomenclaturaDaVersao(projetoId, nomenclatura.versao?.numero ?? 1);
  const vocabulario = montarVocabulario(catalogos, projetoId);
  const ler = (nome: string) =>
    interpretarNomeArquivo(nome, {
      projeto: { codigo: projeto.codigo, ano: projeto.ano, sequencial: projeto.sequencial },
      disciplinaCatalogoId,
      padrao: nomenclatura.padrao,
      vocabulario,
      extensoes,
      outrosPadroes: nomenclatura.outrosPadroes,
    });
  return { ler, vocabulario };
}
