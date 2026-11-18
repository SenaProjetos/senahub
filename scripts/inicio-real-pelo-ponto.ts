/**
 * Carga do início real pelo ponto (2026-11-17): preenche o início real das linhas da EAP que AINDA não têm um, pela
 * primeira hora apontada no ponto nos cards delas (regra em `src/modules/planejamento/inicio-pelo-ponto.ts`). A partir
 * do deploy o ponto faz isso sozinho a cada sessão aberta numa tarefa; este script cobre as horas apontadas ANTES.
 *
 * RODAR UMA VEZ NO DEPLOY (simula primeiro):
 *
 *   npm run eap:inicio-pelo-ponto                (simula: lista o que mudaria)
 *   npm run eap:inicio-pelo-ponto -- --gravar    (grava e reagenda cada projeto tocado)
 *
 * Mesma regra das sessões novas: só preenche o vazio (início real digitado vence), nunca marco, agrupamento, concluída,
 * suspensa, cancelada ou arquivada. Gravar reagenda o projeto (o motor lê a data real, as sucessoras podem andar) e
 * acerta os cards e as previsões de recebimento, como qualquer mudança na EAP. Rodar de novo não muda nada.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { diaDeSaoPaulo } from "../src/lib/data";
import { diaLocal } from "../src/modules/ponto/engine";
import { reagendarProjeto } from "../src/modules/planejamento/agenda";
import { sincronizarCards } from "../src/modules/planejamento/recursos-service";
import { inicioPeloPonto } from "../src/modules/planejamento/inicio-pelo-ponto";
import { preencherInicioPeloPonto } from "../src/modules/planejamento/inicio-pelo-ponto-service";
import { sincronizarPrevisoesDoProjeto } from "../src/modules/juridico/contrato/previsao-service";

const gravar = process.argv.includes("--gravar");

async function main() {
  const hoje = diaDeSaoPaulo();
  // Linhas sem data real que têm card com hora apontada.
  const cards = await prisma.tarefa.findMany({
    where: { eapTarefaId: { not: null }, sessoesTrabalho: { some: {} } },
    select: { eapTarefaId: true },
  });
  const ids = [...new Set(cards.map((c) => c.eapTarefaId).filter((id): id is string => id != null))];
  const linhas = ids.length
    ? await prisma.eapTarefa.findMany({
        where: { id: { in: ids }, inicioReal: null, fimReal: null },
        select: {
          id: true,
          nome: true,
          tipoEap: true,
          status: true,
          progresso: true,
          _count: { select: { filhas: true } },
          projeto: { select: { id: true, codigo: true } },
        },
        orderBy: [{ projetoId: "asc" }, { ordem: "asc" }],
      })
    : [];

  const mudancas: { id: string; codigo: string; nome: string; dia: string; status: string }[] = [];
  for (const l of linhas) {
    const primeira = await prisma.sessaoTrabalho.findFirst({
      where: { tarefa: { eapTarefaId: l.id } },
      orderBy: { inicio: "asc" },
      select: { inicio: true },
    });
    if (!primeira) continue;
    const r = inicioPeloPonto(
      { tipoEap: l.tipoEap, ehResumo: l._count.filhas > 0, status: l.status, progresso: l.progresso, inicioReal: null, fimReal: null },
      diaLocal(primeira.inicio),
      hoje,
    );
    if (r) mudancas.push({ id: l.id, codigo: l.projeto.codigo, nome: l.nome, dia: r.inicioReal, status: `${l.status} → ${r.status}` });
  }

  for (const m of mudancas) console.log(`  ${m.codigo}  início real ${m.dia}  (${m.status})  ${m.nome}`);
  console.log(`\n${mudancas.length} linha(s) sem início real com hora apontada no ponto (de ${linhas.length} sem data real com hora).`);

  if (!gravar) {
    console.log("Simulação: nada gravado. Rode com --gravar para aplicar.");
    return;
  }
  if (mudancas.length === 0) return;
  // Autor do reagendamento e da sincronização dos cards: um superusuário ativo (não há sessão num script).
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Sem superusuário ativo para assinar o reagendamento — nada gravado.");
    process.exitCode = 1;
    return;
  }
  const projetos = await preencherInicioPeloPonto({ linhaIds: mudancas.map((m) => m.id) }, admin.id, hoje);
  for (const projetoId of projetos) {
    await reagendarProjeto(projetoId, admin.id);
    await sincronizarCards(prisma, projetoId, admin.id);
    try {
      await sincronizarPrevisoesDoProjeto(projetoId, admin.id);
    } catch (e) {
      console.log(`  aviso: previsão de recebimento do projeto ${projetoId} não sincronizou —`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`Gravado: início real em ${mudancas.length} linha(s), ${projetos.length} projeto(s) reagendado(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
