const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GÜVENLİK KALKANLARI
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);

// ==========================================
// 1. KURUMLARA ÖZEL GÖREVLERİ GETİR (EKSİK OLAN 404 ROTASI DÜZELTİLDİ)
// ==========================================
router.get('/institution/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;

    const tasks = await prisma.task.findMany({
      where: { institutionId },
      include: { progressRecords: true },
      orderBy: { createdAt: 'desc' }
    });

    // TaskProgress modelinde User ilişkisi tanımlı olmadığı için isimleri manuel eşliyoruz
    const userIds = [...new Set(tasks.flatMap(t => t.progressRecords.map(pr => pr.userId)))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true }
    });
    
    const userMap = users.reduce((acc, user) => {
      acc[user.id] = user.fullName;
      return acc;
    }, {});

    const formattedTasks = tasks.map(task => ({
      ...task,
      progressRecords: task.progressRecords.map(pr => ({
        ...pr,
        userFullName: userMap[pr.userId] || 'Bilinmeyen Personel'
      }))
    }));

    res.json(formattedTasks);
  } catch (error) {
    console.error("Kurum görevleri getirme hatası:", error);
    res.status(500).json({ error: 'Görevler getirilemedi.' });
  }
});

// ==========================================
// 2. OTOMATİK GÖREV OLUŞTURMA (EKSİK OLAN 404 ROTASI DÜZELTİLDİ)
// ==========================================
router.post('/auto-create', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { title, moduleType, month, week, institutionId, senderId } = req.body;

    // Görev daha önce oluşturulmuş mu kontrol et
    let task = await prisma.task.findFirst({
      where: { institutionId, moduleType, month, week }
    });

    if (!task) {
      task = await prisma.task.create({
        data: {
          title,
          moduleType,
          month,
          week,
          institutionId,
          senderId,
          status: 'ISLEMDE',
          isAutoTracked: true
        }
      });
    }

    res.json(task);
  } catch (error) {
    console.error("Otomatik görev oluşturma hatası:", error);
    res.status(500).json({ error: 'Görev oluşturulamadı.' });
  }
});

// ==========================================
// 3. İLERLEME HESAPLA (YENİ ŞEMAYA GÖRE TAMAMEN YENİLENEN MOTOR)
// ==========================================
router.post('/calculate-progress', async (req, res) => {
  try {
    const { institutionId, userId, month, week, moduleType } = req.body;

    // 1. Görevi bul
    const task = await prisma.task.findFirst({
      where: { institutionId, month, week, moduleType }
    });
    if (!task) return res.json({ message: "İlgili ay/hafta için atanmış görev bulunamadı." });

    // 2. Hocanın yetkili olduğu sınıfları bul
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { managedClassIds: true }
    });
    
    if (!user || !user.managedClassIds || user.managedClassIds.length === 0) {
       return res.json({ message: "Personelin sorumlu olduğu sınıf yok." });
    }

    // 3. O sınıflardaki aktif öğrencileri bul
    const students = await prisma.student.findMany({
      where: { 
        institutionId, 
        classId: { in: user.managedClassIds },
        status: 'AKTIF'
      },
      select: { id: true }
    });

    const totalExpected = students.length;
    let completedCount = 0;

    // 4. Öğrenciler varsa Yoklama için sayım yap
    if (totalExpected > 0) {
      const studentIds = students.map(s => s.id);
      
      if (moduleType === 'YOKLAMA') {
        // Personelin sınıflarındaki öğrencilerden kaç tanesine yoklama girilmiş sayar
        const attendances = await prisma.attendance.groupBy({
          by: ['studentId'],
          where: { studentId: { in: studentIds } }
        });
        completedCount = attendances.length;
      } 
    }

    const percentage = totalExpected > 0 ? (completedCount / totalExpected) * 100 : 0;

    // 5. TaskProgress kaydını oluştur veya güncelle
    let progress = await prisma.taskProgress.findFirst({
      where: { taskId: task.id, userId }
    });

    if (progress) {
      progress = await prisma.taskProgress.update({
        where: { id: progress.id },
        data: { totalExpected, completedCount, percentage }
      });
    } else {
      progress = await prisma.taskProgress.create({
        data: {
          taskId: task.id,
          userId,
          institutionId,
          totalExpected,
          completedCount,
          percentage
        }
      });
    }

    res.json(progress);
  } catch (error) {
    console.error("Hesaplama hatası:", error);
    res.status(500).json({ error: 'İlerleme hesaplanamadı.' });
  }
});

// ==========================================
// 4. GÖREV SİLME
// ==========================================
router.delete('/:id', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı.' });

    // Sadece görevi gönderen kişi veya Sistem Admini silebilir
    if (task.senderId !== req.user.id && req.user.roleLevel !== 'SISTEM') {
      return res.status(403).json({ error: 'Bu görevi silme yetkiniz yok.' });
    }

    await prisma.taskProgress.deleteMany({ where: { taskId: id } });
    await prisma.task.delete({ where: { id } });

    // 📝 AUDIT LOG YAZILIYOR
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'DELETE', targetType: 'Task', targetId: id, before: JSON.stringify(task) }
    });

    res.json({ message: 'Görev başarıyla silindi.' });
  } catch (error) {
    console.error("Görev silme hatası:", error);
    res.status(500).json({ error: 'Görev silinemedi.' });
  }
});
// ==========================================
// 5. AKILLI ATAMA MOTORU (Dinamik Filtreleme)
// ==========================================
router.post('/assign-smart', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { taskId, institutionId, classId, roleLevel } = req.body;

    // Filtreleme kriterlerini belirle
    let whereClause = {};
    if (institutionId) whereClause.institutionId = institutionId;
    if (classId) whereClause.managedClassIds = { has: classId };
    if (roleLevel) whereClause.roleLevel = roleLevel;

    // Hedef personelleri bul
    const targetUsers = await prisma.user.findMany({ where: whereClause });

    if (targetUsers.length === 0) {
      return res.status(404).json({ error: 'Bu kriterlere uygun personel bulunamadı.' });
    }

    // Atamaları toplu oluştur
    const assignments = await prisma.taskAssignment.createMany({
      data: targetUsers.map(user => ({
        taskId,
        userId: user.id,
        institutionId: user.institutionId,
        classId: classId || null
      }))
    });

    res.json({ message: `${targetUsers.length} personele görev başarıyla atandı.`, count: assignments.count });
  } catch (error) {
    console.error("Akıllı atama hatası:", error);
    res.status(500).json({ error: 'Görev atanamadı.' });
  }
});

module.exports = router;