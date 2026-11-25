import "server-only";

/**
 * I/O do resumo diário de obra (spec docs/superpowers/specs/2026-11-25-portal-conta-obra-design.md). Roda dentro da rodada do
 * resumo do portal (`rodarResumoDiario`), nos MESMOS dias avaliados, com a MESMA reserva por conta + projeto + dia + canal e a
 * mesma liberação quando o envio falha. As regras são do puro `resumo-obra.ts`.
 *
 * Os tipos vêm de `../resumo-service` só com `import type`: o import inverso (ele chama `resumirObras`) é de valor.
 */
import { prisma } from "@/lib/prisma";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";
import { ROTULO_SITUACAO } from "@/modules/uploads/revisao-marcada";
import type { EnviarEmailResumo, NotificarSino, ResultadoResumo } from "../resumo-service";
import { fimDoDiaSp, itensDosDias, listaEmMarkdown, periodoDoResumo, textoDoSino, type ItemDoResumo } from "../resumo-diario";
import { liberarAvisoPortal, reservarAvisoPortal } from "../resumo-reserva";
import { obrasValidas } from "./regras";
import { diasDaConta, fatosDaObra, itemDoFato, mudancasDosControles, mudancasDosEventos } from "./resumo-obra";

const CATEGORIA_RESUMO = "portal_resumo";
const PASTA_OBRA = ROTULO_SITUACAO.liberado_obra;
const inicioDoDiaSp = (d: string) => new Date(`${d}T03:00:00.000Z`);
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";
const soDosDias = <T>(porDia: ReadonlyMap<string, T>, dias: readonly string[]) => new Map([...porDia].filter(([d]) => dias.includes(d)));

type ContaDaObra = { id: string; name: string; email: string | null; desde: Date };

/** Os itens do resumo de uma obra nos dias pedidos: as duas fontes de "Liberado para obra", por documento e dia. */
async function itensDaObra(projetoId: string, dias: readonly string[]): Promise<ItemDoResumo[]> {
  const inicio = inicioDoDiaSp(dias[0]);
  const fim = fimDoDiaSp(dias[dias.length - 1]);

  // Dentro do ciclo documental: controles aplicados ou removidos na janela.
  const controles = await prisma.controleRevisao.findMany({
    where: {
      tipo: "liberado_obra",
      revisao: { documento: { disciplina: { projetoId } } },
      OR: [{ aplicadoEm: { gte: inicio, lt: fim } }, { removidoEm: { gte: inicio, lt: fim } }],
    },
    select: { aplicadoEm: true, removidoEm: true, origem: true, revisao: { select: { numero: true, documentoId: true } } },
  });

  // Fora do ciclo: o histórico INTEIRO dos documentos com evento na janela (a revisão marcada antes decide "substituída").
  const naJanela = await prisma.documentoEvento.findMany({
    where: {
      tipo: { in: ["situacao_marcada", "situacao_retirada"] },
      documento: { disciplina: { projetoId } },
      detalhe: { path: ["pasta"], equals: PASTA_OBRA },
      createdAt: { gte: inicio, lt: fim },
    },
    distinct: ["documentoId"],
    select: { documentoId: true },
  });
  const eventos = naJanela.length
    ? await prisma.documentoEvento.findMany({
        where: {
          documentoId: { in: naJanela.map((e) => e.documentoId) },
          tipo: { in: ["situacao_marcada", "situacao_retirada"] },
          detalhe: { path: ["pasta"], equals: PASTA_OBRA },
          createdAt: { lt: fim },
        },
        select: { documentoId: true, tipo: true, detalhe: true, createdAt: true },
      })
    : [];

  const mudancas = [
    ...mudancasDosControles(
      controles.map((c) => ({
        documentoId: c.revisao.documentoId,
        numero: c.revisao.numero,
        aplicadoEm: c.aplicadoEm,
        removidoEm: c.removidoEm,
        origem: c.origem,
      })),
    ),
    ...mudancasDosEventos(
      eventos.flatMap((e) => {
        const revisao = (e.detalhe as { revisao?: unknown } | null)?.revisao;
        return typeof revisao === "number"
          ? [{ documentoId: e.documentoId, tipo: e.tipo as "situacao_marcada" | "situacao_retirada", revisao, em: e.createdAt }]
          : [];
      }),
    ),
  ];
  const fatos = fatosDaObra(mudancas, dias);
  if (fatos.length === 0) return [];

  const documentos = await prisma.documentoDisciplina.findMany({
    where: { id: { in: [...new Set(fatos.map((f) => f.documentoId))] } },
    select: { id: true, nomeArquivo: true, disciplina: { select: { disciplinaTextoLegado: true } } },
  });
  const porId = new Map(documentos.map((d) => [d.id, d]));
  return fatos.flatMap((f) => {
    const d = porId.get(f.documentoId);
    return d ? [itemDoFato(f, { disciplina: d.disciplina.disciplinaTextoLegado, nome: d.nomeArquivo })] : [];
  });
}

