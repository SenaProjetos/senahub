import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  listarFolha,
  listarFolhaAgrupada,
  contarPendentesSemValor,
  opcoesFiltroFolha,
} from "@/modules/financeiro/folha/queries";
import { listarFolhasProjetista } from "@/modules/financeiro/folha-lote/queries";
import { opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { temFiltroAlemDoStatus } from "@/modules/financeiro/folha/service";
import { FolhaView } from "@/components/financeiro/folha/folha-view";
import { FolhaAgrupadaView } from "@/components/financeiro/folha/folha-agrupada-view";
import { FolhaResumoFiltros } from "@/components/financeiro/folha/folha-linhas-compartilhadas";
import { ModoFolhaToggle } from "@/components/financeiro/folha/modo-folha-toggle";
import { FolhaLotesSection } from "@/components/financeiro/folha/folha-lotes-section";
import { ProducaoAbas } from "@/components/financeiro/folha/producao-abas";

export const metadata: Metadata = { title: "Produção" };

const ABAS = ["pagar", "lotes"] as const;
type Aba = (typeof ABAS)[number];

const MODOS = ["projetista", "pagamento"] as const;
type Modo = (typeof MODOS)[number];

export default async function FolhaProjetistasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("financeiro", "folha_pj");
  const sp = await searchParams;
  const abaRaw = sp.aba;
  const aba: Aba = (ABAS as readonly string[]).includes(typeof abaRaw === "string" ? abaRaw : "")
    ? (abaRaw as Aba)
    : "pagar";
  const modoRaw = sp.modo;
  // Padrão = "projetista" (N1 do plano): poucas pessoas, muitas entregas — agrupar é o
  // que responde "quanto eu devo a quem", que é a pergunta mais comum nesta tela.
  const modo: Modo = (MODOS as readonly string[]).includes(typeof modoRaw === "string" ? modoRaw : "")
    ? (modoRaw as Modo)
    : "projetista";

  // Só a aba ativa é buscada — combinar as duas queries pesadas num Promise.all só
  // fazia sentido quando as duas apareciam na mesma tela (ver D1/D14 no plano).
  // `semValor` é exceção: é o aviso da F0a, que é da PÁGINA (as duas abas), não da
  // lista de pagamentos — por isso é buscado nas duas ramificações.
  let conteudo: React.ReactNode;
  let semValor: number;
  if (aba === "pagar") {
    const [opcoes, opcoesFiltro, sv, podeProjeto, podePessoa, podeLancamento, podeConciliar, podeCorrigir] =
      await Promise.all([
        opcoesLancamento(),
        opcoesFiltroFolha(),
        contarPendentesSemValor(),
        // Cada link da tabela leva a uma tela com gate próprio — quem só tem `folha_pj`
        // não ganha um link que cai em "sem permissão".
        can(user, "projetos", "ver"),
        can(user, "rh", "cadastro"),
        can(user, "financeiro", "ver"),
        // G1c: desfazer conciliação é poder de quem concilia, não de quem paga.
        can(user, "financeiro", "conciliar"),
        // G2/D37: corrigir/estornar/excluir lote saiu de dentro de `folha_pj`.
        can(user, "financeiro", "folha_pj_corrigir"),
      ]);
    semValor = sv;
    const links = { projeto: podeProjeto, pessoa: podePessoa, lancamento: podeLancamento };

    // Os dois modos compartilham filtro/KPI (`FolhaResumoFiltros`) — só a lista embaixo muda.
    if (modo === "pagamento") {
      const lista = await listarFolha(sp);
      const filtrado = temFiltroAlemDoStatus(lista.filtros);
      conteudo = (
        <div className="space-y-4">
          <FolhaResumoFiltros
            filtros={lista.filtros}
            opcoesFiltro={opcoesFiltro}
            resumo={lista.resumo}
            canceladosOcultos={lista.canceladosOcultos}
            filtrado={filtrado}
          />
          <ModoFolhaToggle modo={modo} />
          <FolhaView
            itens={lista.itens}
            total={lista.total}
            page={lista.page}
            pageSize={lista.pageSize}
            filtrado={filtrado}
            filtroStatus={lista.filtros.status}
            links={links}
            contas={opcoes.contas}
            formas={opcoes.formas}
            podeConciliar={podeConciliar}
            podeCorrigir={podeCorrigir}
          />
        </div>
      );
    } else {
      const lista = await listarFolhaAgrupada(sp);
      const filtrado = temFiltroAlemDoStatus(lista.filtros);
      conteudo = (
        <div className="space-y-4">
          <FolhaResumoFiltros
            filtros={lista.filtros}
            opcoesFiltro={opcoesFiltro}
            resumo={lista.resumo}
            canceladosOcultos={lista.canceladosOcultos}
            filtrado={filtrado}
          />
          <ModoFolhaToggle modo={modo} />
          <FolhaAgrupadaView
            grupos={lista.grupos}
            filtrado={filtrado}
            filtroStatus={lista.filtros.status}
            links={links}
            contas={opcoes.contas}
            formas={opcoes.formas}
            podeConciliar={podeConciliar}
            podeCorrigir={podeCorrigir}
          />
        </div>
      );
    }
  } else {
    const [{ folhas, total, page, pageSize }, opcoes, sv, podeLancamento, podeCorrigirLotes, podeConciliarLotes] =
      await Promise.all([
        listarFolhasProjetista(sp),
        opcoesLancamento(),
        contarPendentesSemValor(),
        // O mesmo gate de destino do modo Pagamentos (D24) — o lote expandido (F10) linka
        // pro lançamento de cada pagamento dentro dele.
        can(user, "financeiro", "ver"),
        // G2/D37: excluir lote e corrigir/estornar pago dentro dele entram no gate de correção.
        can(user, "financeiro", "folha_pj_corrigir"),
        // G9/B4: desfazer conciliação pelo dialog de corrigir, dentro do lote (G1c).
        can(user, "financeiro", "conciliar"),
      ]);
    semValor = sv;
    const loteIdRaw = sp.loteId;
    conteudo = (
      <FolhaLotesSection
        folhas={folhas}
        total={total}
        page={page}
        pageSize={pageSize}
        contas={opcoes.contas}
        formas={opcoes.formas}
        podeLancamento={podeLancamento}
        podeCorrigir={podeCorrigirLotes}
        podeConciliar={podeConciliarLotes}
        loteAlvo={typeof loteIdRaw === "string" ? loteIdRaw : undefined}
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
