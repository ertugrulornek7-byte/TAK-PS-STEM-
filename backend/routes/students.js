const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 🔥 GÜVENLİK KALKANLARI VE MERKEZİ BEYİN İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');

router.use(authenticate); 

// ==========================================
// 1. TALEBELERİ GETİR
// ==========================================
router.get('/', async (req, res) => {
  try {
    const whereFilter = HierarchyService.getStudentFilter(req.user);

    const { institutionId } = req.query;
   if (institutionId) {
  whereFilter = { AND: [whereFilter, { institutionId }] };
}
    const students = await prisma.student.findMany({
      where: whereFilter,
      orderBy: [{ status: 'asc' }, { orderIndex: 'asc' }],
      include: {  institution: true } 
    });

    res.json(students);
  } catch (error) { 
    console.error("Talebe Listeleme Hatası:", error);
    res.status(500).json({ error: 'Talebeler getirilemedi.' }); 
  }
});

// ==========================================
// 2. TEKLİ TALEBE EKLEME
// ==========================================
router.post('/', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { studentCode, fullName, institutionId, classId, orderIndex } = req.body;
    
    const targetInstitution = institutionId || req.user.institutionId;
    if (!HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
  return res.status(403).json({ error: 'Sadece yetkili olduğunuz kuruma işlem yapabilirsiniz.' });
}
    if (!targetInstitution) return res.status(400).json({ error: 'Kurum tespit edilemedi!' });

    const newStudent = await prisma.student.create({
      data: { 
        studentCode, 
        fullName, 
        institutionId: targetInstitution,
        orderIndex: orderIndex || 999, 
        classId: classId || null 
      }
    });
    res.json(newStudent);
  } catch (error) { 
    console.error("Talebe Ekleme Hatası:", error);
    res.status(500).json({ error: 'Talebe eklenemedi.' }); 
  }
});

// ==========================================
// 3. TOPLU TALEBE YÜKLEME (EXCEL)
// ==========================================
router.post('/bulk', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { studentsData } = req.body;
    let eklenenCount = 0;

    for (const data of studentsData) {
      const targetInstitutionId = data.institutionId || req.user.institutionId;
      if (!targetInstitutionId) continue; 

      await prisma.student.upsert({
        where: { studentCode: data.studentCode },
        update: {
          fullName: data.fullName,
          classId: data.classId || null,
          institutionId: targetInstitutionId
        },
        create: {
          studentCode: data.studentCode,
          fullName: data.fullName,
          classId: data.classId || null,
          institutionId: targetInstitutionId
        }
      });
      eklenenCount++;
    }

    res.json({ success: true, eklenenCount });
  } catch (error) {
    console.error("Toplu ekleme hatası:", error);
    res.status(500).json({ error: 'Toplu ekleme sırasında sunucuda bir hata oluştu.' });
  }
});

// ==========================================
// 4. AKILLI SİLME VE GÜVENLİK LOGU (AuditLog)
// ==========================================
router.delete('/:id', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const sId = req.params.id;
    const role = req.user.roleLevel; 

    const student = await prisma.student.findUnique({
      where: { id: sId },
      include: { institution: { include: { district: true } } }
    });

    if (!student) return res.status(404).json({ error: 'Talebe bulunamadı.' });

    // KURUM: Pasife Al ve Görev Oluştur
    if (role === 'KURUM') {
      await prisma.student.update({ where: { id: sId }, data: { status: 'PASIF' } });
      
      // 📝 AUDIT LOG
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: 'SOFT_DELETE', targetType: 'Student', targetId: sId, before: JSON.stringify(student) }
      });

      const mintikaManagerId = student.institution.district?.managerId;
      if (mintikaManagerId) {
        // 🔥 ÇÖZÜM BURADA: Eski receiverId yapısı atılıp yeni TaskAssignment yapısına geçildi
        const notifyTask = await prisma.task.create({
          data: {
            title: '⚠️ Talebe Silme Onayı Bekliyor',
            description: `${student.institution.name} kurumundan ${student.fullName} adlı talebe pasife alındı.`,
            status: 'BEKLIYOR', 
            moduleType: 'GENEL',
            senderId: req.user.id, 
            institutionId: student.institutionId
          }
        });

        // Yeni Atama Modeli ile Kullanıcıya Bağlama
        await prisma.taskAssignment.create({
          data: {
            taskId: notifyTask.id,
            userId: mintikaManagerId
          }
        });
      }
      return res.json({ message: 'Talebe pasife alındı.' });
    } 
    
    // ÜST MAKAM: Komple Sil
    if (['MINTIKA', 'BOLGE', 'SISTEM'].includes(role)) {
      await prisma.attendance.deleteMany({ where: { studentId: sId } });
      await prisma.studentBookTracking.deleteMany({ where: { studentId: sId } });
      await prisma.performanceGrade.deleteMany({ where: { studentId: sId } });
      await prisma.preExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.mockExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.testBookResult.deleteMany({ where: { studentId: sId } });
      await prisma.student.delete({ where: { id: sId } });

      // 📝 AUDIT LOG
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: 'HARD_DELETE', targetType: 'Student', targetId: sId, before: JSON.stringify(student) }
      });

      return res.json({ message: 'Talebe kalıcı olarak silindi.' });
    }
  } catch (error) { 
    console.error("Öğrenci silme hatası:", error);
    res.status(500).json({ error: 'İşlem başarısız.' }); 
  }
});

module.exports = router;