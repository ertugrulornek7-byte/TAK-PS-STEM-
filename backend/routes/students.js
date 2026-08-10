const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod'); // 🔥 Zod Kütüphanesi

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');
const validate = require('../middleware/validate'); // 🔥 Bekçimiz

router.use(authenticate);

// ==========================================
// ZOD ŞEMALARI (Kurallar Dizisi)
// ==========================================
const createStudentSchema = z.object({
  body: z.object({
    studentCode: z.string({ required_error: "Talebe numarası zorunludur" }).min(1, "Numara boş olamaz"),
    fullName: z.string({ required_error: "Ad Soyad zorunludur" }).min(2, "Ad Soyad en az 2 harf olmalıdır"),
    institutionId: z.string().uuid("Geçersiz Kurum ID formatı").optional().nullable(),
    classId: z.string().uuid("Geçersiz Sınıf ID formatı").optional().nullable(),
    orderIndex: z.number().int().optional().nullable()
  })
});

// ==========================================
// 1. TALEBELERİ GETİR
// ==========================================
router.get('/', async (req, res) => {
  try {
    let whereFilter = HierarchyService.getStudentFilter(req.user);

    const { institutionId } = req.query;
    if (institutionId) {
      whereFilter = { AND: [whereFilter, { institutionId }] };
    }

    const students = await prisma.student.findMany({
      where: whereFilter,
      orderBy: [{ status: 'asc' }, { orderIndex: 'asc' }],
      include: { institution: true }
    });

    res.json(students);
  } catch (error) {
    console.error("Talebe Listeleme Hatası:", error);
    res.status(500).json({ error: 'Talebeler getirilemedi.' });
  }
});

// ==========================================
// 2. TEKLİ TALEBE EKLEME (🔥 ZOD BEKÇİSİ EKLENDİ)
// ==========================================
router.post('/', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(createStudentSchema), async (req, res) => {
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
// 3. AKILLI TOPLU TALEBE YÜKLEME (EXCEL)
// ==========================================
router.post('/bulk', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { studentsData } = req.body;
    let eklenenCount = 0;
    const isUpperManager = ['SISTEM', 'BOLGE', 'MINTIKA'].includes(req.user.roleLevel);

    for (const data of studentsData) {
      if (!data.studentCode || !data.firstName) continue;

      let targetInstitutionId = req.user.institutionId; // Varsayılan: Kendi kurumu

      // 🌟 EĞER YÖNETİCİ İSE: HİYERARŞİYİ OTOMATİK OLUŞTUR (Kurum Kodu'na Göre)
      if (isUpperManager && data.bolge && data.mintika && data.kurum) {
        
        // 1. Bölgeyi Bul veya Oluştur
        let region = await prisma.region.findFirst({ where: { name: data.bolge } });
        if (!region) {
          region = await prisma.region.create({ data: { name: data.bolge } });
        }

        // 2. Mıntıkâyı Bul veya Oluştur
        let district = await prisma.district.findFirst({ where: { name: data.mintika, regionId: region.id } });
        if (!district) {
          district = await prisma.district.create({ data: { name: data.mintika, regionId: region.id } });
        }

        // 3. Kurumu Bul veya Oluştur (Kurum Kodunu isme gömerek eşsizleştiriyoruz)
        const kurumIsmi = data.kurumKodu ? `[${data.kurumKodu}] ${data.kurum}` : data.kurum;
        let institution = await prisma.institution.findFirst({ where: { name: kurumIsmi, districtId: district.id } });
        
        if (!institution) {
          institution = await prisma.institution.create({ data: { name: kurumIsmi, districtId: district.id } });
        }
        
        targetInstitutionId = institution.id; // Hedefi yeni oluşturulan/bulunan kurum yap
      }

      // Güvenlik Kalkanı: Oluşturulan kurum kullanıcının yetki alanında mı?
      if (!targetInstitutionId || !HierarchyService.assertOwnsInstitution(req.user, targetInstitutionId)) {
        continue; // Yetkisi yoksa bu satırı atla
      }

      const fullName = `${data.firstName} ${data.lastName}`.trim();

      // 4. Talebeyi Bul veya Oluştur (Upsert)
      await prisma.student.upsert({
        where: { studentCode: data.studentCode },
        update: {
          fullName: fullName,
          institutionId: targetInstitutionId
          // Not: Kimlik No ve Okul Seviyesi alanları şemaya eklendiğinde buraya yazılacak
        },
        create: {
          studentCode: data.studentCode,
          fullName: fullName,
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
// 4. AKILLI SİLME VE GÜVENLİK LOGU
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

    if (role === 'KURUM') {
      await prisma.student.update({ where: { id: sId }, data: { status: 'PASIF' } });

      await prisma.auditLog.create({
        data: { userId: req.user.id, action: 'SOFT_DELETE', targetType: 'Student', targetId: sId, before: JSON.stringify(student) }
      });

      const mintikaManagerId = student.institution.district?.managerId;
      if (mintikaManagerId) {
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

        await prisma.taskAssignment.create({
          data: { taskId: notifyTask.id, userId: mintikaManagerId }
        });
      }
      return res.json({ message: 'Talebe pasife alındı.' });
    }

    if (['MINTIKA', 'BOLGE', 'SISTEM'].includes(role)) {
      await prisma.attendance.deleteMany({ where: { studentId: sId } });
      await prisma.studentBookTracking.deleteMany({ where: { studentId: sId } });
      await prisma.performanceGrade.deleteMany({ where: { studentId: sId } });
      await prisma.preExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.mockExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.testBookResult.deleteMany({ where: { studentId: sId } });
      await prisma.student.delete({ where: { id: sId } });

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