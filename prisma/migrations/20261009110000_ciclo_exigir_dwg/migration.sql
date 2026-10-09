-- Ciclo documental: publicar exige o DWG na revisão, por projeto (padrão ligado). Só acrescenta.
ALTER TABLE "config_documentos_projeto" ADD COLUMN "exigirDwgParaPublicar" BOOLEAN NOT NULL DEFAULT true;
