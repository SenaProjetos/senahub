import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { listarFolha, contarPendentesSemValor } from "@/modules/financeiro/folha/queries";
import { listarFolhasProjetista } from "@/modules/financeiro/folha-lote/queries";
import { opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { FolhaView } from "@/components/financeiro/folha/folha-view";
import { FolhaLotesSection } from "@/components/financeiro/folha/folha-lotes-section";
import { ProducaoAbas } from "@/components/financeiro/folha/producao-abas";

export const metadata: Metadata = { title: "Produção" };

const ABAS = ["pagar", "lotes"] as const;
type Aba = (typeof ABAS)[number];

export default async function FolhaProjetistasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("financeiro", "folha_pj");
  const sp = await searchParams;
  const abaRaw = sp.aba;
  const aba: Aba = (ABAS as readonly string[]).includes(typeof abaRaw === "string" ? abaRaw : "")
    ? (abaRaw as Aba)
    : "pagar";

  // Só a aba ativa é buscada — combinar as duas queries pesadas num Promise.all só
  // fazia sentido quando as duas apareciam na mesma tela (ver D1/D14 no plano).
  // `semValor` é exceção: é o aviso da F0a, que é da PÁGINA (as duas abas), não da
  // lista de pagamentos — por isso é buscado nas duas ramificações.
  let conteudo: React.ReactNode;
  let semValor: number;
  if (aba === "pagar") {
    const [{ itens, total, page, pageSize, resumo }, opcoes, sv] = await Promise.all([
      listarFolha(sp),
      opcoesLancamento(),
      contarPendentesSemValor(),
    ]);
    semValor = sv;
    conteudo = (
      <FolhaView
        itens={itens}
        total={total}
        page={page}
        pageSize={pageSize}
        resumo={resumo}
        contas={opcoes.contas}
        formas={opcoes.formas}
      />
    );
  } else {
    const [{ folhas, total, page, pageSize }, opcoes, sv] = await Promise.all([
      listarFolhasProjetista(sp),
      opcoesLancamento(),
      contarPendentesSemValor(),
    ]);
    semValor = sv;
    conteudo = (
      <FolhaLotesSection
        folhas={folhas}
        total={total}
        page={page}
        pageSize={pageSize}
        contas={opcoes.contas}
        formas={opcoes.formas}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Produção</h1>
        <p className="text-sm text-muted-foreground">
          Pagamentos de projetistas PJ/freelancer liberados por entregas validadas.
        </p>
      </div>

      {semValor > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <strong>
              {semValor === 1 ? "1 pagamento está sem valor." : `${semValor} pagamentos estão sem valor.`}
            </strong>{" "}
            Não é possível pagar com R$ 0,00 — use <strong>Corrigir valor</strong> na linha antes de pagar.
          </p>
        </div>
      )}

      <ProducaoAbas aba={aba}>{conteudo}</ProducaoAbas>
    </div>
  );
}
