import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Backup dos ARQUIVOS (STORAGE_BASE_PATH) — o dump do Postgres (`lib/backup.ts`) não
 * cobre upload nenhum: restaurar só o banco deixa todo `Upload` apontando para caminho
 * inexistente. Espelho aditivo via robocopy (nativo do Windows, o deploy é Windows-only):
 * copia o que é novo/mudou e NUNCA apaga no destino — um arquivo excluído por engano na
 * origem continua recuperável no espelho.
 *
 * Destino: STORAGE_BACKUP_PATH, ou `BACKUP_PATH\storage` como padrão.
 */

/** Robocopy usa o exit code como bitmask: < 8 é sucesso (1 = copiou, 2 = extras, 4 = mismatch). */
export function robocopyOk(codigo: number | null): boolean {
  return codigo !== null && codigo >= 0 && codigo < 8;
}

/** Traduz o bitmask do robocopy para uma frase em pt-BR. */
export function descreverCodigoRobocopy(codigo: number | null): string {
  if (codigo === null) return "processo encerrado por sinal (sem exit code)";
  if (codigo < 0) return `código anormal (${codigo}) — robocopy não chegou a rodar`;
  if (codigo === 0) return "nada a copiar (destino já estava em dia)";
  const partes: string[] = [];
  if (codigo & 1) partes.push("arquivos copiados");
  if (codigo & 2) partes.push("extras no destino (não removidos, por segurança)");
  if (codigo & 4) partes.push("arquivos/pastas incompatíveis");
  if (codigo & 8) partes.push("FALHA ao copiar algum arquivo");
  if (codigo & 16) partes.push("ERRO FATAL (origem ou destino inacessível)");
  return partes.join("; ");
}

export type ResumoRobocopy = {
  arquivos: { total: number; copiados: number; falhas: number } | null;
  diretorios: { total: number; copiados: number; falhas: number } | null;
};

/**
 * Lê o rodapé de resumo do robocopy. Duas armadilhas: o console pode estar em pt-BR ou
 * en-US, e o robocopy escreve na codepage OEM do console — lido como UTF-8, o "ó" de
 * "Diretórios" vira lixo. Por isso casamos por PREFIXO ASCII do rótulo ("diret"), nunca
 * pela palavra inteira. Se nada casar, devolve null em vez de inventar número.
 */
export function parseResumoRobocopy(saida: string): ResumoRobocopy {
  const linha = (prefixos: string[]) => {
    for (const bruta of saida.split(/\r?\n/)) {
      // Rótulo = qualquer coisa sem dígito antes do ":"; valor = só números separados por espaço
      // (descarta a linha de tempo "N.º de Vezes: 0:00:00", cujo valor tem dois-pontos).
      const m = bruta.match(/^\s*([^\d:]{2,}?)\s*:\s*(\d[\d\s]*)$/);
      if (!m) continue;
      const rotulo = m[1].trim().toLowerCase();
      if (!prefixos.some((p) => rotulo.startsWith(p))) continue;
      const nums = m[2].trim().split(/\s+/).map(Number);
      if (nums.length < 5 || nums.some(Number.isNaN)) continue;
      return { total: nums[0], copiados: nums[1], falhas: nums[4] };
    }
    return null;
  };
  return {
    arquivos: linha(["files", "arquivos"]),
    diretorios: linha(["dirs", "diret", "pastas"]),
  };
}

/** Mesma raiz de volume = cópia no mesmo disco, que não protege contra perda de disco. */
export function mesmoVolume(origem: string, destino: string): boolean {
  return path.parse(path.resolve(origem)).root.toLowerCase() === path.parse(path.resolve(destino)).root.toLowerCase();
}

/** Destino dentro da origem faria o espelho copiar a si mesmo indefinidamente. */
export function destinoDentroDaOrigem(origem: string, destino: string): boolean {
  const o = path.resolve(origem).toLowerCase();
  const d = path.resolve(destino).toLowerCase();
  return d === o || d.startsWith(o + path.sep);
}

export function resolverDestinoStorage(env: NodeJS.ProcessEnv = process.env): string {
  if (env.STORAGE_BACKUP_PATH) return env.STORAGE_BACKUP_PATH;
  const base = env.BACKUP_PATH || path.join(process.cwd(), "backups");
  return path.join(base, "storage");
}

export type ResultadoBackupStorage = {
  origem: string;
  destino: string;
  codigo: number | null;
  resumo: ResumoRobocopy;
  avisoMesmoVolume: boolean;
};

export async function executarBackupStorage(): Promise<ResultadoBackupStorage> {
  if (process.platform !== "win32") {
    throw new Error("Backup de arquivos usa robocopy — só roda no Windows (o deploy é nativo Windows).");
  }
  const origem = process.env.STORAGE_BASE_PATH;
  if (!origem) throw new Error("STORAGE_BASE_PATH ausente.");
  try {
    const info = await stat(origem);
    if (!info.isDirectory()) throw new Error("não é pasta");
  } catch {
    throw new Error(`STORAGE_BASE_PATH inacessível: ${origem}`);
  }

  const destino = resolverDestinoStorage();
  if (destinoDentroDaOrigem(origem, destino)) {
    throw new Error(`Destino do backup (${destino}) está dentro de STORAGE_BASE_PATH — escolha outra pasta.`);
  }
  await mkdir(destino, { recursive: true });

  // Sem /MIR e sem /PURGE: espelho ADITIVO. /XO não regrava quando o destino já é mais novo.
  const args = [origem, destino, "/E", "/XO", "/DCOPY:DAT", "/R:1", "/W:5", "/NFL", "/NDL", "/NP", "/NJH"];

  const { codigo, saida } = await new Promise<{ codigo: number | null; saida: string }>((resolve, reject) => {
    const proc = spawn("robocopy", args, { windowsHide: true });
    let saida = "";
    proc.stdout.on("data", (d) => (saida += d.toString()));
    proc.stderr.on("data", (d) => (saida += d.toString()));
    proc.on("error", reject);
    proc.on("close", (codigo) => resolve({ codigo, saida }));
  });

  if (!robocopyOk(codigo)) {
    throw new Error(`robocopy falhou (${codigo}): ${descreverCodigoRobocopy(codigo)}`);
  }

  return {
    origem,
    destino,
    codigo,
    resumo: parseResumoRobocopy(saida),
    avisoMesmoVolume: mesmoVolume(origem, destino),
  };
}
