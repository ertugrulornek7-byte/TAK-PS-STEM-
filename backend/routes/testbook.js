const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// YENİ KONU EKLEME (SINIF BAZLI)
router.post('/topic', async (req, res) => {
  try {
    const { institutionId, subject, title, normalQuestionCount, yeniNesilCount, orderIndex, classGroupId } = req.body;
    const topic = await prisma.testBookTopic.create({
      data: { 
        institutionId, subject, title, normalQuestionCount, yeniNesilCount, orderIndex, 
        classGroupId: classGroupId || "GENEL" 
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
router.get('/:institutionId/:subject/:classGroupId', async (req, res) => {
  try {
    const { institutionId, subject, classGroupId } = req.params;
    const cId = classGroupId && classGroupId !== 'undefined' ? classGroupId : "GENEL";

    const topics = await prisma.testBookTopic.findMany({
      where: { 
        institutionId, 
        subject,
        OR: [ { classGroupId: cId }, { classGroupId: "GENEL" } ]
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