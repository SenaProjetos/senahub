-- Avisos criados antes do agendamento ficaram com "alvoUserIds" em NULL (a coluna
-- entrou sem DEFAULT). O Prisma declara o campo como String[] não-nulo e converte
-- NULL para [] na leitura, mas SQL cru veria NULL — normaliza para lista vazia.
UPDATE "aviso" SET "alvoUserIds" = ARRAY[]::TEXT[] WHERE "alvoUserIds" IS NULL;
