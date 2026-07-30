import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  listarBasesPreco,
  listarImportacoes,
  listarInsumos,
  listarComposicoes,
} from "@/modules/custos/composicoes/queries";
import { pageCount } from "@/lib/list-params";
import { BancosView } from "@/components/custos/bancos/bancos-view";

export const metadata: Metadata = { title: "Bancos — Engenharia de Custos" };

const ABAS = ["bases", "insumos", "composicoes"] as const;
type Aba = (typeof ABAS)[number];

export default async function BancosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("custos", "ver");
  const [podeGerir, podeCotacao] = await Promise.all([
    can(user.role, "custos", "bancos"),
    can(user.role, "custos", "cotacao"),
  ]);
  const sp = await searchParams;

  const abaRaw = typeof sp.tab === "string" ? sp.tab : "";
  const aba: Aba = (ABAS as readonly string[]).includes(abaRaw) ? (abaRaw as Aba) : "bases";
  const q = typeof sp.q === "string" ? sp.q : "";

  const [bases, importacoes] = await Promise.all([listarBasesPreco(), listarImportacoes()]);

  const insumos = aba === "insumos" ? await listarInsumos(sp) : null;
  const composicoes = aba === "composicoes" ? await listarComposicoes(sp) : null;

  return (
    <BancosView
      aba={aba}
      podeGerir={podeGerir}
      podeCotacao={podeCotacao}
      q={q}
      bases={bases}
      importacoes={importacoes}
      insumos={insumos ? { ...insumos, pageCount: pageCount(insumos.total, insumos.pageSize) } : null}
      composicoes={composicoes ? { ...composicoes, pageCount: pageCount(composicoes.total, composicoes.pageSize) } : null}
    />
  );
}
