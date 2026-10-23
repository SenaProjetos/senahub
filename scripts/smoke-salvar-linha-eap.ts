/**
 * Smoke do "Salvar" do painel da linha da EAP (plano 2026-10-23-planejamento-tela-limpa, F4) contra o banco de dev:
 *   - tudo o que mudou na linha numa chamada só vira UM passo de desfazer, e o Ctrl+Z volta tudo;
 *   - o término digitado vence a duração; o início digitado vira "não iniciar antes de"; a restrição escolhida vence o início;
 *   - tudo ou nada: uma etapa recusada depois de outras já gravadas volta o plano inteiro;
 *   - plano aprovado: nome e % passam, duração e predecessoras não.
 *
 * Uso: npm run smoke:salvar-linha-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reagendarProjeto } from "../src/modules/planejamento/agenda";
import { salvarLinhaNoBanco, type SalvarLinha } from "../src/modules/planejamento/linha-service";
import { comPasso, desfazerUltimoPasso } from "../src/modules/planejamento/desfazer/service";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}
async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-salvar-linha-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (x: Date | null) => x?.toISOString().slice(0, 10) ?? null;

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Banco de dev sem admin — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });

  try {
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });
    let ordem = 0;
    const nova = async (nome: string, parentId: string | null, tipoEap: "res" | "atv", duracao: number) => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, [tipoEap]);
      return prisma.eapTarefa.create({
        data: { projetoId: projeto.id, idCorporativo, nome, parentId, tipoEap, duracaoDias: duracao, ordem: ordem++, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-05") },
      });
    };
    // P › A (5d), B (3d), C (2d). 12/10 e 02/11 são feriados no calendário do motor.
    const P = await nova("P", null, "res", 0);
    const A = await nova("A", P.id, "atv", 5);
    const B = await nova("B", P.id, "atv", 3);
    const C = await nova("C", P.id, "atv", 2);
    await reagendarProjeto(projeto.id, admin.id);
    const linha = (id: string) =>
      prisma.eapTarefa.findUniqueOrThrow({
        where: { id },
        select: { nome: true, duracaoDias: true, progresso: true, inicioPrevisto: true, fimPrevisto: true, restricaoTipo: true, restricaoData: true, predecessoras: { select: { predecessoraId: true } } },
      });
    const passos = () => prisma.eapPassoDesfazer.count({ where: { projetoId: projeto.id, userId: admin.id } });
    const base = (t: { id: string; nome: string }, extra: Partial<SalvarLinha> = {}): SalvarLinha => ({ id: t.id, nome: t.nome, progresso: 0, marco: false, ...extra });
    const salvar = (i: SalvarLinha) => comPasso({ projetoId: projeto.id, userId: admin.id, rotulo: `Editar "${i.nome}"` }, () => salvarLinhaNoBanco(i, admin.id));

    // ── várias mudanças, um passo ────────────────────────────────────────────
    const p0 = await passos();
    const r = await salvar(base(B, { nome: "B novo", duracaoDias: 4, progresso: 20, predecessoras: [{ predecessoraId: A.id, tipo: "fs", lagDias: 0 }] }));
    const b1 = await linha(B.id);
    check(
      "nome, duração, % e predecessora numa chamada: B começa depois de A (13/10) e dura 4 dias úteis",
      b1.nome === "B novo" && Number(b1.duracaoDias) === 4 && b1.progresso === 20 && b1.predecessoras.length === 1 && dia(b1.inicioPrevisto) === "2026-10-13" && dia(b1.fimPrevisto) === "2026-10-16",
      { b1, r },
    );
    check("devolve as datas do motor", r.inicio === "2026-10-13" && r.fim === "2026-10-16", r);
    check("um passo de desfazer só", (await passos()) === p0 + 1, { antes: p0, depois: await passos() });

    // ── término vence duração; início vira alfinete ──────────────────────────
    await salvar(base(C, { duracaoDias: 9, termino: "2026-10-07" }));
    const c1 = await linha(C.id);
    check("término vence a duração digitada: 05/10 → 07/10 = 3 dias úteis", Number(c1.duracaoDias) === 3 && c1.restricaoTipo === null, c1);
    await salvar(base(C, { duracaoDias: 3, inicio: "2026-10-20" }));
    const c2 = await linha(C.id);
    check("início digitado vira 'não iniciar antes de' e o motor respeita", c2.restricaoTipo === "iniciar_nao_antes_de" && dia(c2.restricaoData) === "2026-10-20" && dia(c2.inicioPrevisto) === "2026-10-20", c2);
    await salvar(base(C, { duracaoDias: 3, inicio: "2026-10-27", restricao: { tipo: "terminar_nao_depois_de", data: "2026-10-30" } }));
    const c3 = await linha(C.id);
    check("restrição escolhida vence o início digitado", c3.restricaoTipo === "terminar_nao_depois_de" && dia(c3.restricaoData) === "2026-10-30", c3);
    await salvar(base(C, { duracaoDias: 3, restricao: { tipo: null } }));
    check("restrição tirada", (await linha(C.id)).restricaoTipo === null);

    // ── tudo ou nada ─────────────────────────────────────────────────────────
    const antesFalha = await linha(B.id);
    const p1 = await passos();
    const erro = await erroDe(() => salvar(base(B, { nome: "B que não fica", duracaoDias: 4, progresso: 50, predecessoras: [], termino: "2026-09-01" })));
    const depoisFalha = await linha(B.id);
    check("término antes do início é recusado com a frase", erro?.startsWith("O término não pode ser antes do início") === true, erro);
    check(
      "tudo ou nada: nome, % e predecessoras voltaram",
      depoisFalha.nome === antesFalha.nome && depoisFalha.progresso === antesFalha.progresso && depoisFalha.predecessoras.length === 1,
      { antesFalha, depoisFalha },
    );
    check("recusa não gera passo", (await passos()) === p1);

    // ── Ctrl+Z volta a gravação inteira ──────────────────────────────────────
    await salvar(base(A, { nome: "A renomeada", duracaoDias: 7, progresso: 10 }));
    const desfeito = await desfazerUltimoPasso(projeto.id, admin.id);
    const a1 = await linha(A.id);
    // O % é acompanhamento: o desfazer não o reverte (regra do desfazer da EAP), só o plano.
    check("Ctrl+Z volta nome e duração de uma vez (o % é acompanhamento e fica)", desfeito.rotulo === 'Editar "A renomeada"' && a1.nome === "A" && Number(a1.duracaoDias) === 5 && a1.progresso === 10, { desfeito, a1 });

    // ── plano aprovado ───────────────────────────────────────────────────────
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true, emRevisao: false } });
    const b2 = await linha(B.id);
    await salvar(base(B, { nome: "B acompanhado", duracaoDias: Number(b2.duracaoDias), progresso: 60 }));
    const b3 = await linha(B.id);
    check("aprovado: nome e % passam", b3.nome === "B acompanhado" && b3.progresso === 60, b3);
    const travadoDur = await erroDe(() => salvar(base(B, { nome: "B acompanhado", duracaoDias: 9, progresso: 60 })));
    const travadoPred = await erroDe(() => salvar(base(B, { nome: "B acompanhado", duracaoDias: Number(b2.duracaoDias), progresso: 60, predecessoras: [] })));
    check("aprovado: duração e predecessoras recusadas", !!travadoDur?.includes("aprovado") && !!travadoPred?.includes("aprovado"), { travadoDur, travadoPred });
    check("aprovado: a recusa não mexeu em nada", (await linha(B.id)).predecessoras.length === 1 && Number((await linha(B.id)).duracaoDias) === Number(b2.duracaoDias));
  } finally {
    await prisma.eapPassoDesfazer.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
