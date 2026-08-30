import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { criptografarSenha } from "../src/lib/encryption";

/**
 * Dados de DEMONSTRAÇÃO do cofre de Acessos (`npm run seed:acessos-demo`).
 *
 * Existe porque a tela só se avalia com volume e variedade — vencimento perto, licença sem
 * responsável, conta sem revisão há meses. Idempotente: pula o que já existe pelo nome.
 *
 * §81/§82 — nomes reais de órgãos, credenciais FALSAS. O usuário gravado é
 * `projetos@empresa.com.br` e a senha é literalmente a string "demonstracao-nao-e-real".
 * NÃO rodar em produção: os registros ficam compartilhados com o setor de engenharia inteiro.
 */
const CATS = [
  { nome: "Corpo de Bombeiros", icone: "Flame" },
  { nome: "CREA", icone: "Landmark" },
  { nome: "Prefeitura", icone: "Building2" },
  { nome: "Software", icone: "Monitor" },
  { nome: "Plataforma", icone: "Globe" },
];

const HOJE = new Date();
const emDias = (d: number) => new Date(HOJE.getTime() + d * 86_400_000);

async function main() {
  const admin = await prisma.user.findFirstOrThrow({
    where: { superUsuario: true },
    select: { id: true },
  });

  const cats = new Map<string, string>();
  for (const c of CATS) {
    const r = await prisma.credencialCategoria.upsert({
      where: { nome: c.nome },
      create: c,
      update: {},
      select: { id: true, nome: true },
    });
    cats.set(r.nome, r.id);
  }

  const dados = [
    { nome: "CBMMG", nomeCompleto: "Corpo de Bombeiros Militar de Minas Gerais", cat: "Corpo de Bombeiros", uf: "MG", url: "https://www.bombeiros.mg.gov.br", venc: null, rev: emDias(-20), tags: ["PSCIP", "Aprovação"] },
    { nome: "CBMPE", nomeCompleto: "Corpo de Bombeiros Militar de Pernambuco", cat: "Corpo de Bombeiros", uf: "PE", url: "https://www.bombeiros.pe.gov.br", venc: null, rev: emDias(-200), tags: ["PSCIP"] },
    { nome: "CBPMESP", nomeCompleto: "Corpo de Bombeiros da Polícia Militar de São Paulo", cat: "Corpo de Bombeiros", uf: "SP", url: "https://www.corpodebombeiros.sp.gov.br", venc: null, rev: emDias(-15), tags: ["Fiscalização"] },
    { nome: "CREA-MG", nomeCompleto: "Conselho Regional de Engenharia de Minas Gerais", cat: "CREA", uf: "MG", url: "https://www.crea-mg.org.br", venc: null, rev: emDias(-40), tags: ["ART"] },
    { nome: "CREA-PE", nomeCompleto: "Conselho Regional de Engenharia de Pernambuco", cat: "CREA", uf: "PE", url: "https://www.creape.org.br", venc: null, rev: emDias(-190), tags: ["ART"] },
    { nome: "CREA-SP", nomeCompleto: "Conselho Regional de Engenharia de São Paulo", cat: "CREA", uf: "SP", url: "https://www.creasp.org.br", venc: null, rev: emDias(-5), tags: ["ART"] },
    { nome: "Prefeitura do Recife", nomeCompleto: "Portal de licenciamento do Recife", cat: "Prefeitura", uf: "PE", url: "https://www.recife.pe.gov.br", venc: null, rev: emDias(-60), tags: ["Aprovação"] },
    { nome: "Prefeitura de BH", nomeCompleto: "Portal de licenciamento de Belo Horizonte", cat: "Prefeitura", uf: "MG", url: "https://prefeitura.pbh.gov.br", venc: null, rev: null, tags: [] },
    { nome: "TQS", nomeCompleto: "TQS Informática — Licença Estrutural 01", cat: "Software", uf: "NACIONAL", url: "https://www.tqs.com.br", venc: emDias(22), rev: emDias(-30), tags: ["Licença", "Estrutural"], lic: { fornecedor: "TQS Informática", tipo: "Flutuante", assentos: 3 } },
    { nome: "AltoQi Builder", nomeCompleto: "AltoQi Builder — Licença Hidrossanitário", cat: "Software", uf: "NACIONAL", url: "https://www.altoqi.com.br", venc: emDias(180), rev: emDias(-10), tags: ["Licença"], lic: { fornecedor: "AltoQi", tipo: "Nominal", assentos: 2 } },
    { nome: "Autodesk", nomeCompleto: "Autodesk Construction Cloud", cat: "Software", uf: "NACIONAL", url: "https://construction.autodesk.com", venc: emDias(5), rev: emDias(-80), tags: ["BIM", "Licença"], lic: { fornecedor: "Autodesk", tipo: "Flutuante", assentos: 10 }, semResponsavel: true },
    { nome: "Portal Gov.br", nomeCompleto: "Acesso unificado a serviços federais", cat: "Plataforma", uf: "NACIONAL", url: "https://www.gov.br", venc: null, rev: emDias(-100), tags: [] },
  ];

  for (const d of dados) {
    const existe = await prisma.credencial.findFirst({ where: { nome: d.nome }, select: { id: true } });
    if (existe) continue;
    await prisma.credencial.create({
      data: {
        nome: d.nome,
        nomeCompleto: d.nomeCompleto,
        categoriaId: cats.get(d.cat)!,
        estado: d.uf,
        url: d.url,
        descricao: `Conta utilizada para protocolo e acompanhamento junto a ${d.nomeCompleto}.`,
        usuarioEncriptado: JSON.stringify(await criptografarSenha("projetos@empresa.com.br")),
        senhaEncriptada: JSON.stringify(await criptografarSenha("demonstracao-nao-e-real")),
        responsavelId: d.semResponsavel ? null : admin.id,
        vencimentoEm: d.venc,
        ultimaRevisaoEm: d.rev,
        fornecedor: d.lic?.fornecedor,
        tipoLicenca: d.lic?.tipo,
        assentos: d.lic?.assentos,
        criadoPorId: admin.id,
        atualizadoPorId: admin.id,
        tags: { create: d.tags.map((tag) => ({ tag })) },
        compartilhamentos: {
          create: [
            { tipoAlvo: "usuario", alvoId: admin.id, podeVerCadastro: true, podeVerCredencial: true, podeEditar: true, podeGerenciarPermissoes: true },
            { tipoAlvo: "setor", alvoId: "engenharia", podeVerCadastro: true },
          ],
        },
      },
    });
  }

  console.log(`✔ ${dados.length} acessos de demonstração garantidos.`);
  await prisma.$disconnect();
}

main();
