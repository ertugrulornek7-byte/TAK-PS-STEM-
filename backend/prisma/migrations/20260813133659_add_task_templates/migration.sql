-- CreateEnum
CREATE TYPE "RecurrencePattern" AS ENUM ('HAFTALIK', 'AYLIK');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "moduleType" "TaskModuleType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recurrence" "RecurrencePattern" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "deadlineHour" INTEGER NOT NULL DEFAULT 15,
    "deadlineMinute" INTEGER NOT NULL DEFAULT 0,
    "institutionId" TEXT,
    "districtId" TEXT,
    "regionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
