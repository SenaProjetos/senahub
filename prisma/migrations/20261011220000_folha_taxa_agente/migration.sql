-- Taxa do agente de integração (IEL) lançada no fechamento da folha (decisão do dono 2026-10-11, G3 da
-- auditoria do rateio): nova parte da folha, ligada como as outras por FolhaLancamento.
ALTER TYPE "ParteFolha" ADD VALUE IF NOT EXISTS 'taxa_agente';
