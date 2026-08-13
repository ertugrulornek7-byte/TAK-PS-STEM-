const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Modüllere özel tamamlama hesaplayıcıları
const trackers = {
  // YOKLAMA MODÜLÜ İZLEYİCİSİ
  YOKLAMA: async (institutionId, periodStart, periodEnd) => {
    // 1. Kurumdaki toplam aktif öğrenci sayısını bul
    const toplamOgrenci = await prisma.student.count({
      where: { institutionId, status: 'AKTIF' }
    });

    if (toplamOgrenci === 0) return { tamamlananSayi: 0, beklenenSayi: 0, sonIslemTarihi: null };

    // 2. Bu tarih aralığında yoklaması alınmış eşsiz öğrenci sayısını bul
    const yoklamaAlinan = await prisma.attendance.groupBy({
      by: ['studentId'],
      where: {
        student: { institutionId },
        date: {
          gte: periodStart,
          lte: periodEnd
        }
      }
    });

    // 3. Kurumun son işlem yaptığı tarihi bul
    const sonIslem = await prisma.attendance.findFirst({
      where: { student: { institutionId }, date: { gte: periodStart, lte: periodEnd } },
      orderBy: { date: 'desc' }
    });

    return {
      tamamlananSayi: yoklamaAlinan.length,
      beklenenSayi: toplamOgrenci,
      sonIslemTarihi: sonIslem ? sonIslem.date : null
    };
  }

  // KITAP, PERFORMANS gibi diğer modüller buraya eklenecek...
};

module.exports = {
  getTracker: (moduleType) => trackers[moduleType]
};