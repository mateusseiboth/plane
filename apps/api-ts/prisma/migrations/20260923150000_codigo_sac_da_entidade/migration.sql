-- Código da entidade no SAC desktop. O legacy_id é o id da intranet; o servidor
-- de backups (envio_autom.id_entidade) e o SAC falam pelo código desktop, que só
-- coincide com o id da intranet em 41 das 269 entidades.
ALTER TABLE "entities" ADD COLUMN "sac_code" INTEGER;
CREATE INDEX "entities_sac_code_idx" ON "entities"("sac_code");
