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
const topicSchema = z.object({
  body: z.object({
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable(),
    subject: z.string().min(1, "Ders adı zorunludur"),
    title: z.string().min(1, "Konu başlığı zorunludur"),
    normalQuestionCount: z.number().int().optional().default(0),
    yeniNesilCount: z.number().int().optional().default(0),
    orderIndex: z.number().int().optional().default(0),
    classId: z.string().optional().nullable()
  })
});

const resultSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Talebe ID"),
    topicId: z.string().uuid("Geçersiz Konu ID"),
    normalDogru: z.number().int().optional().nullable(),
    normalYanlis: z.number().int().optional().nullable(),
    yeniNesilDogru: z.number().int().optional().nullable(),
    yeniNesilYanlis: z.number().int().optional().nullable()
  })
});

// ==========================================
// ALT MODÜL: SORU BANKASI TAKİP
// ==========================================

// 1. YENİ KONU EKLEME (SINIF BAZLI)
router.post('/topic', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(topicSchema), async (req, res, next) => {
  try {
    const { institutionId, subject, title, normalQuestionCount, yeniNesilCount, orderIndex, classId } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    // Hiyerarşi Kontrolü: Bu kuruma konu ekleme yetkisi var mı?
    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Bu kuruma soru bankası konusu ekleme yetkiniz yok.' });
    }

    const topic = await prisma.testBookTopic.create({
      data: { 
        institutionId: targetInstitution, 
        subject, 
        title, 
        normalQuestionCount, 
        yeniNesilCount, 
        orderIndex, 
        classId: classId || "GENEL" 
      }
    });
    res.json(topic);
  } catch (error) { 
    next(error); 
  }
});

// 2. SONUÇ KAYDETME
router.post('/result', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(resultSchema), async (req, res, next) => {
  try {
    const { studentId, topicId, normalDogru, normalYanlis, yeniNesilDogru, yeniNesilYanlis } = req.body;
    
    // Hiyerarşi Kontrolü: Bu öğrenciye not girme yetkisi var mı?
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Bu öğrenciye soru bankası sonucu girme yetkiniz yok.' });
    }

    const result = await prisma.testBookResult.upsert({
      where: { studentId_topicId: { studentId, topicId } },
      update: { normalDogru, normalYanlis, yeniNesilDogru, yeniNesilYanlis },
      create: { studentId, topicId, normalDogru, normalYanlis, yeniNesilDogru, yeniNesilYanlis }
    });
    res.json(result);
  } catch (error) { 
    next(error); 
  }
});

// 3. TESTLERİ ÇEKME (SINIF BAZLI)
router.get('/:institutionId/:subject/:classId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { institutionId, subject, classId } = req.params;

    // Hiyerarşi Kontrolü: Bu kurumun soru bankası verilerini görme yetkisi var mı?
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun soru bankası verilerini görüntüleme yetkiniz yok.' });
    }

    const cId = classId && classId !== 'undefined' ? classId : "GENEL";

    const topics = await prisma.testBookTopic.findMany({
      where: { 
        institutionId, 
        subject,
        OR: [ { classId: cId }, { classId: "GENEL" } ]
      },
      orderBy: { orderIndex: 'asc' },
      include: { results: true }
    });
    res.json(topics);
  } catch (error) { 
    next(error); 
  }
});

module.exports = router;