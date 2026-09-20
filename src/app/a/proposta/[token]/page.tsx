import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocRender } from "@/components/documentos/doc-render";
import { carregarDocumentoProposta } from "@/modules/comercial/proposta-composta/documento-dados";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { brl, formatarData } from "@/lib/utils";
import { PropostaPublicaUpload } from "@/components/comercial/proposta-publica-upload";
import { nomeDisciplinaItem } from "@/modules/comercial/disciplinas";
import { metadataPublica } from "@/lib/metadata-publica";
import { CabecalhoPublico } from "@/components/publico/cabecalho-publico";

export const metadata: Metadata = metadataPublica({
  titulo: "Proposta — Sena Projetos",
  descricao: "Veja a proposta enviada pela Sena Projetos.",
});

/**
 * Visualização pública da proposta pelo cliente (sem login, por token).
 * Mostra só totais por disciplina — nunca valores unitários (regra de negócio).
 * O pixel registra a abertura.
 */
export default async function PropostaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // ADR-0005: proposta externa não tem página pública (o time envia o PDF por fora). O filtro
  // não muda nada na renderização das propostas do editor — só recusa as externas.
  //
  // Lista do que TEM página pública, em vez de "tudo menos externa": formato novo não passa a
  // vazar sozinho por esquecimento (a composta entrou aqui de propósito, com ramo próprio na G5).
  const p = await prisma.proposta.findFirst({
    where: { token, formato: { in: ["legado", "composta"] } },
    include: {
      cliente: { select: { nome: true } },
      // `disciplina` (catalogo) no include: a pagina publica mostra o nome do catalogo e cai
      // no texto original quando o item ainda nao tem FK (F1.19).
      itens: { orderBy: { ordem: "asc" }, include: { disciplina: { select: { nome: true } } } },
      condicoes: { orderBy: { ordem: "asc" } },
    },
  });
  if (!p) notFound();

  // ── ADR-0006: ramo da proposta COMPOSTA ────────────────────────────────────────────────────
  // O ramo antigo abaixo não muda uma linha (ADR-21 §6 congelou a renderização porque o PDF já
  // enviado é impresso dela ao vivo). A composta é escolhida por um valor de `formato` que
  // nenhuma proposta anterior tem, então nada do que existe passa por aqui.
  //
  // Documento com impedimento (plano que não fecha 100%, empresa não configurada, token de
  // cláusula sem valor) NÃO é publicado: o cliente veria "obra em , " ou um plano zerado. Some
  // da web como se não existisse; a prévia interna é quem diz o que falta.
  if (p.formato === "composta") {
    const doc = await carregarDocumentoProposta(p.id);
    if (!doc || doc.impedimentos.length > 0) notFound();
    return (
      <main className="mx-auto max-w-[850px] px-2 py-6">
        {/* Fora da área impressa: o PDF é gerado imprimindo esta página, e o botão de baixar
            não pode sair dentro do próprio PDF. */}
        <div className="doc-no-print mb-3 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">Dúvidas? Responda o e-mail desta proposta.</p>
          <a
            href={`/api/t/proposta/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-sm border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Baixar PDF
          </a>
        </div>

        <div className="doc-print-area">
          <DocRender schema={doc.schema} escalar={doc.escalar} linhas={doc.linhas} porFonte={doc.porFonte} />
        </div>

        {/* O cliente envia documentos pela mesma página, como na proposta antiga. */}
        <div className="doc-no-print">
          <PropostaPublicaUpload token={token} />
        </div>

        {/* Pixel de abertura: é o que alimenta "N abertura(s)" no editor. O ramo composto
            retornava antes dele, então as aberturas ficariam sempre em zero. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/t/proposta/${token}/pixel`} alt="" width={1} height={1} className="doc-no-print opacity-0" />
      </main>
    );
  }

  const total = p.itens.reduce((s, it) => s + Number(it.valor), 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <CabecalhoPublico
          icone={FileText}
          rotulo="Proposta comercial"
          codigo={p.numero}
          titulo={p.titulo}
          descricao={`Para: ${p.cliente.nome}${p.validade ? ` · válida até ${formatarData(p.validade)}` : ""}`}
        />
      </div>

      <section className="rounded-sm border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-primary text-left text-primary-foreground">
              <th className="px-4 py-2.5 font-semibold">Disciplina</th>
              <th className="px-4 py-2.5 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {p.itens.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5">
                  {nomeDisciplinaItem(it)}
                  {it.descricao && (
                    <span className="block text-xs text-muted-foreground">{it.descricao}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono">{brl(Number(it.valor))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td className="px-4 py-3 font-bold">Total</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{brl(total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {p.condicoes.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Condições de pagamento
          </h2>
          <ul className="space-y-1 text-sm">
            {p.condicoes.map((c) => (
              <li key={c.id} className="flex justify-between rounded-sm border bg-card px-4 py-2">
                <span>{c.descricao}</span>
                <span className="font-mono">
                  {c.tipo === "percentual" ? `${Number(c.valor)}%` : brl(Number(c.valor))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.observacoes && (
        <p className="mt-6 whitespace-pre-wrap text-sm text-muted-foreground">{p.observacoes}</p>
      )}

      <PropostaPublicaUpload token={token} />

      <div className="mt-10 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Dúvidas? Responda o e-mail desta proposta. — Sena Projetos
        </p>
        <a
          href={`/api/t/proposta/${token}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-sm border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Baixar PDF
        </a>
      </div>

      {/* pixel de abertura */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/t/proposta/${token}/pixel`} alt="" width={1} height={1} className="opacity-0" />
    </main>
  );
}
