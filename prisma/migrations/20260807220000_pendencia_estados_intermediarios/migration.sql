-- Item 22 (estados intermediários) + item 23 (contagem de reabertura).
--
-- ADITIVA de propósito: os estados novos (`em_correcao`, `adiado`) são apenas valores novos da
-- coluna `status`, que já é TEXT — nada a alterar. E o estado que a UI passa a chamar de
-- "Não procede" continua GRAVADO como `descartada`: é o mesmo estado (ver ficha do item 22),
-- e renomear invalidaria o `AuditLog` já escrito, além de exigir UPDATE em tabela populada.

ALTER TABLE "pendencia" ADD COLUMN "justificativaDescarte" TEXT;
-- NOT NULL com default: a contagem entra em média/KPI, e nulo obrigaria guarda em todo lugar
-- que soma. Linha existente nunca foi reaberta pela contagem, então 0 é o valor correto.
ALTER TABLE "pendencia" ADD COLUMN "reaberturas" INTEGER NOT NULL DEFAULT 0;