/**
 * O resumo de obra de uma rodada: para cada obra com conta de obra válida (`obrasValidas`), os itens dos dias e, por conta, o
 * sino e o e-mail (opt-out `portal_resumo`), cada um reservado antes de sair. Uma obra com problema não trava as outras.
 */
export async function resumirObras(
  r: ResultadoResumo,
  o: { enviar: EnviarEmailResumo | null; notificar: NotificarSino; somenteProjetos?: string[] },
  app: string,
): Promise<void> {
  if (r.dias.length === 0) return;
  const contas = await prisma.contaObra.findMany({
    where: { user: { ativo: true, tipo: "externo", clienteId: null } },
    select: {
      clienteId: true,
      cliente: { select: { ativo: true } },
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      projetos: {
        select: { projetoId: true, criadoEm: true, projeto: { select: { id: true, nome: true, codigo: true, clienteId: true, cliente: { select: { ativo: true } } } } },
      },
    },
  });

  // Obra → contas que a veem hoje, cada uma com o instante desde quando (a conta ou a obra na lista, o que vier depois).
  const porObra = new Map<string, { projeto: { id: string; nome: string; codigo: string }; contas: ContaDaObra[] }>();
  for (const c of contas) {
    const validas = obrasValidas(
      { clienteId: c.clienteId, clienteAtivo: c.cliente?.ativo ?? false },
      c.projetos.map((i) => ({ ...i, clienteId: i.projeto.clienteId, clienteAtivo: i.projeto.cliente.ativo })),
    );
    for (const i of validas) {
      if (o.somenteProjetos && !o.somenteProjetos.includes(i.projetoId)) continue;
      const desde = new Date(Math.max(c.user.createdAt.getTime(), i.criadoEm.getTime()));
      const g = porObra.get(i.projetoId) ?? { projeto: i.projeto, contas: [] };
      g.contas.push({ id: c.user.id, name: c.user.name, email: c.user.email, desde });
      porObra.set(i.projetoId, g);
    }
  }

  for (const { projeto: p, contas: daObra } of porObra.values()) {
    r.obras += 1;
    try {
      const porDia = itensDosDias(await itensDaObra(p.id, r.dias), r.dias);
      if (porDia.size === 0) continue;
      const querEmail = new Set(await filtrarPorCategoria(daObra.map((c) => c.id), CATEGORIA_RESUMO));
      for (const conta of daObra) await avisarConta(conta, p, porDia, querEmail.has(conta.id), r, o, app);
    } catch (e) {
      r.falhas += 1;
      console.error(`[portal] resumo de obra: projeto ${p.codigo} falhou:`, e);
    }
  }
}

async function avisarConta(
  conta: ContaDaObra,
  p: { id: string; nome: string },
  porDia: Map<string, ItemDoResumo[]>,
  querEmail: boolean,
  r: ResultadoResumo,
  o: { enviar: EnviarEmailResumo | null; notificar: NotificarSino },
  app: string,
): Promise<void> {
  const dias = diasDaConta([...porDia.keys()], conta.desde);
  if (dias.length === 0) return;
  const daConta = soDosDias(porDia, dias);

  const diasSino = await reservarAvisoPortal(conta.id, p.id, dias, "sino");
  if (diasSino.length < dias.length) r.duplicados += 1;
  if (diasSino.length > 0) {
    try {
      await o.notificar(conta.id, { titulo: `Novidades na obra ${p.nome}`, corpo: textoDoSino(soDosDias(daConta, diasSino)), href: `/portal/${p.id}` });
      r.sinos += 1;
    } catch (e) {
      await liberarAvisoPortal(conta.id, p.id, diasSino, "sino");
      r.falhas += 1;
      console.error("[portal] resumo de obra: sino falhou:", e);
    }
  }

  if (!o.enviar) return;
  if (!conta.email) {
    r.semEmail += 1;
    return;
  }
  if (!querEmail) {
    r.optOut += 1;
    return;
  }
  const diasEmail = await reservarAvisoPortal(conta.id, p.id, dias, "email");
  if (diasEmail.length < dias.length) r.duplicados += 1;
  if (diasEmail.length === 0) return;
  try {
    const saiu = await o.enviar(conta.email, {
      nome: primeiroNome(conta.name),
      projeto: p.nome,
      periodo: periodoDoResumo(diasEmail),
      lista: listaEmMarkdown(soDosDias(daConta, diasEmail)),
      url: `${app}/portal/${p.id}`,
    });
    if (!saiu) throw new Error("o e-mail não saiu");
    r.emails += 1;
  } catch (e) {
    await liberarAvisoPortal(conta.id, p.id, diasEmail, "email");
    r.falhas += 1;
    console.error("[portal] resumo de obra: e-mail falhou:", e);
  }
}
