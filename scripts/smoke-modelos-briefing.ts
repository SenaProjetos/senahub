/**
 * Smoke dos modelos de formulário do briefing (Lote 4) contra o banco de dev.
 * Exercita o que lint/tsc/vitest não alcançam: o índice parcial de modelo padrão, o resolvedor
 * (escolhido → padrão → embutido), a gravação do briefing pelo MODELO do projeto (campo novo grava,
 * campo de outro modelo é ignorado, status pelos obrigatórios do modelo) e a rota pública.
 *
 * Cria cliente + projeto + link + modelo throwaway e apaga tudo no final.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/smoke-modelos-briefing.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { resolverModelo } from "../src/modules/inputs/modelo-queries";
import { inputsPorToken } from "../src/modules/inputs/queries";
import { PUT as putBriefing } from "../src/app/api/p/inputs/[token]/briefing/route";
import type { Prisma } from "../src/generated/prisma/client";

const req = (body: unknown) =>
  new Request("http://localhost/api/p/inputs/x/briefing", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function main() {
  const tag = `SMKMOD_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  // 1) Sempre há (no máximo) um padrão; um segundo é recusado pelo índice parcial.
  const padrao = await prisma.modeloBriefing.findFirst({ where: { padrao: true } });
  check("existe um modelo padrão (seed)", !!padrao);
  let recusou = false;
  try {
    await prisma.modeloBriefing.create({ data: { nome: `${tag}_dois_padroes`, padrao: true, esquema: [] } });
  } catch {
    recusou = true;
  }
  check("segundo modelo padrão é recusado pelo índice parcial", recusou);

  const esquema = [
    {
      id: "s1",
      titulo: "Perfil",
      campos: [
        { chave: "cObrig", label: "Tem obra?", tipo: "sim-nao", obrigatorio: true, opcoes: ["Sim", "Não"] },
        { chave: "cMulti", label: "Quais?", tipo: "checkbox", obrigatorio: false, opcoes: ["A", "B"] },
        { chave: "cMail", label: "E-mail", tipo: "text", obrigatorio: false, formato: "email" },
      ],
    },
  ];
  const modelo = await prisma.modeloBriefing.create({ data: { nome: `${tag}_modelo`, esquema: esquema as unknown as Prisma.InputJsonValue } });

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id },
    });
  });
  const token = randomBytes(18).toString("hex");
  await prisma.linkPublicoInput.create({ data: { projetoId: projeto.id, token, ativo: true } });
  const ctx = () => ({ params: Promise.resolve({ token }) });

  try {
    // 2) Sem escolha: vale o padrão.
    const semEscolha = await resolverModelo(null);
    check("sem modeloId resolve o padrão", semEscolha.id === padrao?.id);

    // 3) Com o modelo escolhido: a rota pública grava pelas perguntas DELE.
    await prisma.briefingProjeto.create({ data: { projetoId: projeto.id, modeloId: modelo.id } });
    const r1 = await putBriefing(req({ respostas: { cObrig: "Sim", cMulti: ["A"], emailContato: "x@y.com", cMail: "Fulano@Ex.com" } }), ctx());
    const j1 = (await r1.json()) as { status?: string };
    check("rota pública aceita o briefing do modelo", r1.status === 200);
    check("status = completo (obrigatório do MODELO respondido)", j1.status === "completo");
    const gravado = await prisma.briefingProjeto.findUniqueOrThrow({ where: { projetoId: projeto.id } });
    const resp = gravado.respostasJson as Record<string, unknown>;
    check("resposta do campo novo gravada", resp.cObrig === "Sim" && Array.isArray(resp.cMulti));
    check("campo que não é do modelo é ignorado", !("emailContato" in resp));
    check("formato do campo novo é normalizado (e-mail)", resp.cMail === "fulano@ex.com");

    // 4) Formato inválido num campo do modelo é recusado com a mensagem por campo.
    const r2 = await putBriefing(req({ respostas: { cMail: "sem-arroba" } }), ctx());
    const j2 = (await r2.json()) as { campos?: Record<string, string> };
    check("e-mail inválido do modelo novo é recusado (400 com campo)", r2.status === 400 && !!j2.campos?.cMail);

    // 5) O link entrega só o que o modelo mostra.
    const pub = await inputsPorToken(token);
    check("inputsPorToken traz o modeloId do briefing", pub?.briefing?.modeloId === modelo.id);

    // 6) Arquivado: o projeto segue nele.
    await prisma.modeloBriefing.update({ where: { id: modelo.id }, data: { ativo: false } });
    const arquivado = await resolverModelo(modelo.id);
    check("modelo arquivado continua valendo para quem o usa", arquivado.id === modelo.id);

    // 7) Esquema ilegível cai no formulário embutido, sem derrubar o projeto.
    await prisma.modeloBriefing.update({ where: { id: modelo.id }, data: { esquema: { quebrado: true } } });
    const quebrado = await resolverModelo(modelo.id);
    check("esquema ilegível usa o formulário embutido e sinaliza", quebrado.invalido === true && quebrado.secoes.length === 7);
  } finally {
    await prisma.linkPublicoInput.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.briefingProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.modeloBriefing.delete({ where: { id: modelo.id } });
  }

  console.log(ok ? "\nTUDO OK" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
