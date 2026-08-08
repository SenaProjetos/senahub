/**
 * Backfill da sub-etapa 2.1: `user.cargo` / `user.departamento` (texto livre) → linhas de
 * catálogo (`Cargo`, `Departamento`) + FKs em `user`.
 *
 * Usa o MESMO canonizador do dry-run (`modules/rh/catalogos/canonizar.ts`), para o que roda aqui
 * ser exatamente o que o relatório aprovado descreveu.
 *
 * **Idempotente:** upsert do catálogo por nome; usuário que já tem `cargoId`/`departamentoId`
 * não é tocado. Pode rodar de novo sem efeito colateral.
 *
 * **Não descarta nada:** `user.cargo`/`user.departamento` continuam preenchidos — passam a ser
 * cache do rótulo, normalizado para a grafia canônica. `vinculo.cargo` é lido como fonte para o
 * catálogo, mas **não é reescrito**: é registro histórico do que valia naquele vínculo.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-cargos.ts              # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-cargos.ts --gravar
 *   ... --gravar --aceitar-ambiguos    # exigido quando o dry-run acusa valor ambíguo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { chaveMatch } from "../src/lib/import/valores";
import { agrupar, contarValores, type Grupo } from "../src/modules/rh/catalogos/canonizar";
import type { Setor } from "../src/generated/prisma/client";

/** Fração mínima de pessoas num mesmo setor para inferir o setor-pai do departamento. */
const LIMIAR_SETOR = 0.8;

async function main() {
  const args = process.argv.slice(2);
  const gravar = args.includes("--gravar");
  const aceitarAmbiguos = args.includes("--aceitar-ambiguos");

  const usuarios = await prisma.user.findMany({
    select: { id: true, name: true, cargo: true, departamento: true, setor: true, cargoId: true, departamentoId: true },
  });
  const vinculos = await prisma.vinculo.findMany({ select: { cargo: true } });

  const gCargoUser = agrupar(contarValores(usuarios.map((u) => u.cargo)), "user.cargo");
  const gCargoVinc = agrupar(contarValores(vinculos.map((v) => v.cargo)), "vinculo.cargo");
  const gDepto = agrupar(contarValores(usuarios.map((u) => u.departamento)), "user.departamento");

  // As duas fontes de cargo alimentam UM catálogo. Quando a mesma chave aparece nas duas com
  // grafias diferentes, vence a mais frequente somando as duas.
  const cargosPorChave = new Map<string, Grupo>();
  for (const g of [...gCargoUser, ...gCargoVinc]) {
    const atual = cargosPorChave.get(g.chave);
    if (!atual || g.total > atual.total) cargosPorChave.set(g.chave, g);
  }
  const cargos = [...cargosPorChave.values()].sort((a, b) => b.total - a.total);

  const ambiguos = [...cargos, ...gDepto].filter((g) => g.ambiguidades.length > 0);
  if (ambiguos.length > 0) {
    console.log("Valores ambíguos encontrados:");
    for (const g of ambiguos) console.log(`   "${g.canonico}" — ${g.ambiguidades.join("; ")}`);
    if (gravar && !aceitarAmbiguos) {
      console.error("\nABORTADO: resolva os ambíguos ou confirme com --aceitar-ambiguos.");
      await prisma.$disconnect();
      process.exit(1);
    }
    console.log("");
  }

  /** Setor dominante entre quem usa o departamento; null se não houver maioria clara. */
  const setorDe = (g: Grupo): Setor | null => {
    const contagem = new Map<Setor, number>();
    for (const u of usuarios) {
      if (!u.departamento || chaveMatch(u.departamento) !== g.chave || !u.setor) continue;
      contagem.set(u.setor, (contagem.get(u.setor) ?? 0) + 1);
    }
    const [topo] = [...contagem].sort((a, b) => b[1] - a[1]);
    if (!topo) return null;
    return topo[1] / g.total >= LIMIAR_SETOR ? topo[0] : null;
  };

  console.log(gravar ? "Gravando catálogo:" : "[dry-run] criaria no catálogo:");
  console.log(`\n  Cargos (${cargos.length}):`);
  for (const [i, g] of cargos.entries()) console.log(`   ${String(i).padStart(2)}  ${g.canonico}  (${g.total})`);
  console.log(`\n  Departamentos (${gDepto.length}):`);
  for (const [i, g] of gDepto.entries()) {
    console.log(`   ${String(i).padStart(2)}  ${g.canonico}  (${g.total})  setor=${setorDe(g) ?? "—"}`);
  }

  const idCargo = new Map<string, string>();
  const idDepto = new Map<string, string>();

  if (gravar) {
    for (const [i, g] of cargos.entries()) {
      const row = await prisma.cargo.upsert({
        where: { nome: g.canonico },
        update: {},
        create: { nome: g.canonico, ordem: i },
      });
      idCargo.set(g.chave, row.id);
    }
    for (const [i, g] of gDepto.entries()) {
      const row = await prisma.departamento.upsert({
        where: { nome: g.canonico },
        update: {},
        create: { nome: g.canonico, setor: setorDe(g), ordem: i },
      });
      idDepto.set(g.chave, row.id);
    }
  }

  // Vincula cada pessoa e normaliza o rótulo em cache para a grafia canônica.
  const canonCargo = new Map(cargos.map((g) => [g.chave, g.canonico]));
  const canonDepto = new Map(gDepto.map((g) => [g.chave, g.canonico]));

  let ligados = 0;
  let pulados = 0;
  const mudancasDeRotulo: string[] = [];

  for (const u of usuarios) {
    const chaveC = u.cargo ? chaveMatch(u.cargo) : null;
    const chaveD = u.departamento ? chaveMatch(u.departamento) : null;
    const precisaCargo = chaveC != null && u.cargoId == null;
    const precisaDepto = chaveD != null && u.departamentoId == null;
    if (!precisaCargo && !precisaDepto) {
      if (chaveC != null || chaveD != null) pulados++;
      continue;
    }

    const novoCargoRotulo = precisaCargo ? canonCargo.get(chaveC!) : undefined;
    const novoDeptoRotulo = precisaDepto ? canonDepto.get(chaveD!) : undefined;
    if (novoCargoRotulo && novoCargoRotulo !== u.cargo) {
      mudancasDeRotulo.push(`${u.name}: cargo "${u.cargo}" → "${novoCargoRotulo}"`);
    }
    if (novoDeptoRotulo && novoDeptoRotulo !== u.departamento) {
      mudancasDeRotulo.push(`${u.name}: depto "${u.departamento}" → "${novoDeptoRotulo}"`);
    }

    if (gravar) {
      await prisma.user.update({
        where: { id: u.id },
        data: {
          ...(precisaCargo ? { cargoId: idCargo.get(chaveC!) ?? null, cargo: novoCargoRotulo } : {}),
          ...(precisaDepto ? { departamentoId: idDepto.get(chaveD!) ?? null, departamento: novoDeptoRotulo } : {}),
        },
      });
    }
    ligados++;
  }

  if (mudancasDeRotulo.length > 0) {
    console.log(`\n  Rótulos normalizados (${mudancasDeRotulo.length}):`);
    for (const m of mudancasDeRotulo) console.log(`   ${m}`);
  }

  console.log(`\n${gravar ? "Feito" : "[dry-run]"}: ${ligados} pessoa(s) ligada(s) ao catálogo, ${pulados} já ligada(s) antes.`);
  if (!gravar) console.log("Nada gravado. Repita com --gravar.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
