/*
  Warnings:

  - The `status` column on the `ConnectionRequest` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `fixStatus` column on the `Inspection` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Task` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `moduleType` column on the `Task` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `_UserClasses` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_UserLevels` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TaskModuleType" AS ENUM ('YOKLAMA', 'KITAP', 'MUFREDAT', 'PERFORMANS', 'YOY', 'DENEME', 'KDU', 'GENEL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('BEKLIYOR', 'ISLEMDE', 'TAMAMLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('BEKLIYOR', 'ISLEMDE', 'GIDERILDI');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Book" DROP CONSTRAINT "Book_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Class" DROP CONSTRAINT "Class_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Exam" DROP CONSTRAINT "Exam_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Performance" DROP CONSTRAINT "Performance_studentId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionTracking" DROP CONSTRAINT "QuestionTracking_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_classId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_levelGroupId_fkey";

-- DropForeignKey
ALTER TABLE "StudentBookTracking" DROP CONSTRAINT "StudentBookTracking_bookId_fkey";

-- DropForeignKey
ALTER TABLE "StudentBookTracking" DROP CONSTRAINT "StudentBookTracking_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "_UserClasses" DROP CONSTRAINT "_UserClasses_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserClasses" DROP CONSTRAINT "_UserClasses_B_fkey";

-- DropForeignKey
ALTER TABLE "_UserLevels" DROP CONSTRAINT "_UserLevels_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserLevels" DROP CONSTRAINT "_UserLevels_B_fkey";

-- AlterTable
ALTER TABLE "ConnectionRequest" DROP COLUMN "status",
ADD COLUMN     "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Inspection" DROP COLUMN "fixStatus",
ADD COLUMN     "fixStatus" "InspectionStatus" NOT NULL DEFAULT 'BEKLIYOR';

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "nevi" TEXT NOT NULL DEFAULT 'ORTAOKUL';

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "status",
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'BEKLIYOR',
DROP COLUMN "moduleType",
ADD COLUMN     "moduleType" "TaskModuleType";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managedClassIds" TEXT[];

-- DropTable
DROP TABLE "_UserClasses";

-- DropTable
DROP TABLE "_UserLevels";

-- DropEnum
DROP TYPE "InspectionLevel";

-- CreateIndex
CREATE INDEX "Attendance_studentId_date_idx" ON "Attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "Class_institutionId_idx" ON "Class"("institutionId");

-- CreateIndex
CREATE INDEX "LevelGroup_institutionId_idx" ON "LevelGroup"("institutionId");

-- CreateIndex
CREATE INDEX "Student_institutionId_idx" ON "Student"("institutionId");

-- CreateIndex
CREATE INDEX "Student_classId_idx" ON "Student"("classId");

-- CreateIndex
CREATE INDEX "Task_institutionId_month_week_idx" ON "Task"("institutionId", "month", "week");

-- CreateIndex
CREATE INDEX "User_institutionId_idx" ON "User"("institutionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBookTracking" ADD CONSTRAINT "StudentBookTracking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBookTracking" ADD CONSTRAINT "StudentBookTracking_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Performance" ADD CONSTRAINT "Performance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTracking" ADD CONSTRAINT "QuestionTracking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
