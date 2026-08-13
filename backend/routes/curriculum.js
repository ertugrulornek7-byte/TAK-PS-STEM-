const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);

// ==========================================
// VERİ DOĞRULAMA ŞABLONLARI (ZOD)
// ==========================================
const subjectSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Ders adı zorunludur" }).min(1, "Ders adı boş olamaz"),
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable(),
    classId: z.string().optional().nullable()
  })
});

const topicSchema = z.object({
  body: z.object({
    subjectId: z.string().uuid("Geçersiz Ders ID"),
    title: z.string({ required_error: "Konu başlığı zorunludur" }).min(1, "Konu başlığı boş olamaz"),
    orderIndex: z.number().int().optional().default(0),
    weekLabel: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    specialNotes: z.string().optional().nullable()
  })
});

const progressSchema = z.object({
  body: z.object({
    topicId: z.string().uuid("Geçersiz Konu ID"),
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable(),
    classId: z.string().optional().nullable(),
    status: z.string({ required_error: "Durum bilgisi zorunludur" }).min(1, "Durum boş olamaz")
  })
});

// ==========================================
// ALT MODÜL: MÜFREDAT TAKİP (SINIF BAZLI)
// ==========================================

// 1. Yeni Ders Ekleme
router.post('/subject', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(subjectSchema), async (req, res, next) => {
  try {
    const { name, institutionId, classId } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Bu kuruma ders ekleme yetkiniz yok.' });
    }

    const subject = await prisma.curriculumSubject.create({ 
      data: { name, institutionId: targetInstitution, classId: classId || "GENEL" } 
    });
    res.json(subject);
  } catch (error) { next(error); }
});

// 2. Yeni Konu Ekleme
router.post('/topic', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(topicSchema), async (req, res, next) => {
  try {
    const { subjectId, title, orderIndex, weekLabel, startDate, endDate, specialNotes } = req.body;
    
    // Güvenlik Kalkanı: Bu dersin bağlı olduğu kurum, yöneticinin yetki alanında mı?
    const subject = await prisma.curriculumSubject.findUnique({ where: { id: subjectId } });
    if (!subject) return res.status(404).json({ error: 'İlgili ders bulunamadı.' });

    if (!await HierarchyService.assertOwnsInstitution(req.user, subject.institutionId)) {
      return res.status(403).json({ error: 'Bu derse konu ekleme yetkiniz yok.' });
    }

    const topic = await prisma.curriculumTopic.create({ 
      data: { 
        subjectId, title, orderIndex, weekLabel, specialNotes,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      } 
    });
    res.json(topic);
  } catch (error) { next(error); }
});

// 3. İlerleme (İşlenme Durumu) Kaydetme
router.post('/progress', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(progressSchema), async (req, res, next) => {
  try {
    const { topicId, institutionId, classId, status } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Yetki dışı müdahale engellendi.' });
    }

    const completedAt = status === 'ISLENDI' ? new Date() : null;
    const cId = classId || "GENEL";

    const progress = await prisma.topicProgress.upsert({
      where: { 
        topicId_institutionId_classId: { topicId, institutionId: targetInstitution, classId: cId } 
      },
      update: { status, completedAt },
      create: { topicId, institutionId: targetInstitution, classId: cId, status, completedAt }
    });
    res.json(progress);
  } catch (error) { next(error); }
});

// 4. SADECE SEÇİLEN SINIFIN DERSLERİNİ VE İŞLENME DURUMUNU GETİR
router.get('/:institutionId/:classId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { institutionId, classId } = req.params;
    
    // Hiyerarşi Kontrolü: Bu kurumdaki listeyi görmeye yetkisi var mı?
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun müfredatını görüntüleme yetkiniz yok.' });
    }

    const subjects = await prisma.curriculumSubject.findMany({
      where: { 
        institutionId,
        // Sadece seçili sınıfın VEYA Genel eklenmiş dersleri getir
        OR: [ { classId: classId }, { classId: "GENEL" } ]
      },
      include: {
        topics: {
          orderBy: { orderIndex: 'asc' },
          include: { 
            progresses: { 
              // Öğretmen sadece kendi sınıfının işleme durumunu görsün
              where: { institutionId, classId: classId } 
            } 
          }
        }
      }
    });
    res.json(subjects);
  } catch (error) { next(error); }
});

module.exports = router;