import Link from "next/link";
import { ArrowLeft, History, ShieldCheck } from "lucide-react";
import type { HistoricoProjeto, HistoricoItem } from "@/modules/projetos/historico/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { formatarDataHora } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

const ACAO_LABEL: Record<string, string> = {
  // Documentos / arquivos
  "enviar-arquivos": "Enviou arquivo(s)",
  "validar-entrega": "Validou a entrega",
  "validar-arquivo": "Validou arquivo",
  "reverter-validacao-arquivo": "Desfez validação de arquivo",
  "solicitar-ajuste-arquivo": "Solicitou ajuste em arquivo",
  "enviar-apontamentos": "Enviou apontamentos (pendências)",
  "gerar-aceite-cliente": "Gerou link de aceite",
  "renomear-arquivo": "Renomeou arquivo",
  "criar-prancha": "Criou folha (lista mestre)",
  "editar-prancha": "Editou folha",
  "excluir-prancha": "Excluiu folha",
  "importar-pranchas": "Importou folhas",
  "criar-arquivo": "Adicionou arquivo geral",
  "editar-arquivo": "Editou arquivo geral",
  "excluir-arquivo": "Enviou arquivo à lixeira",
  "excluir-arquivos-lote": "Enviou arquivos à lixeira",
  "restaurar-arquivo": "Restaurou arquivo da lixeira",
  "excluir-arquivo-definitivo": "Excluiu arquivo em definitivo",
  "adicionar-versao-arquivo": "Nova versão (arquivo geral)",
  "criar-documento": "Adicionou documento",
  "editar-documento": "Editou documento",
  "excluir-documento": "Excluiu documento",
  "adicionar-versao-documento": "Nova versão (documento)",
  // Itens do projeto
  "criar-projeto": "Criou o projeto",
  "editar-projeto": "Editou o projeto",
  "cancelar-projeto": "Alterou a situação do projeto",
  "criar-disciplina": "Adicionou disciplina",
  "editar-disciplina": "Editou disciplina",
  "excluir-disciplina": "Removeu disciplina",
  "editar-disciplinas-em-massa": "Editou disciplinas em massa",
  "adicionar-disciplinas-catalogo": "Adicionou disciplinas do catálogo",
  "atualizar-status-disciplina": "Mudou o status da disciplina",
  "definir-responsaveis": "Alterou responsáveis",
  "registrar-revisao": "Registrou revisão",
  "definir-membros": "Atualizou a equipe",
  // Inputs
  "adicionar-input": "Adicionou input",
  "remover-input": "Removeu input",
  "responder-inputs": "Respondeu inputs",
  "salvar-briefing": "Salvou o briefing (Start)",
  "gerar-link-input": "Gerou link público de inputs",
  "aplicar-inputs-padrao": "Aplicou inputs padrão",
  // Serviços terceirizados
  "criar-servico": "Adicionou serviço terceirizado",
  "editar-servico": "Editou serviço terceirizado",
  "excluir-servico": "Excluiu serviço terceirizado",
  // Extras
  "solicitar-revisao": "Solicitou revisão",
  "responder-revisao": "Respondeu solicitação de revisão",
  "salvar-composicao": "Salvou a composição de preço",
  "salvar-lm-config": "Salvou a configuração de LM",
  "salvar-linha-base": "Salvou linha de base do cronograma",
  "excluir-linha-base": "Excluiu linha de base",
  "criar-checklist-item": "Adicionou item ao checklist",
  "toggle-checklist-item": "Marcou/desmarcou item do checklist",
  "excluir-checklist-item": "Removeu item do checklist",
  "criar-risco-projeto": "Registrou risco",
  "atualizar-risco-projeto": "Atualizou risco",
  "excluir-risco-projeto": "Removeu risco",
  // Diário
  "criar-entrada-diario": "Escreveu no diário",
  "editar-entrada-diario": "Editou entrada do diário",
  "excluir-entrada-diario": "Excluiu entrada do diário",
  // Nomenclatura
  "salvar-nomenclatura-projeto": "Salvou a nomenclatura do projeto",
  "limpar-nomenclatura-projeto": "Limpou a nomenclatura do projeto",
  // Pendências / apontamentos
  "criar-pendencia": "Criou apontamento",
  "editar-pendencia": "Editou apontamento",
  "excluir-pendencia": "Excluiu apontamento",
  "resolver-pendencia": "Resolveu apontamento",
  "reabrir-pendencia": "Reabriu apontamento",
  "fechar-pendencia": "Encerrou apontamento",
  "descartar-pendencia": "Descartou apontamento",
  // Receita
  "definir-valor-contrato": "Definiu o valor de contrato",
  "gerar-parcelas-projeto": "Gerou parcelas de recebível",
  "faturar-entrega": "Faturou entrega",
  "limpar-parcelas-projeto": "Limpou parcelas de recebível",
};

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  entregue: "Entregue",
  aprovado: "Aprovado",
};

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function idsDe(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function nomesDe(ids: string[], nomes: Record<string, string>): string[] {
  return ids.map((id) => nomes[id] ?? "usuário removido");
}

/** Resumo humano do detalhe do evento (quando útil). */
function resumo(item: HistoricoItem, nomes: Record<string, string>): string | null {
  const d = item.detalhe;
  if (!d) return null;
  const antes = (d.antes ?? null) as Record<string, unknown> | null;
  // Sem capturarAntes, o detalhe É o próprio input — trata o topo como "novo".
  const novo = (d.novo ?? d) as Record<string, unknown>;

  switch (item.acao) {
    case "renomear-arquivo": {
      const de = texto(antes?.nomeArquivo);
      const para = texto(novo.nome);
      if (de && para) return `“${de}” → “${para}”`;
      return para ? `→ “${para}”` : null;
    }
    case "enviar-arquivos": {
      const pacote = texto(d.pacote);
      const total = typeof d.total === "number" ? d.total : null;
      return [pacote ? `pacote ${pacote}` : null, total ? `${total} arquivo(s)` : null]
        .filter(Boolean).join(" · ") || null;
    }
    case "atualizar-status-disciplina": {
      const de = texto(antes?.status);
      const para = texto(novo.status);
      const nome = texto(antes?.nome);
      const trans = de && para
        ? `${STATUS_LABEL[de] ?? de} → ${STATUS_LABEL[para] ?? para}`
        : para ? (STATUS_LABEL[para] ?? para) : null;
      return [nome, trans].filter(Boolean).join(": ") || null;
    }
    case "definir-responsaveis":
    case "editar-disciplina": {
      const antesIds = idsDe(antes?.responsaveisIds);
      const novoIds = idsDe(novo.responsaveisIds);
      const add = nomesDe(novoIds.filter((x) => !antesIds.includes(x)), nomes);
      const rem = nomesDe(antesIds.filter((x) => !novoIds.includes(x)), nomes);
      const parts: string[] = [];
      if (item.acao === "editar-disciplina" && texto(novo.nome)) parts.push(String(novo.nome));
      if (add.length) parts.push(`+ ${add.join(", ")}`);
      if (rem.length) parts.push(`− ${rem.join(", ")}`);
      if (parts.length) return parts.join(" · ");
      return item.acao === "editar-disciplina" ? texto(novo.nome) : "atribuições atualizadas";
    }
    case "criar-disciplina":
    case "criar-projeto":
    case "editar-projeto":
      return texto(novo.nome);
    case "excluir-disciplina":
      return texto(antes?.nome);
    case "registrar-revisao":
      return texto(novo.motivo);
    case "adicionar-disciplinas-catalogo": {
      const ns = idsDe(novo.nomes);
      return ns.length ? ns.join(", ") : null;
    }
    case "editar-disciplinas-em-massa": {
      const qtd = idsDe(novo.disciplinaIds).length;
      const st = texto(novo.status);
      const respId = texto(novo.responsavelId);
      return [
        qtd ? `${qtd} disciplina(s)` : null,
        st ? `status → ${STATUS_LABEL[st] ?? st}` : null,
        respId ? `resp. → ${nomes[respId] ?? "—"}` : null,
      ].filter(Boolean).join(" · ") || null;
    }
    case "definir-membros": {
      const nms = idsDe(
        Array.isArray(novo.membros)
          ? (novo.membros as { userId?: string }[]).map((m) => m?.userId).filter(Boolean)
          : [],
      );
      const rotulos = nomesDe(nms, nomes);
      return rotulos.length
        ? `${rotulos.length} membro(s): ${rotulos.slice(0, 4).join(", ")}${rotulos.length > 4 ? "…" : ""}`
        : "equipe atualizada";
    }
    case "cancelar-projeto":
      return [texto(novo.situacao), texto(novo.motivo)].filter(Boolean).join(" — ") || null;
    case "adicionar-input":
      return texto(novo.pergunta);
    case "criar-servico":
    case "editar-servico":
    case "criar-checklist-item":
    case "criar-risco-projeto":
      return texto(novo.descricao);
    case "solicitar-revisao":
      return texto(novo.motivo);
    case "responder-revisao":
      return novo.aceitar === true ? "Aceita" : novo.aceitar === false ? "Recusada" : null;
    case "salvar-nomenclatura-projeto":
      return texto(novo.padrao) ?? texto(novo.template);
    case "definir-valor-contrato":
      return typeof novo.valorContrato === "number" ? `R$ ${novo.valorContrato.toLocaleString("pt-BR")}` : null;
    case "gerar-parcelas-projeto": {
      const np = typeof novo.numeroParcelas === "number" ? novo.numeroParcelas : null;
      const vt = typeof novo.valorTotal === "number" ? `R$ ${novo.valorTotal.toLocaleString("pt-BR")}` : null;
      return [np ? `${np}x` : null, vt].filter(Boolean).join(" · ") || null;
    }
    default:
      return null;
  }
}

export function HistoricoView({
  projeto,
  historico,
}: {
  projeto: { id: string; codigo: string; nome: string };
  historico: HistoricoProjeto;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
        </Link>
        <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          Histórico <ShieldCheck className="size-5 text-muted-foreground" />
        </h2>
        <p className="text-sm text-muted-foreground">
          Registro imutável de todas as alterações deste projeto — documentos (CDE) e itens (disciplinas, status,
          responsáveis, equipe). Visível apenas a administradores e cargos autorizados. {historico.total} evento(s).
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {historico.itens.length === 0 ? (
            <EmptyState icon={History} title="Sem eventos" description="Nenhuma alteração registrada ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Quando</th>
                    <th className="px-4 py-2">Quem</th>
                    <th className="px-4 py-2">Evento</th>
                    <th className="px-4 py-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historico.itens.map((it) => {
                    const r = resumo(it, historico.nomes);
                    return (
                      <tr key={it.id} className="hover:bg-muted/40">
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">
                          {formatarDataHora(it.quando)}
                        </td>
                        <td className="px-4 py-2">{it.autor}</td>
                        <td className="px-4 py-2">
                          <span className="font-medium">{ACAO_LABEL[it.acao] ?? it.acao}</span>
                          {it.resultado !== "sucesso" && (
                            <Badge variant="outline" className="ml-2 text-[10px] capitalize">{it.resultado}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{r ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination page={historico.page} pageCount={historico.pageCount} pageSize={historico.take} total={historico.total} />
    </div>
  );
}
