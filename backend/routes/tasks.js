const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/auto-create', async (req, res) => {
  try {
    const { title, month, week, institutionId, senderId, moduleType } = req.body;
    const newTask = await prisma.task.create({
      data: {
        title, moduleType, isAutoTracked: true,
        month: parseInt(month), week: parseInt(week), 
        institutionId: institutionId || null, senderId
      }
    });
    res.json(newTask);
  } catch (error) { res.status(500).json({ error: 'Görev oluşturulamadı.' }); }
});

// 🚀 AKILLI VE GERİYE DÖNÜK İLERLEME HESAPLAYICI (TARİH VE MODÜL BAZLI)
router.post('/calculate-progress', async (req, res) => {
  try {
    const { institutionId, userId, month, week, moduleType } = req.body;
    
    console.log(`\n⚙️ [MOTOR ÇALIŞTI] Modül: ${moduleType} | Ay: ${month} | Hafta: ${week} | Hoca: ${userId.substring(0,8)}...`);

    if (!moduleType) return res.json({ message: "Modül tipi belirtilmemiş!" });

    const task = await prisma.task.findFirst({
      where: { institutionId, month: parseInt(month), week: parseInt(week), moduleType }
    });
    
    if (!task) {
      console.log("❌ Bu aya ve haftaya ait aktif görev bulunamadı.");
      return res.json({ message: "Görev yok." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }, include: { managedClasses: true }
    });
    const classIds = user?.managedClasses.map(c => c.id) || [];
    
    const totalStudents = await prisma.student.count({
      where: { institutionId, classGroupId: { in: classIds } }
    });

    if (['YOKLAMA', 'PERFORMANS', 'KITAP'].includes(moduleType) && totalStudents === 0) {
      console.log("❌ Hocanın sınıfında kayıtlı talebe yok, hesaplama iptal.");
      return res.json({ message: "Hocanın talebesi yok." });
    }

    let expectedCount = 0;
    let completedCount = 0;

    // --- ZAMAN MAKİNESİ (Tarih Aralığını Bul) ---
    const yil = new Date().getFullYear();
    const ayIndex = parseInt(month) - 1;
    const haftaStartGun = ((parseInt(week) - 1) * 7) + 1;
    let haftaEndGun = parseInt(week) * 7;
    
    const ayinSonGunu = new Date(yil, ayIndex + 1, 0).getDate();
    if (haftaEndGun > ayinSonGunu) haftaEndGun = ayinSonGunu;

    const startDate = new Date(yil, ayIndex, haftaStartGun);
    const endDate = new Date(yil, ayIndex, haftaEndGun, 23, 59, 59);

    // 1. YOKLAMA MODÜLÜ (Öğrenci Başı 5 Gün)
    if (moduleType === 'YOKLAMA') {
      expectedCount = totalStudents * 5; 
      const attendances = await prisma.attendance.findMany({
        where: { student: { classGroupId: { in: classIds } }, date: { gte: startDate, lte: endDate } }
      });
      completedCount = attendances.length;
    } 
    // 2. PERFORMANS MODÜLÜ (Öğrenci Başı 5 Ders)
    else if (moduleType === 'PERFORMANS') {
      expectedCount = totalStudents * 5; 
      const grades = await prisma.performanceGrade.findMany({
        where: { student: { classGroupId: { in: classIds } }, weekStartDate: { gte: startDate, lte: endDate } }
      });
      completedCount = grades.length;
    }
   // 3. KİTAP TAKİBİ MODÜLÜ (Öğrenci Başı Aylık Etkileşim)
    else if (moduleType === 'KITAP') {
      expectedCount = totalStudents; 
      
      // Kitap hesaplamasını ilgili AY için yapıyoruz (O ayın 1'i ile son günü arası)
      const startOfMonth = new Date(Date.UTC(yil, ayIndex, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(yil, ayIndex + 1, 0, 23, 59, 59));
      
      // Veritabanına soruyoruz: "Bu ay içinde 'logs' (okuma geçmişi) atılmış ve okuduğu sayfa 0'dan büyük olan talebeleri getir"
      const activeTrackings = await prisma.studentBookTracking.findMany({
        where: { 
          student: { classGroupId: { in: classIds } }, 
          readPages: { gt: 0 },
          // targetMonth yerine Prisma'daki gerçek tarih ilişkisini kullanıyoruz:
          logs: {
            some: {
              date: { gte: startOfMonth, lte: endOfMonth }
            }
          }
        }
      });

      // Aynı çocuk o ay 5 kere kitap okuduysa bile 1 kere say (Benzersiz Öğrenci)
      const uniqueStudents = new Set(activeTrackings.map(bt => bt.studentId));
      completedCount = uniqueStudents.size;
    }
    // 4. MÜFREDAT MODÜLÜ (O tarihe kadar işlenmesi gereken konular)
    else if (moduleType === 'MUFREDAT') {
      const activeTopics = await prisma.curriculumTopic.findMany({
        where: { subject: { institutionId }, endDate: { lte: endDate } }
      });
      expectedCount = activeTopics.length * classIds.length; // Hedef: Tüm konular * Hocanın sınıfları
      
      if (expectedCount > 0) {
        completedCount = await prisma.topicProgress.count({
          where: { topicId: { in: activeTopics.map(t => t.id) }, classGroupId: { in: classIds }, status: "ISLENDI" }
        });
      }
    }

    // Yüzdeyi Güvenli Şekilde Hesapla ve Kaydet
    let percentage = expectedCount > 0 ? (completedCount / expectedCount) * 100 : 0;
    if (percentage > 100) percentage = 100;

    let progressRecord = await prisma.taskProgress.findFirst({
      where: { taskId: task.id, userId: userId }
    });

    if (progressRecord) {
      progressRecord = await prisma.taskProgress.update({
        where: { id: progressRecord.id },
        data: { completedCount, totalExpected: expectedCount, percentage }
      });
    } else {
      progressRecord = await prisma.taskProgress.create({
        data: { taskId: task.id, userId, institutionId, completedCount, totalExpected: expectedCount, percentage }
      });
    }

    res.json(progressRecord);
  } catch (error) { 
    console.error("HESAPLAMA HATASI:", error);
    res.status(500).json({ error: 'Hesaplama hatası.' }); 
  }
});

router.get('/institution/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;
    const tasks = await prisma.task.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
      include: { progressRecords: true, sender: { select: { fullName: true } } }
    });

    for (let task of tasks) {
      for (let record of task.progressRecords) {
        const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { fullName: true } });
        record.userFullName = user ? user.fullName : "Bilinmeyen Personel";
      }
    }
    res.json(tasks);
  } catch (error) { res.status(500).json({ error: 'Görevler getirilemedi.' }); }
});

module.exports = router;