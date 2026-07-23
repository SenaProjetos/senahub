import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { PJ_ROLES, type Role } from "@/lib/roles";

type ResponsavelComUser = {
  userId: string;
  user: { id: string; name: string; role: string };
};

/**
 * Libera um `PagamentoProjetista` pendente por responsável PJ/freelancer da disciplina
 * (CLT/estagiário não recebem por entrega — custo já entra via ponto/rateio de horas) e
 * lança a despesa PREVISTA correspondente no financeiro. Fonte única compartilhada por
 * `validarEntrega` (fluxo legado, por-arquivo) e `confirmarAprovacaoDisciplina` (fluxo
 * de 2 etapas de aprovação/laudo) — mesma regra de cálculo (sobra de centavos no
 * primeiro responsável) e mesma integração financeira nos dois casos.
 */
export async function liberarPagamentosProjetista(
  tx: Prisma.TransactionClient,
  params: {
    disciplina: {
      id: string;
      nome: string;
      valor: Prisma.Decimal | number | null;
      responsaveis: ResponsavelComUser[];
      projeto: { id: string; codigo: string };
    };
    autorId: string;
    agora: Date;
  },
): Promise<{ pagaveis: ResponsavelComUser[]; salariados: ResponsavelComUser[] }> {
  const { disciplina, autorId, agora } = params;
  const valorTotal = disciplina.valor ? Number(disciplina.valor) : 0;
  const n = disciplina.responsaveis.length;
  const valorBase = n > 0 ? Math.floor((valorTotal / n) * 100) / 100 : 0;

  const pagaveis: ResponsavelComUser[] = [];
  const salariados: ResponsavelComUser[] = [];

  for (let i = 0; i < disciplina.responsaveis.length; i++) {
    const r = disciplina.responsaveis[i];
    if (!PJ_ROLES.includes(r.user.role as Role)) {
      salariados.push(r);
      continue;
    }
    pagaveis.push(r);
    // Sobra de centavos vai para o primeiro responsável.
    const valor = i === 0 ? Number((valorTotal - valorBase * (n - 1)).toFixed(2)) : valorBase;
    const pag = await tx.pagamentoProjetista.create({
      data: {
        disciplinaId: disciplina.id,
        projetistaId: r.userId,
        valor,
        tipoProfissional: r.user.role,
        status: "pendente",
        liberadoEm: agora,
      },
    });
    if (valor > 0) {
      const lancamentoId = await criarDespesaProjetistaPrevista(tx, {
        pagamentoId: pag.id,
        valor,
        tipoProfissional: r.user.role,
        projetistaNome: r.user.name,
        disciplinaNome: disciplina.nome,
        projetoId: disciplina.projeto.id,
        projetoCodigo: disciplina.projeto.codigo,
        autorId,
        quando: agora,
      });
      await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
    }
  }

  return { pagaveis, salariados };
}
