-- Currículo enviado pela página pública "Trabalhe conosco": e-mail, cidade,
-- origem e o aceite da LGPD, mais o interruptor por espaço.
ALTER TABLE "curriculos" ADD COLUMN "email" VARCHAR(200);
ALTER TABLE "curriculos" ADD COLUMN "city" VARCHAR(120);
ALTER TABLE "curriculos" ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'chat';
ALTER TABLE "curriculos" ADD COLUMN "consent_at" TIMESTAMP(3);

ALTER TABLE "curriculo_config" ADD COLUMN "site_enabled" BOOLEAN NOT NULL DEFAULT false;
