import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterLicitacao } from "@/modules/licitacoes/queries";
import { brl, STATUS_LABEL } from "@/components/licitacoes/_shared";
import { totalComposicao, subtotalItem } from "@/modules/licitacoes/composicao/composicao";
import { saldoContratual, somaDeltas } from "@/modules/licitacoes/contrato/saldo";
import { formatarCodigo } from "@/modules/projetos/numbering";

export const metadata: Metadata = { title: "Processo da Licitação" };

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 border-b border-gray-300 pb-0.5 text-xs font-bold uppercase tracking-wide text-gray-600">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs leading-5">
      <span className="w-36 shrink-0 font-medium text-gray-500">{label}</span>
      <span className="text-gray-900">{value ?? "—"}</span>
    </div>
  );
}

export default async function ProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("licitacoes", "ver");
  const { id } = await params;

  const lic = await obterLicitacao(id);
  if (!lic) notFound();

  const somaMedicoes = lic.medicoes.reduce((s, m) => s + m.valor, 0);
  const deltaNet = lic.contrato ? somaDeltas(lic.contrato.aditivos) : 0;
  const saldo = lic.contrato
    ? saldoContratual(lic.contrato.valorHomologado, deltaNet, somaMedicoes)
    : null;
  const totalComp = lic.composicao ? totalComposicao(lic.composicao.itens) : null;

  return (
    <div className="doc-print-area overflow-auto">
      {/* A4 page wrapper — mirrors doc-pagina pattern */}
      <div
        className="doc-pagina mx-auto bg-white text-black shadow print:shadow-none"
        style={{ width: 794, minHeight: 1123, padding: "48px 56px" }}
      >
        {/* Cabeçalho do documento */}
        <header className="mb-6 border-b-2 border-gray-800 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Processo de Licitação
          </p>
          <h1 className="mt-1 text-base font-bold text-gray-900">{lic.titulo}</h1>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Gerado em {new Date().toLocaleString("pt-BR")}
          </p>
        </header>

        {/* 1. Identificação */}
        <Sec title="Identificação">
          <Row label="Status" value={STATUS_LABEL[lic.status] ?? lic.status} />
          <Row label="Órgão" value={lic.orgao} />
          <Row label="Modalidade" value={lic.modalidade} />
          <Row label="Nº Edital" value={lic.numeroEdital} />
          <Row label="Valor estimado" value={lic.valorEstimado != null ? brl(lic.valorEstimado) : null} />
          <Row label="Prazo proposta" value={fmt(lic.prazoProposta)} />
          {lic.projeto && (
            <Row label="Projeto" value={formatarCodigo(lic.projeto.codigo)} />
          )}
          {lic.observacoes && <Row label="Observações" value={lic.observacoes} />}
        </Sec>

        {/* 2. PNCP */}
        {(lic.numeroControlePNCP || lic.pncpUrl || lic.publicadoPNCPEm) && (
          <Sec title="PNCP">
            <Row label="Nº Controle" value={lic.numeroControlePNCP} />
            <Row label="Publicado em" value={lic.publicadoPNCPEm ? fmt(lic.publicadoPNCPEm.slice(0, 10)) : null} />
            {lic.pncpUrl && <Row label="URL" value={<span className="break-all">{lic.pncpUrl}</span>} />}
          </Sec>
        )}

        {/* 3. Viabilidade */}
        {lic.viabilidade && (
          <Sec title="Viabilidade (go/no-go)">
            <Row
              label="Decisão"
              value={
                { go: "GO", no_go: "NO-GO", pendente: "Pendente" }[lic.viabilidade.decisao] ??
                lic.viabilidade.decisao
              }
            />
            {lic.viabilidade.decididoPorNome && (
              <Row
                label="Decidido por"
                value={`${lic.viabilidade.decididoPorNome}${lic.viabilidade.decididoEm ? ` em ${new Date(lic.viabilidade.decididoEm).toLocaleString("pt-BR")}` : ""}`}
              />
            )}
            {lic.viabilidade.justificativa && (
              <Row label="Justificativa" value={lic.viabilidade.justificativa} />
            )}
            {lic.viabilidade.margemEsperadaPct != null && (
              <Row label="Margem esperada" value={`${lic.viabilidade.margemEsperadaPct}%`} />
            )}
            {lic.viabilidade.concorrenciaPrevista && (
              <Row label="Concorrência" value={lic.viabilidade.concorrenciaPrevista} />
            )}
            {lic.viabilidade.criterios.length > 0 && (
              <div className="mt-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-0.5 text-left font-medium text-gray-500">Critério</th>
                      <th className="py-0.5 text-left font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lic.viabilidade.criterios.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100">
                        <td className="py-0.5">{c.criterio}</td>
                        <td className="py-0.5">{c.atendido ? "Atendido" : "Pendente"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Sec>
        )}

        {/* 4. Composição de preço */}
        {lic.composicao && lic.composicao.itens.length > 0 && (
          <Sec title="Composição de preço">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-0.5 text-left font-medium text-gray-500">Descrição</th>
                  <th className="py-0.5 text-right font-medium text-gray-500">Qtd</th>
                  <th className="py-0.5 text-right font-medium text-gray-500">Valor unit.</th>
                  <th className="py-0.5 text-right font-medium text-gray-500">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lic.composicao.itens.map((it) => (
                  <tr key={it.id} className="border-b border-gray-100">
                    <td className="py-0.5">{it.descricao}</td>
                    <td className="py-0.5 text-right">{it.quantidade}</td>
                    <td className="py-0.5 text-right font-mono">{brl(it.valorUnitario)}</td>
                    <td className="py-0.5 text-right font-mono">{brl(subtotalItem(it))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300">
                  <td colSpan={3} className="py-1 font-semibold text-gray-700">Total</td>
                  <td className="py-1 text-right font-mono font-semibold">{brl(totalComp!)}</td>
                </tr>
              </tfoot>
            </table>
            {lic.composicao.observacao && (
              <p className="mt-1 text-[10px] italic text-gray-500">{lic.composicao.observacao}</p>
            )}
          </Sec>
        )}

        {/* 5. Contrato */}
        {lic.contrato && (
          <Sec title="Contrato">
            <Row label="Nº Contrato" value={lic.contrato.numeroContrato} />
            <Row label="Nº Empenho" value={lic.contrato.numeroEmpenho} />
            <Row label="Valor homologado" value={brl(lic.contrato.valorHomologado)} />
            <Row label="Vigência início" value={fmt(lic.contrato.vigenciaInicio)} />
            <Row label="Vigência fim" value={fmt(lic.contrato.vigenciaFim)} />
            {saldo != null && <Row label="Saldo contratual" value={brl(saldo)} />}
            {lic.contrato.reajuste && <Row label="Cláusula reajuste" value={lic.contrato.reajuste} />}
            {lic.contrato.garantiaTipo && (
              <Row
                label="Garantia"
                value={`${lic.contrato.garantiaTipo}${lic.contrato.garantiaValor != null ? ` · ${brl(lic.contrato.garantiaValor)}` : ""}${lic.contrato.garantiaValidade ? ` · val. ${fmt(lic.contrato.garantiaValidade)}` : ""}`}
              />
            )}

            {/* Aditivos */}
            {lic.contrato.aditivos.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Aditivos</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-0.5 text-left font-medium text-gray-500">Data</th>
                      <th className="py-0.5 text-left font-medium text-gray-500">Tipo</th>
                      <th className="py-0.5 text-right font-medium text-gray-500">Δ Valor</th>
                      <th className="py-0.5 text-left font-medium text-gray-500">Nova vigência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lic.contrato.aditivos.map((a) => (
                      <tr key={a.id} className="border-b border-gray-100">
                        <td className="py-0.5">{fmt(a.data)}</td>
                        <td className="py-0.5">{a.tipo}</td>
                        <td className="py-0.5 text-right font-mono">
                          {a.valorDelta != null ? brl(a.valorDelta) : "—"}
                        </td>
                        <td className="py-0.5">{fmt(a.novaVigencia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reajustes */}
            {lic.contrato.reajustes.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Reajustes</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-0.5 text-left font-medium text-gray-500">Aniversário</th>
                      <th className="py-0.5 text-left font-medium text-gray-500">Índice</th>
                      <th className="py-0.5 text-right font-medium text-gray-500">%</th>
                      <th className="py-0.5 text-right font-medium text-gray-500">Valor reaj.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lic.contrato.reajustes.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100">
                        <td className="py-0.5">{fmt(r.aniversario)}</td>
                        <td className="py-0.5">{r.indice}</td>
                        <td className="py-0.5 text-right font-mono">{r.percentual}%</td>
                        <td className="py-0.5 text-right font-mono">{brl(r.valorReajustado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Sec>
        )}

        {/* 6. Medições */}
        {lic.medicoes.length > 0 && (
          <Sec title="Medições">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-0.5 text-left font-medium text-gray-500">Nº</th>
                  <th className="py-0.5 text-left font-medium text-gray-500">Data</th>
                  <th className="py-0.5 text-right font-medium text-gray-500">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lic.medicoes.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className="py-0.5">{m.numero}</td>
                    <td className="py-0.5">{fmt(m.data)}</td>
                    <td className="py-0.5 text-right font-mono">{brl(m.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300">
                  <td colSpan={2} className="py-1 font-semibold text-gray-700">Total medido</td>
                  <td className="py-1 text-right font-mono font-semibold">{brl(somaMedicoes)}</td>
                </tr>
              </tfoot>
            </table>
          </Sec>
        )}

        {/* 7. Habilitação */}
        {lic.habilitacao.length > 0 && (
          <Sec title="Habilitação">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-0.5 text-left font-medium text-gray-500">Exigência</th>
                  <th className="py-0.5 text-left font-medium text-gray-500">Certidão</th>
                  <th className="py-0.5 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {lic.habilitacao.map((h) => (
                  <tr key={h.id} className="border-b border-gray-100">
                    <td className="py-0.5">{h.exigencia}</td>
                    <td className="py-0.5">{h.certidaoNome ?? "—"}</td>
                    <td className="py-0.5">{h.atendido ? "Atendido" : "Pendente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Sec>
        )}

        {/* 8. Responsáveis técnicos */}
        {lic.responsaveisTecnicos.length > 0 && (
          <Sec title="Responsáveis técnicos">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-0.5 text-left font-medium text-gray-500">Nome</th>
                  <th className="py-0.5 text-left font-medium text-gray-500">Registro</th>
                  <th className="py-0.5 text-left font-medium text-gray-500">Doc</th>
                  <th className="py-0.5 text-left font-medium text-gray-500">Nº Doc</th>
                </tr>
              </thead>
              <tbody>
                {lic.responsaveisTecnicos.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-0.5">{r.nome}</td>
                    <td className="py-0.5">{r.registro}{r.conselho ? ` · ${r.conselho}` : ""}</td>
                    <td className="py-0.5">{r.documentoTipo}</td>
                    <td className="py-0.5 font-mono">{r.numeroDocumento ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Sec>
        )}

        {/* 9. Subcontratações */}
        {lic.subcontratacoes.length > 0 && (
          <Sec title="Subcontratações">
            {lic.subcontratacaoMaxPct != null && (
              <p className="mb-1 text-xs text-gray-500">Teto: {lic.subcontratacaoMaxPct}%</p>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-0.5 text-left font-medium text-gray-500">Subcontratado</th>
                  <th className="py-0.5 text-left font-medium text-gray-500">Objeto</th>
                  <th className="py-0.5 text-right font-medium text-gray-500">%</th>
                </tr>
              </thead>
              <tbody>
                {lic.subcontratacoes.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-0.5">{s.fornecedorNome ?? s.nomeLivre ?? "—"}</td>
                    <td className="py-0.5 italic">{s.objeto}</td>
                    <td className="py-0.5 text-right font-mono">{s.percentual}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Sec>
        )}

        {/* 10. Resultado / concorrência */}
        {lic.resultado && (
          <Sec title="Resultado">
            <Row label="Vencedor" value={lic.resultado.vencedor} />
            <Row
              label="Valor vencedor"
              value={lic.resultado.valorVencedor != null ? brl(lic.resultado.valorVencedor) : null}
            />
            <Row
              label="Nossa classificação"
              value={lic.resultado.nossaClassificacao != null ? `${lic.resultado.nossaClassificacao}º` : null}
            />
            {lic.resultado.observacao && (
              <Row label="Observação" value={lic.resultado.observacao} />
            )}
          </Sec>
        )}

        {/* 11. Histórico (últimos eventos) */}
        {lic.historico.length > 0 && (
          <Sec title="Histórico">
            <ul className="space-y-0.5 text-xs text-gray-700">
              {lic.historico.map((h) => (
                <li key={h.id} className="flex gap-2">
                  <span className="w-32 shrink-0 font-mono text-gray-400">
                    {new Date(h.data).toLocaleString("pt-BR")}
                  </span>
                  <span>{h.descricao}</span>
                </li>
              ))}
            </ul>
          </Sec>
        )}
      </div>
    </div>
  );
}
