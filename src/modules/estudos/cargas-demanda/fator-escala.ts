/**
 * Fatores que a tela e o relatório mostram em porcentagem (Neoenergia, fator de coincidência: 87,20 e não 0,872). A conta e o
 * documento guardam a fração; só a exibição multiplica por 100 — **puro**.
 */
const EM_PERCENTUAL = new Set(["neoenergia:fc"]);

export const fatorEmPercentual = (concessionaria: string | null, chave: string): boolean => concessionaria != null && EM_PERCENTUAL.has(`${concessionaria}:${chave}`);
