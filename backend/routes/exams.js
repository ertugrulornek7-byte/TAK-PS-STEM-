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
const preExamResultSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Talebe ID"),
    term: z.string().min(1, "Dönem zorunludur"),
    subject: z.string().min(1, "Ders zorunludur"),
    targetScore: z.number().optional().nullable(),
    practiceScores: z.any().optional().nullable() 
  })
});

const preExamSettingSchema = z.object({
  body: z.object({
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable(),
    term: z.string().min(1, "Dönem zorunludur"),
    subject: z.string().min(1, "Ders zorunludur"),
    practiceCount: z.number().int().min(1, "Deneme sayısı en az 1 olmalıdır")
  })
});

const schoolExamResultSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Talebe ID"),
    term: z.string().min(1, "Dönem zorunludur"),
    subject: z.string().min(1, "Ders zorunludur"),
    targetScore: z.number().optional().nullable(),
    actualScore: z.number().optional().nullable()
  })
});

const mockExamResultSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Talebe ID"),
    examType: z.string().min(1, "Sınav türü zorunludur"),
    examNumber: z.number().int().min(1, "Sınav numarası zorunludur"),
    turkce: z.number().optional().nullable(),
    sosyal: z.number().optional().nullable(),
    matematik: z.number().optional().nullable(),
    ingilizce: z.number().optional().nullable(),
    fen: z.number().optional().nullable(),
    din: z.number().optional().nullable(),
    score: z.number().optional().nullable()
  })
});

const mockExamSettingSchema = z.object({
  body: z.object({
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable(),
    examType: z.string().min(1, "Sınav türü zorunludur"),
    count: z.number().int().min(1, "Deneme sayısı en az 1 olmalıdır")
  })
});

// ==========================================
// ALT MODÜL: SINAVLAR (YÖY, OKUL, KDU, DENEME) (SAYFA 6, 7, 8)
// ==========================================

// --- Y.Ö.Y (YAZILI ÖNCESİ YAZILI) İŞLEMLERİ ---
router.post('/pre-exams/result', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(preExamResultSchema), async (req, res) => {
  try {
    const { studentId, term, subject, targetScore, practiceScores } = req.body;
    
    // Hiyerarşi Kontrolü: Bu talebeye not girme yetkisi var mı?
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Bu talebeye not girme yetkiniz yok.' });
    }

    const scoresString = JSON.stringify(practiceScores || []);

    const result = await prisma.preExamResult.upsert({
      where: { studentId_term_subject: { studentId, term, subject } },
      update: { targetScore, practiceScores: scoresString },
      create: { studentId, term, subject, targetScore, practiceScores: scoresString }
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: 'Sınav notları kaydedilemedi.' }); }
});

router.post('/pre-exams/settings', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(preExamSettingSchema), async (req, res) => {
  try {
    const { institutionId, term, subject, practiceCount } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Bu kurumun ayarlarını değiştirme yetkiniz yok.' });
    }

    const setting = await prisma.preExamSetting.upsert({
      where: { institutionId_term_subject: { institutionId: targetInstitution, term, subject } },
      update: { practiceCount },
      create: { institutionId: targetInstitution, term, subject, practiceCount }
    });
    res.json(setting);
  } catch (error) { res.status(500).json({ error: 'Sütun ayarı kaydedilemedi.' }); }
});

router.get('/pre-exams/:institutionId/:term', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res) => {
  try {
    const { institutionId, term } = req.params;
    
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun sınav verilerini görüntüleme yetkiniz yok.' });
    }

    const results = await prisma.preExamResult.findMany({ where: { student: { institutionId }, term: term } });
    const settings = await prisma.preExamSetting.findMany({ where: { institutionId, term } });
    res.json({ results, settings });
  } catch (error) { res.status(500).json({ error: 'Sınav verileri getirilemedi.' }); }
});

// --- GERÇEK OKUL YAZILI İŞLEMLERİ ---
router.get('/school-exams/:institutionId/:semester', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res) => {
  try {
    const { institutionId, semester } = req.params; 
    
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const results = await prisma.preExamResult.findMany({
      where: { student: { institutionId }, term: { startsWith: semester } }
    });
    res.json(results);
  } catch (error) { res.status(500).json({ error: 'Okul yazılı verileri getirilemedi.' }); }
});

router.post('/school-exams/result', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(schoolExamResultSchema), async (req, res) => {
  try {
    const { studentId, term, subject, targetScore, actualScore } = req.body;
    
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Bu talebeye not girme yetkiniz yok.' });
    }

    const result = await prisma.preExamResult.upsert({
      where: { studentId_term_subject: { studentId, term, subject } },
      update: { targetScore: targetScore, actualScore: actualScore },
      create: { studentId, term, subject, targetScore: targetScore, actualScore: actualScore, practiceScores: "[]" }
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: 'Okul notları kaydedilemedi.' }); }
});

// --- KDU VE DENEME SINAVLARI İŞLEMLERİ ---
router.post('/mock-exams/result', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(mockExamResultSchema), async (req, res) => {
  try {
    const { studentId, examType, examNumber, turkce, sosyal, matematik, ingilizce, fen, din, score } = req.body;
    
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Yetkisiz işlem.' });
    }

    const result = await prisma.mockExamResult.upsert({
      where: { studentId_examType_examNumber: { studentId, examType, examNumber } },
      update: { turkce, sosyal, matematik, ingilizce, fen, din, score },
      create: { studentId, examType, examNumber, turkce, sosyal, matematik, ingilizce, fen, din, score }
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: 'Sınav sonuçları kaydedilemedi.' }); }
});

router.post('/mock-exams/settings', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(mockExamSettingSchema), async (req, res) => {
  try {
    const { institutionId, examType, count } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Yetkisiz işlem.' });
    }

    const setting = await prisma.mockExamSetting.upsert({
      where: { institutionId_examType: { institutionId: targetInstitution, examType } },
      update: { count },
      create: { institutionId: targetInstitution, examType, count }
    });
    res.json(setting);
  } catch (error) { res.status(500).json({ error: 'Sınav ayarı kaydedilemedi.' }); }
});

router.get('/mock-exams/:institutionId/:examType/:examNumber', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res) => {
  try {
    const { institutionId, examType, examNumber } = req.params;
    
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const results = await prisma.mockExamResult.findMany({
      where: { student: { institutionId }, examType: examType, examNumber: parseInt(examNumber) }
    });
    const setting = await prisma.mockExamSetting.findUnique({
      where: { institutionId_examType: { institutionId, examType } }
    });
    res.json({ results, count: setting ? setting.count : 1 });
  } catch (error) { res.status(500).json({ error: 'Sınav verileri getirilemedi.' }); }
});

module.exports = router;