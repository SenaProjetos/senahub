import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { primeiraColisaoNaVersao, type ItemComSiglasVersionadas } from "./colisao-sinonimo";
import { siglasEfetivas, type FaixaVersao, type SiglaLinha } from "./siglas-versao";

/**
 * Guardas de servidor das siglas por versão, compartilhadas pelo diálogo "Siglas por versão" e
 * pelos formulários de catálogo (card, sub, item da Lista Mestre).
 */

export type TipoItemSigla = "disciplina" | "subdisciplina" | "prancha";

/**
 * O "lugar" do nome que o item disputa (D4): card e sub-disciplina competem entre si (os dois
 * ocupam o lugar da disciplina no nome — ver `interpretar.ts`, `ehDisciplina`); fase, tipo e folha
 * são lugares próprios, cada um no seu escopo de projeto (global ou o do projeto).
 */
export type SlotSigla =
  | { tipo: "disciplina" }
  | { tipo: "prancha"; categoria: "fase" | "tipo" | "folha"; projetoId: string | null };

/** Chave estável do item para a checagem de colisão — evita cruzar id de tabelas diferentes. */
export function chaveItemSigla(tipo: TipoItemSigla, id: string): string {
  return `${tipo[0]}:${id}`;
}

const LINHAS = { select: { sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } as const;
const SEMPRE: FaixaVersao = { versaoDesde: 1, versaoAte: null };

type ItemDoSlot = ItemComSiglasVersionadas & { rotulo: string };

/**
 * Itens do mesmo lugar do nome, com as siglas recortadas pela validade do item (e do card-mãe,
 * para sub) — um card encerrado na v1 não ocupa a sigla dele na v2.
 */
async function itensDoSlot(slot: SlotSigla): Promise<ItemDoSlot[]> {
  if (slot.tipo === "prancha") {
    const itens = await prisma.pranchaCatalogo.findMany({
      where: { categoria: slot.categoria, projetoId: slot.projetoId },
      select: { id: true, nome: true, versaoDesde: true, versaoAte: true, siglas: LINHAS },
    });
    return itens.map((p) => ({ id: chaveItemSigla("prancha", p.id), rotulo: p.nome, siglas: siglasEfetivas(p.siglas, p) }));
  }
  const [cards, subs] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({
      select: { id: true, nome: true, versaoDesde: true, versaoAte: true, siglas: LINHAS },
    }),
    prisma.subdisciplinaCatalogo.findMany({
      select: {
        id: true,
        nome: true,
        versaoDesde: true,
        versaoAte: true,
        disciplinaCatalogo: { select: { nome: true, versaoDesde: true, versaoAte: true } },
        siglas: LINHAS,
      },
    }),
  ]);
  return [
    ...cards.map((c) => ({ id: chaveItemSigla("disciplina", c.id), rotulo: c.nome, siglas: siglasEfetivas(c.siglas, c) })),
    ...subs.map((s) => ({
      id: chaveItemSigla("subdisciplina", s.id),
      rotulo: `${s.nome} (sub de ${s.disciplinaCatalogo.nome})`,
      siglas: siglasEfetivas(s.siglas, s, s.disciplinaCatalogo),
    })),
  ];
}

/**
 * Recusa linhas de sigla que colidam, em alguma versão em comum, com outro item do mesmo lugar do
 * nome. `id` null = item ainda não criado. `faixaItem` recorta as linhas do próprio item.
 */
export async function garantirSiglasSemColisao(
  item: { tipo: TipoItemSigla; id: string | null; faixa?: FaixaVersao },
  slot: SlotSigla,
  linhas: readonly SiglaLinha[],
): Promise<void> {
  if (linhas.length === 0) return;
  const outros = await itensDoSlot(slot);
  const chave = item.id ? chaveItemSigla(item.tipo, item.id) : "__novo__";
  const colisao = primeiraColisaoNaVersao({ id: chave, siglas: siglasEfetivas(linhas, item.faixa ?? SEMPRE) }, outros);
  if (colisao) {
    const outro = outros.find((o) => o.id === colisao.comItemId)?.rotulo ?? "outro item";
    throw new ActionError(
      `"${colisao.sigla}" já é usada por “${outro}” nas mesmas versões. Encerre a sigla lá (ou mude a versão) antes.`,
    );
  }
}

/**
 * Faixa de versões válida: fim não anterior ao início, e toda versão citada já cadastrada (a v1
 * sempre existe — nasce na migration). Versão futura precisa existir como rascunho antes.
 */
export async function garantirFaixaVersao(faixa: FaixaVersao): Promise<void> {
  if (faixa.versaoAte !== null && faixa.versaoAte < faixa.versaoDesde) {
    throw new ActionError("A versão final não pode ser anterior à inicial.");
  }
  const numeros = [...new Set([faixa.versaoDesde, faixa.versaoAte].filter((n): n is number => n !== null && n > 1))];
  if (numeros.length === 0) return;
  const achadas = await prisma.nomenclaturaVersao.count({ where: { numero: { in: numeros } } });
  if (achadas < numeros.length) {
    throw new ActionError("Essa versão do padrão não existe — crie-a em Configurações → Nomenclatura antes.");
  }
}
