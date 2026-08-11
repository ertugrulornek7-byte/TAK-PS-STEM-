const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class NotificationService {
  static async createNotification(userId, title, message) {
    try {
      return await prisma.notification.create({
        data: { userId, title, message }
      });
    } catch (error) {
      console.error("Bildirim oluşturma hatası:", error);
    }
  }
}
module.exports = NotificationService;