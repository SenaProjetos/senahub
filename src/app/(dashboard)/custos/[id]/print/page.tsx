import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { dadosPlanilha } from "@/modules/custos/orcamento/queries";
import { brl, formatarData } from "@/lib/utils";

/** Página de impressão da planilha orçamentária — renderizada por puppeteer na rota do PDF. */
export default async function PrintPlanilhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  await requirePermission("custos", "ver");
  const { id } = await params;
  const sp = await searchParams;
  const tipo = sp.tipo === "analitica" ? "analitica" : "sintetica";

  const dados = await dadosPlanilha(id, tipo);
  if (!dados) notFound();
  const cab = dados.cabecalho;

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <title>{`Planilha ${tipo} — ${cab.titulo}`}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, sans-serif; font-size: 10px; background: #fff; color: #111; padding: 16px; }
          h1 { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
          .meta { font-size: 9px; color: #555; margin-bottom: 10px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 9px; text-transform: uppercase; border-bottom: 1px solid #333; padding: 4px 3px; }
          td { padding: 3px; border-bottom: 1px solid #eee; vertical-align: top; }
          .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
          .grupo { font-weight: 700; background: #f4f4f4; }
          .comp { font-style: italic; color: #555; font-size: 9px; }
          .total { font-weight: 700; border-top: 2px solid #333; }
          h2 { font-size: 11px; font-weight: 700; margin: 14px 0 4px; }
          @media print { body { padding: 8px; } thead { display: table-header-group; } tr { break-inside: avoid; } }
        `}</style>
      </head>
      <body>
        <h1>
          Planilha orçamentária {tipo === "analitica" ? "analítica" : "sintética"} — {cab.titulo}
        </h1>
        <p className="meta">
          Obra: {cab.obra} · Contratante: {cab.contratante}
          <br />
          Data-base: {formatarData(cab.dataBase)} · Base de preço: {cab.basePrecoNome ?? "—"} · BDI:{" "}
          {cab.bdiPercentual.toFixed(2)}%
        </p>

        <table>
          <thead>
            <tr>
              <th style={{ width: "9%" }}>Código</th>
              <th>Descrição</th>
              <th style={{ width: "5%" }}>Un.</th>
              <th style={{ width: "9%" }} className="num">Qtd.</th>
              <th style={{ width: "11%" }} className="num">Custo unit.</th>
              <th style={{ width: "7%" }} className="num">BDI</th>
              <th style={{ width: "12%" }} className="num">Total c/ BDI</th>
            </tr>
          </thead>
          <tbody>
            {dados.linhas.map((l, i) => (
              <tr key={`${l.codigo}-${i}`} className={l.tipo === "grupo" ? "grupo" : l.tipo === "composicao_item" ? "comp" : ""}>
                <td style={{ fontFamily: "monospace" }}>{l.codigo}</td>
                <td style={{ paddingLeft: `${3 + l.nivel * 10}px` }}>{l.descricao}</td>
                <td>{l.unidade}</td>
                <td className="num">
                  {l.quantidade === null ? "—" : l.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td className="num">{l.custoUnitario === null ? "—" : brl(l.custoUnitario)}</td>
                <td className="num">{l.bdiPercentual === null ? "—" : `${l.bdiPercentual.toFixed(2)}%`}</td>
                <td className="num">{brl(l.totalComBdi)}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={6} className="num">TOTAL SEM BDI</td>
              <td className="num">{brl(dados.totalSemBdi)}</td>
            </tr>
            <tr className="total" style={{ borderTop: "none" }}>
              <td colSpan={6} className="num">TOTAL COM BDI</td>
              <td className="num">{brl(dados.totalComBdi)}</td>
            </tr>
          </tbody>
        </table>

        {dados.resumoGrupos.length > 0 && (
          <>
            <h2>Participação por grupo</h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "9%" }}>Código</th>
                  <th>Grupo</th>
                  <th style={{ width: "14%" }} className="num">Total c/ BDI</th>
                  <th style={{ width: "12%" }} className="num">Participação</th>
                </tr>
              </thead>
              <tbody>
                {dados.resumoGrupos.map((g) => (
                  <tr key={g.codigo}>
                    <td style={{ fontFamily: "monospace" }}>{g.codigo}</td>
                    <td>{g.descricao}</td>
                    <td className="num">{brl(g.totalComBdi)}</td>
                    <td className="num">{g.participacaoPct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </body>
    </html>
  );
}
