-- Contas provisórias (2026-11-01): o contador autorizou criar ISS a Recolher, ISS a Compensar e INSS a Compensar no
-- nosso plano de referência antes de existirem oficialmente no Alterdata dele. O contrato de exportação é a
-- CLASSIFICAÇÃO (decisão 2026-10-16), não o reduzido interno — ele se adequa quando criar as contas reais com as
-- mesmas classificações (2.1.3.01.0006 / 1.1.3.06.0002 / 1.1.3.06.0003). Mesmo padrão da 20261016120000.
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt") VALUES
  (gen_random_uuid()::text, 'imposto_recolher', 'iss', 9101, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_compensar', 'iss', 9102, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_compensar', 'inss', 9103, false, CURRENT_TIMESTAMP)
ON CONFLICT ("alvo", "alvoId") DO NOTHING;
