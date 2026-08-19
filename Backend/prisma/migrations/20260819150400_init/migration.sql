/*
  Warnings:

  - A unique constraint covering the columns `[userId,messageId]` on the table `Draft` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Draft_messageId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Draft_userId_messageId_key" ON "Draft"("userId", "messageId");
