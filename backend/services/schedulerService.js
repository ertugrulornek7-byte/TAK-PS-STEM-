const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class SchedulerService {
  static init() {
    console.log('⏰ SchedulerService: Zamanlanmış görevler başlatıldı.');

    // CRON İFADESİ: '0 8 * * 1' -> Her Pazartesi sabah saat 08:00'de çalışır.
    // (Test etmek için istersen '* * * * *' yaparak her dakika çalışmasını sağlayabilirsin)
    cron.schedule('0 8 * * 1', async () => {
      console.log('🔄 Otomatik görev oluşturma motoru tetiklendi...');
      await this.generateWeeklyTasks();
    });
  }

  static async generateWeeklyTasks() {
    try {
      // 🔥 DÜZELTME: schema.prisma'da Task.senderId ZORUNLU bir alan (String,
      // "String?" değil). Bu satır olmadan aşağıdaki prisma.task.create() her
      // Pazartesi sessizce hata fırlatıyordu ve otomatik görev üretme motoru
      // fiilen hiç çalışmıyordu (catch bloğu hatayı yutup logluyordu).
      const sistemUser = await prisma.user.findFirst({ where: { roleLevel: 'SISTEM' } });
      if (!sistemUser) {
        console.error('❌ Otomatik görev üretilemedi: Sistemde SISTEM seviyeli bir kullanıcı yok (senderId için gerekli). Önce seed.js veya /setup-admin ile bir SISTEM admini oluştur.');
        return;
      }

      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-12 arası
      // Basit bir hafta hesaplaması (Bulunulan ayın kaçıncı haftası)
      const currentWeek = Math.ceil(now.getDate() / 7);

      // 1. Tüm aktif kurumları bul
      const institutions = await prisma.institution.findMany();

      for (const inst of institutions) {
        // 2. Bu kurumdaki standart 'PERSONEL' rolündeki kullanıcıları bul
        const personeller = await prisma.user.findMany({
          where: {
            institutionId: inst.id,
            roleLevel: 'PERSONEL'
          }
        });

        if (personeller.length === 0) continue; // Personel yoksa atla

        // 3. Ana Görevi (Task) Oluştur (Örn: Haftalık Yoklama)
        const yoklamaGorevi = await prisma.task.create({
          data: {
            title: `${currentMonth}. Ay ${currentWeek}. Hafta - Etüt Yoklaması`,
            description: 'Lütfen bu haftaya ait etüt yoklama girişlerini tamamlayınız.',
            moduleType: 'YOKLAMA',
            status: 'BEKLIYOR',
            month: currentMonth,
            week: currentWeek,
            institutionId: inst.id,
            senderId: sistemUser.id
          }
        });

        // 4. Görevi personellere ata (TaskAssignment modeli ile)
        const assignments = personeller.map(p => ({
          taskId: yoklamaGorevi.id,
          userId: p.id
        }));

        await prisma.taskAssignment.createMany({
          data: assignments
        });

        console.log(`✅ ${inst.name} kurumu için ${currentWeek}. hafta görevleri atandı.`);
      }

    } catch (error) {
      console.error('❌ Haftalık görevler oluşturulurken hata meydana geldi:', error);
    }
  }
}

module.exports = SchedulerService;