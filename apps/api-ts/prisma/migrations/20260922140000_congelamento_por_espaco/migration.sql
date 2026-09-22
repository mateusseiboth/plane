-- Congelamento por espaço (W09): congelar pelo espaço desliga só o vínculo com
-- aquele espaço; congelar a conta inteira é do admin da instância e não tem
-- espaço no histórico. As contas do portal ganham versão de sessão.

-- AlterTable
ALTER TABLE "freeze_events" ALTER COLUMN "workspace_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "portal_accounts" ADD COLUMN     "token_updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "workspace_members" ADD COLUMN     "frozen_at" TIMESTAMP(3),
ADD COLUMN     "frozen_reason" TEXT;
