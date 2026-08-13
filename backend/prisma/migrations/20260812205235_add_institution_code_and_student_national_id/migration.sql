/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Institution` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nationalId]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "studentType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Institution_code_key" ON "Institution"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Student_nationalId_key" ON "Student"("nationalId");
