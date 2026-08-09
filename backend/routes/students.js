const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 🔥 GÜVENLİK KALKANLARI VE MERKEZİ BEYİN İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu satır sayesinde bu dosyadaki TÜM rotalar KİMLİK KONTROLÜNDEN geçmek zorunda!
router.use(authenticate); 

// ==========================================
// 1. TALEBELERİ GETİR (Sadece Kendi Makamına Göre)
// ==========================================
router.get('/', async (req, res) => {
  try {
    // 🎯 Eski karmaşık if-else blokları GİTTİ! Merkezi servis bizim yerimize filtreyi veriyor.
    const whereFilter = HierarchyService.getStudentFilter(req.user);

    // Eğer sayfadan özellikle bir kurum seçildiyse ve kullanıcının buna yetkisi varsa ekle
    const { institutionId } = req.query;
    if (institutionId) {
      whereFilter.institutionId = institutionId;
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
    
    // 🔥 YENİ DOKUNUŞ: Frontend'den gelmezse, yapan adamın kendi kurumunu al!
    const targetInstitution = institutionId || req.user.institutionId;
    
    if (!targetInstitution) return res.status(400).json({ error: 'Kurum tespit edilemedi!' });

    const newStudent = await prisma.student.create({
      data: { 
        studentCode, 
        fullName, 
        institutionId: targetInstitution, // Burayı güncelledik
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

// TOPLU TALEBE YÜKLEME (EXCEL)
router.post('/bulk', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { studentsData } = req.body;
    let eklenenCount = 0;

    // Excel'den gelen her bir satır için işlem yap
    for (const data of studentsData) {
      
      // Kurum ID'sini güvene al: Eğer Excel'de kurum belirtilmemişse, yükleyen kişinin kendi kurumunu baz al.
      const targetInstitutionId = data.institutionId || req.user.institutionId;
      
      if (!targetInstitutionId) {
        continue; // Kurum bulunamadıysa bu satırı atla
      }

      // UPSERT: Varsa Güncelle, Yoksa Yeni Oluştur!
      await prisma.student.upsert({
        where: { 
          studentCode: data.studentCode // Talebe koduna göre arar
        },
        update: {
          // Eğer bu talebe kodu zaten varsa, sadece ismini ve sınıfını günceller. ÇÖKMEZ!
          fullName: data.fullName,
          classId: data.classId || null,
          institutionId: targetInstitutionId
        },
        create: {
          // Eğer bu talebe kodu hiç yoksa, sıfırdan oluşturur.
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

    // KURUM_EM: Pasife Al
    if (role === 'KURUM') {
      await prisma.student.update({ where: { id: sId }, data: { status: 'PASIF' } });
      
      // 📝 AUDIT LOG YAZILIYOR
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: 'SOFT_DELETE', targetType: 'Student', targetId: sId, before: JSON.stringify(student) }
      });

      const mintikaManagerId = student.institution.district?.managerId;
      if (mintikaManagerId) {
        await prisma.task.create({
          data: {
            title: '⚠️ Talebe Silme Onayı Bekliyor',
            description: `${student.institution.name} kurumundan ${student.fullName} adlı talebe pasife alındı.`,
            status: 'BEKLIYOR', senderId: req.user.id, receiverId: mintikaManagerId, institutionId: student.institutionId
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

      // 📝 AUDIT LOG YAZILIYOR
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: 'HARD_DELETE', targetType: 'Student', targetId: sId, before: JSON.stringify(student) }
      });

      return res.json({ message: 'Talebe kalıcı olarak silindi.' });
    }
  } catch (error) { 
    res.status(500).json({ error: 'İşlem başarısız.' }); 
  }
});

module.exports = router;