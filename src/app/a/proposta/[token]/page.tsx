import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { brl } from "@/lib/utils";

export const metadata: Metadata = { title: "Proposta — Sena Projetos", robots: { index: false } };

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
  const p = await prisma.proposta.findUnique({
    where: { token },
    include: {
      cliente: { select: { nome: true } },
      itens: { orderBy: { ordem: "asc" } },
      condicoes: { orderBy: { ordem: "asc" } },
    },
  });
  if (!p) notFound();

  const total = p.itens.reduce((s, it) => s + Number(it.valor), 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/MARCA/logo_completa_dark.svg" alt="Sena Projetos" className="mb-8 hidden h-10 dark:block" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/MARCA/logo_completa_light.svg" alt="Sena Projetos" className="mb-8 h-10 dark:hidden" />

      <p className="font-mono text-xs text-muted-foreground">{p.numero}</p>
      <h1 className="text-2xl font-extrabold tracking-tight">{p.titulo}</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Para: {p.cliente.nome}
        {p.validade && ` · válida até ${p.validade.toLocaleDateString("pt-BR")}`}
      </p>

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
                  {it.disciplina}
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

      <p className="mt-10 text-xs text-muted-foreground">
        Dúvidas? Responda o e-mail desta proposta. — Sena Projetos
      </p>

      {/* pixel de abertura */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/t/proposta/${token}/pixel`} alt="" width={1} height={1} className="opacity-0" />
    </main>
  );
}
