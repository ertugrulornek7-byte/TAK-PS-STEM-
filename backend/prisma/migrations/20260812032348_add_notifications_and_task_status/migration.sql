-- CreateEnum
CREATE TYPE "TaskAssignmentStatus" AS ENUM ('BEKLIYOR', 'ONAY_BEKLIYOR', 'TAMAMLANDI');

-- AlterTable
ALTER TABLE "TaskAssignment" ADD COLUMN     "status" "TaskAssignmentStatus" NOT NULL DEFAULT 'BEKLIYOR';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
