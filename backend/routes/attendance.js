const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// 🔥 Güvenlik Duvarlarımız
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const HierarchyService = require('../services/hierarchyService');

router.use(authenticate);

// ==========================================
// ZOD ŞEMALARI (Veri Doğrulama Kuralları)
// ==========================================
const attendanceSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Talebe ID"),
    date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Geçersiz tarih formatı" }),
    status: z.enum(['VAR', 'YOK', 'IZINLI', 'GEC', 'RAPORLU'], { 
      errorMap: () => ({ message: "Durum sadece VAR, YOK, IZINLI, GEC veya RAPORLU olabilir" }) 
    }),
    note: z.string().optional()
  })
});

// ==========================================
// 1. GÜNLÜK YOKLAMA GİRİŞİ VEYA GÜNCELLEMESİ (UPSERT)
// ==========================================
// 🔥 Sadece yetkili olanlar yoklama alabilir
router.post('/', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(attendanceSchema), async (req, res, next) => {
  try {
    const { studentId, date, status, note } = req.body;

    // 1. Önce öğrenciyi ve kurumunu bul
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Talebe bulunamadı.' });

    // 2. 🔥 GÜVENLİK KALKANI: Bu personel, bu öğrencinin kurumunda işlem yapabilir mi?
    const hasAccess = await HierarchyService.assertOwnsInstitution(req.user, student.institutionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Bu talebe üzerinde yoklama alma yetkiniz yok.' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Varsa güncelle, yoksa yeni kayıt oluştur
    const record = await prisma.attendance.findFirst({
      where: {
        studentId,
        date: { gte: startOfDay, lte: endOfDay }
      }
    });

    let updatedAttendance;
    if (record) {
      updatedAttendance = await prisma.attendance.update({
        where: { id: record.id },
        data: { status, note }
      });
    } else {
      updatedAttendance = await prisma.attendance.create({
        data: { studentId, date: new Date(date), status, note }
      });
    }

    res.json({ message: 'Yoklama kaydedildi.', data: updatedAttendance });
  } catch (error) {
    next(error); // Merkezi Hata Yöneticisine (errorHandler) gönder
  }
});

// ==========================================
// 2. YOKLAMA GEÇMİŞİNİ GETİRME
// ==========================================
router.get('/:studentId', async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Talebe bulunamadı.' });

    // Güvenlik kalkanı
    const hasAccess = await HierarchyService.assertOwnsInstitution(req.user, student.institutionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Yetkisiz erişim denemesi.' });
    }

    const history = await prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
      take: 30 // Son 30 günlük veriyi getir
    });

    res.json(history);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// HAFTALIK YOKLAMA RAPORU (Ön Yüz İçin)
// ==========================================
router.get('/weekly/:institutionId/:startDate/:endDate', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const { institutionId, startDate, endDate } = req.params;
    
    // Güvenlik Kalkanı: Bu kullanıcı bu kurumu görebilir mi?
    await HierarchyService.assertOwnsInstitution(req.user, institutionId);

    const records = await prisma.attendance.findMany({
      where: {
        institutionId: institutionId,
        date: {
          gte: new Date(startDate), // Başlangıç tarihinden büyük eşit
          lte: new Date(endDate)    // Bitiş tarihinden küçük eşit
        }
      },
      include: {
        student: { select: { id: true, fullName: true, classId: true } },
        class: true
      }
    });

    res.json(records);
  } catch (error) {
    next(error);
  }
});
module.exports = router;