const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);
const prisma = new PrismaClient();

// ==========================================
// VERİ DOĞRULAMA ŞABLONLARI (ZOD)
// ==========================================
const performanceSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Talebe ID"),
    weekStartDate: z.string().min(1, "Hafta başlangıç tarihi zorunludur"),
    subjectId: z.number().int("Ders ID tam sayı olmalıdır"),
    score: z.number().int("Not tam sayı olmalıdır").min(0, "Not 0'dan küçük olamaz")
  })
});

const performanceSettingSchema = z.object({
  body: z.object({
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable(),
    weekStartDate: z.string().min(1, "Hafta başlangıç tarihi zorunludur"),
    subjectId: z.number().int("Ders ID tam sayı olmalıdır"),
    isCancelled: z.boolean({ required_error: "İptal durumu zorunludur" })
  })
});

// ==========================================
// ALT MODÜL: DERSHANE PERFORMANS (SAYFA 4)
// ==========================================

// 1. Talebeye Performans Notu Girme
router.post('/performance', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(performanceSchema), async (req, res, next) => {
  try {
    const { studentId, weekStartDate, subjectId, score } = req.body;

    // Hiyerarşi Kontrolü: Bu talebeye not girme yetkisi var mı?
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Bu talebeye not girme yetkiniz yok.' });
    }

    const targetDate = new Date(weekStartDate);
    targetDate.setUTCHours(0, 0, 0, 0);
    const bugun = new Date();
    bugun.setUTCHours(0, 0, 0, 0);
    
    if (targetDate > bugun) return res.status(400).json({ error: 'Gelecek haftalar için not giremezsiniz!' });

    const grade = await prisma.performanceGrade.upsert({
      where: { studentId_weekStartDate_subjectId: { studentId, weekStartDate: targetDate, subjectId } },
      update: { score },
      create: { studentId, weekStartDate: targetDate, subjectId, score }
    });
    res.json(grade);
  } catch (error) { next(error); }
});

// 2. Haftalık Ders Ayarlarını (İptal Durumunu) Kaydetme
router.post('/performance/settings', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(performanceSettingSchema), async (req, res, next) => {
  try {
    const { institutionId, weekStartDate, subjectId, isCancelled } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    // Hiyerarşi Kontrolü: Bu kurumun ayarlarını değiştirme yetkisi var mı?
    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Bu kurumun ders ayarlarını değiştirme yetkiniz yok.' });
    }

    const targetDate = new Date(weekStartDate);
    targetDate.setUTCHours(0, 0, 0, 0);

    const setting = await prisma.weeklyClassSetting.upsert({
      where: { institutionId_weekStartDate_subjectId: { institutionId: targetInstitution, weekStartDate: targetDate, subjectId } },
      update: { isCancelled },
      create: { institutionId: targetInstitution, weekStartDate: targetDate, subjectId, isCancelled }
    });

    // Ders iptal edildiyse, o güne ait önceden girilmiş notları sil
    if (isCancelled) {
      await prisma.performanceGrade.deleteMany({
        where: { student: { institutionId: targetInstitution }, weekStartDate: targetDate, subjectId }
      });
    }
    res.json(setting);
  } catch (error) { next(error); }
});

// 3. Kurumun Haftalık Performans Verilerini Getirme
router.get('/performance/:institutionId/:weekStartDate', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { institutionId, weekStartDate } = req.params;

    // Hiyerarşi Kontrolü: Bu kurumun notlarını görme yetkisi var mı?
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun performans verilerini görme yetkiniz yok.' });
    }

    const targetDate = new Date(weekStartDate);
    targetDate.setUTCHours(0, 0, 0, 0);

    const grades = await prisma.performanceGrade.findMany({ 
      where: { student: { institutionId }, weekStartDate: targetDate } 
    });
    const settings = await prisma.weeklyClassSetting.findMany({ 
      where: { institutionId, weekStartDate: targetDate } 
    });

    res.json({ grades, settings });
  } catch (error) { next(error); }
});

module.exports = router;