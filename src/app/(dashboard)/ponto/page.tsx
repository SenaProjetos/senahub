import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import {
  sessaoAberta,
  projetosDoUsuario,
  espelhoMes,
} from "@/modules/ponto/queries";
import { rateioMesGestor } from "@/modules/rh/rateio/queries";
import { PontoView } from "@/components/ponto/ponto-view";

export const metadata: Metadata = { title: "Ponto" };

export default async function PontoPage() {
  // Ponto é autoatendimento de todos os internos (cliente fora).
  const user = await requireRole(
    "admin",
    "supervisor",
    "administrativo",
    "clt",
    "estagiario",
    "projetista_pj",
    "freelancer",
  );

  const hoje = new Date();
  const [aberta, projetos, espelho] = await Promise.all([
    sessaoAberta(user.id),
    projetosDoUsuario(user.id),
    espelhoMes(user.id, hoje.getFullYear(), hoje.getMonth() + 1),
  ]);

  const ehGestor = HR_ADMIN_ROLES.includes(user.role);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const rateio = ehGestor ? await rateioMesGestor(ano, mes) : null;

  return (
    <PontoView
      aberta={aberta ? { inicio: aberta.inicio, projeto: aberta.projeto } : null}
      projetos={projetos}
      espelho={espelho}
      rateio={rateio}
      ano={ano}
      mes={mes}
    />
  );
}
