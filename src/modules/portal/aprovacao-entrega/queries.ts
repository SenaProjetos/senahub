import "server-only";
import { prisma } from "@/lib/prisma";
import { contaPodeVerConversa, contasDoClienteDoProjeto, podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import type { Candidato } from "./itens";
import type { Resposta, StatusAprovacao } from "./regras";
import { candidatosDoProjeto, desatualizadosDoProjeto, parcelasDoProjeto } from "./service";

/**
 * Leituras da aprovação formal da entrega, uma por lado. A porta é a mesma do serviço: o cliente pela regra do portal
 * (`contaPodeVerConversa`), a equipe pela audiência da conversa (`podeVerConversaDoProjeto`); fora dela, `null`.
 *
 * O lado do CLIENTE nunca recebe: pacote cancelado, nome de quem enviou, parcela, nome de quem registrou por fora,
 * comprovante, nome de quem anulou.
 */

export type ItemDTO = {
  uploadId: string;
  disciplinaNome: string;
  faseSigla: string | null;
  documentoTitulo: string;
  revisaoRotulo: string;
  nomeArquivo: string;
  ehPdf: boolean;
  /** O arquivo ainda está nas Entregas do cliente (com link); fora delas, a lista o mostra sem link. */
  nasEntregas: boolean;
};

export type RespostaDTO = {
  id: string;
  resposta: Resposta;
  texto: string | null;
  origem: "portal" | "equipe";
  respondidoPorNome: string;
  respondidoEm: string;
  anulada: { em: string; motivo: string; por: string | null } | null;
  registradoPorNome: string | null;
  comprovante: { id: string; nome: string } | null;
};

export type AprovacaoDTO = {
  id: string;
  titulo: string;
  mensagem: string | null;
  status: StatusAprovacao;
  desatualizado: boolean;
  enviadoEm: string;
  enviadoPorNome: string | null;
  impressaoDigital: string;
  parcela: { id: string; rotulo: string } | null;
  itens: ItemDTO[];
  /** A ativa primeiro; depois as anuladas, da mais nova para a mais velha. */
  respostas: RespostaDTO[];
};

const ehPdf = (nome: string) => nome.toLowerCase().endsWith(".pdf");

async function montar(projetoId: string, lado: "cliente" | "equipe"): Promise<AprovacaoDTO[]> {
  const pacotes = await prisma.aprovacaoEntrega.findMany({
    where: { projetoId, ...(lado === "cliente" ? { status: { not: "cancelado" } } : {}) },
    orderBy: { enviadoEm: "desc" },
    select: {
      id: true,
      titulo: true,
      mensagem: true,
      status: true,
      enviadoEm: true,
      enviadoPorNome: true,
      impressaoDigital: true,
      parcela: { select: { id: true, descricao: true, contrato: { select: { titulo: true } } } },
      itens: { orderBy: { ordem: "asc" } },
      respostas: {
        orderBy: { registradoEm: "desc" },
        include: { comprovante: { select: { id: true, nome: true } } },
      },
    },
  });
  if (pacotes.length === 0) return [];
  // Uma montagem das Entregas por leitura: serve ao "desatualizado" e ao link de cada item.
  const nasEntregas = new Set((await candidatosDoProjeto(projetoId)).map((c) => c.uploadId));
  const desatualizados = await desatualizadosDoProjeto(
    projetoId,
    pacotes.filter((p) => p.status === "aguardando").map((p) => p.id),
    nasEntregas,
  );
  const equipe = lado === "equipe";

  const lista = pacotes.map<AprovacaoDTO>((p) => {
    const ativas = p.respostas.filter((r) => r.anuladaEm === null);
    const anuladas = p.respostas
      .filter((r) => r.anuladaEm !== null)
      .sort((a, b) => b.anuladaEm!.getTime() - a.anuladaEm!.getTime());
    return {
      id: p.id,
      titulo: p.titulo,
      mensagem: p.mensagem,
      status: p.status,
      desatualizado: desatualizados.has(p.id),
      enviadoEm: p.enviadoEm.toISOString(),
      enviadoPorNome: equipe ? p.enviadoPorNome : null,
      impressaoDigital: p.impressaoDigital,
      parcela: equipe && p.parcela ? { id: p.parcela.id, rotulo: `${p.parcela.contrato.titulo} — ${p.parcela.descricao}` } : null,
      itens: p.itens.map((i) => ({
        uploadId: i.uploadId,
        disciplinaNome: i.disciplinaNome,
        faseSigla: i.faseSigla,
        documentoTitulo: i.documentoTitulo,
        revisaoRotulo: i.revisaoRotulo,
        nomeArquivo: i.nomeArquivo,
        ehPdf: ehPdf(i.nomeArquivo),
        nasEntregas: nasEntregas.has(i.uploadId),
      })),
      respostas: [...ativas, ...anuladas].map((r) => ({
        id: r.id,
        resposta: r.resposta,
        texto: r.texto,
        origem: r.origem,
        respondidoPorNome: r.respondidoPorNome,
        respondidoEm: r.respondidoEm.toISOString(),
        anulada: r.anuladaEm
          ? { em: r.anuladaEm.toISOString(), motivo: r.motivoAnulacao ?? "", por: equipe ? r.anuladaPorNome : null }
          : null,
        registradoPorNome: equipe ? r.registradoPorNome : null,
        comprovante: equipe && r.comprovante ? { id: r.comprovante.id, nome: r.comprovante.nome } : null,
      })),
    };
  });
  if (lado === "cliente") {
    // Pendentes no topo (aguardando), o resto pela data de envio.
    lista.sort((a, b) => Number(b.status === "aguardando") - Number(a.status === "aguardando"));
  }
  return lista;
}

export async function aprovacoesParaCliente(projetoId: string, userId: string): Promise<AprovacaoDTO[] | null> {
  if (!(await contaPodeVerConversa(userId, projetoId))) return null;
  return montar(projetoId, "cliente");
}

export async function aprovacoesParaEquipe(projetoId: string, userId: string): Promise<AprovacaoDTO[] | null> {
  if (!(await podeVerConversaDoProjeto(userId, projetoId))) return null;
  return montar(projetoId, "equipe");
}

export type FormularioDeEnvio = {
  candidatos: Candidato[];
  parcelas: { id: string; rotulo: string }[];
  /** Contas ativas do cliente no portal; 0 = a resposta só entra por fora. */
  contasAtivas: number;
};

export async function formularioDeEnvio(projetoId: string, userId: string): Promise<FormularioDeEnvio | null> {
  if (!(await podeVerConversaDoProjeto(userId, projetoId))) return null;
  const candidatos = await candidatosDoProjeto(projetoId);
  const parcelas = await parcelasDoProjeto(projetoId);
  const contas = await contasDoClienteDoProjeto(projetoId);
  return { candidatos, parcelas, contasAtivas: contas.length };
}
