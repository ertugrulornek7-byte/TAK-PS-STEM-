const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);
const prisma = new PrismaClient();

// YENİ KONU EKLEME (SINIF BAZLI)
router.post('/topic', async (req, res) => {
  try {
    const { institutionId, subject, title, normalQuestionCount, yeniNesilCount, orderIndex, classId } = req.body;
    const topic = await prisma.testBookTopic.create({
      data: { 
        institutionId, subject, title, normalQuestionCount, yeniNesilCount, orderIndex, 
        classId: classId || "GENEL" 
      }
    });
    res.json(topic);
  } catch (error) { 
    res.status(500).json({ error: 'Konu eklenemedi.' }); 
  }
});

// SONUÇ KAYDETME
router.post('/result', async (req, res) => {
  try {
    const { studentId, topicId, normalDogru, normalYanlis, yeniNesilDogru, yeniNesilYanlis } = req.body;
    const result = await prisma.testBookResult.upsert({
      where: { studentId_topicId: { studentId, topicId } },
      update: { normalDogru, normalYanlis, yeniNesilDogru, yeniNesilYanlis },
      create: { studentId, topicId, normalDogru, normalYanlis, yeniNesilDogru, yeniNesilYanlis }
    });
    res.json(result);
  } catch (error) { 
    res.status(500).json({ error: 'Sonuç kaydedilemedi.' }); 
  }
});

// TESTLERİ ÇEKME (SINIF BAZLI)
router.get('/:institutionId/:subject/:classId', async (req, res) => {
  try {
    const { institutionId, subject, classId } = req.params;
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
    res.status(500).json({ error: 'Veriler getirilemedi.' }); 
  }
});

module.exports = router;