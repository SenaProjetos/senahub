import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { espelhoDetalhado, equipeAgora, projetosDoUsuario } from "@/modules/ponto/queries";
import { usuariosParaEscala } from "@/modules/rh/escalas/queries";
import { EspelhoView } from "@/components/ponto/espelho-view";

export const metadata: Metadata = { title: "Espelho de ponto" };

export default async function EspelhoPontoPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; a?: string; m?: string }>;
}) {
  const user = await requireRole(
    "admin",
    "supervisor",
    "administrativo",
    "clt",
    "estagiario",
    "projetista_pj",
    "freelancer",
  );

  const sp = await searchParams;
  const hoje = new Date();
  const ano = Number(sp.a) || hoje.getFullYear();
  const mes = Number(sp.m) || hoje.getMonth() + 1;

  const [podeVerEquipe, podeAjustar] = await Promise.all([
    can(user.role, "ponto", "espelho_equipe"),
    can(user.role, "ponto", "ajustar"),
  ]);
  // Só quem pode ver a equipe escolhe outro usuário; os demais veem só o próprio.
  const targetId = podeVerEquipe && sp.u ? sp.u : user.id;
  const souEuMesmo = targetId === user.id;

  const [detalhe, usuarios, equipe, projetos] = await Promise.all([
    espelhoDetalhado(targetId, ano, mes),
    podeVerEquipe ? usuariosParaEscala() : Promise.resolve(null),
    podeVerEquipe ? equipeAgora() : Promise.resolve(null),
    projetosDoUsuario(targetId),
  ]);

  // Pode editar: o próprio ponto (sempre) ou o de terceiro com permissão `ajustar`.
  const podeEditar = souEuMesmo || podeAjustar;

  return (
    <EspelhoView
      detalhe={detalhe}
      ano={ano}
      mes={mes}
      usuarios={usuarios ? usuarios.map((u) => ({ id: u.id, name: u.name })) : null}
      usuarioSelecionadoId={targetId}
      equipe={equipe}
      souEuMesmo={souEuMesmo}
      projetos={projetos}
      podeEditar={podeEditar}
    />
  );
}
