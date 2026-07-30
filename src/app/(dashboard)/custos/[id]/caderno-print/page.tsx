import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { dadosCaderno } from "@/modules/custos/quantitativos/queries";
import { formatarData, formatarDataHora } from "@/lib/utils";

const ORIGEM_LABEL: Record<string, string> = { manual: "Manual", ifc: "IFC", dwg: "DXF", pdf: "PDF", ia: "IA" };

/** Página de impressão do caderno de quantitativos — renderizada por puppeteer na rota do PDF. */
export default async function PrintCadernoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("custos", "ver");
  const { id } = await params;

  const dados = await dadosCaderno(id);
  if (!dados) notFound();
  const cab = dados.cabecalho;

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <title>{`Caderno de quantitativos — ${cab.titulo}`}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, sans-serif; font-size: 10px; background: #fff; color: #111; padding: 16px; }
          h1 { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
          .meta { font-size: 9px; color: #555; margin-bottom: 12px; line-height: 1.5; }
          h2 { font-size: 11px; font-weight: 700; margin: 4px 0; }
          .divergente { color: #b91c1c; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { text-align: left; font-size: 8.5px; text-transform: uppercase; border-bottom: 1px solid #333; padding: 3px; }
          td { padding: 3px; border-bottom: 1px solid #eee; vertical-align: top; }
          .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
          .grupo-resumo { font-size: 9.5px; color: #333; margin-bottom: 4px; }
          @media print { body { padding: 8px; } thead { display: table-header-group; } tr { break-inside: avoid; } .grupo { break-before: auto; } }
        `}</style>
      </head>
      <body>
        <h1>Caderno de quantitativos — {cab.titulo}</h1>
        <p className="meta">
          Obra: {cab.obra} · Contratante: {cab.contratante} · Data-base: {formatarData(cab.dataBase)}
        </p>

        {dados.grupos.length === 0 && <p>Nenhum levantamento registrado.</p>}

        {dados.grupos.map((grupo) => {
          const divergente = grupo.divergencia !== null && Math.abs(grupo.divergencia) > 0.01;
          return (
            <div key={grupo.itemId ?? "solto"} className="grupo">
              <h2>
                {grupo.itemCodigo ? `${grupo.itemCodigo} — ` : ""}
                {grupo.itemDescricao}
              </h2>
              <p className={`grupo-resumo${divergente ? " divergente" : ""}`}>
                {grupo.itemQuantidade !== null && (
                  <>
                    Quantidade do item: {grupo.itemQuantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {grupo.itemUnidade} ·{" "}
                  </>
                )}
                Soma dos levantamentos: {grupo.somaQuantitativos.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                {grupo.divergencia !== null && (
                  <> · Divergência: {grupo.divergencia.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}{divergente ? " ⚠" : ""}</>
                )}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Levantamento</th>
                    <th style={{ width: "8%" }}>Origem</th>
                    <th style={{ width: "12%" }} className="num">Quantidade</th>
                    <th style={{ width: "14%" }}>Rastro</th>
                    <th style={{ width: "12%" }}>Autor</th>
                    <th style={{ width: "12%" }}>Data</th>
                    <th style={{ width: "22%" }}>Memória</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.linhas.map((l) => (
                    <tr key={l.quantitativoId}>
                      <td>{l.descricao}</td>
                      <td>{ORIGEM_LABEL[l.origem] ?? l.origem}</td>
                      <td className="num">
                        {l.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {l.unidade}
                      </td>
                      <td>{l.rastro}</td>
                      <td>{l.criadoPorNome}</td>
                      <td>{formatarDataHora(l.createdAt)}</td>
                      <td>{l.memoria ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </body>
    </html>
  );
}
