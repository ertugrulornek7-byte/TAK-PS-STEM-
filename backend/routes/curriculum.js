const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: MÜFREDAT TAKİP (SINIF BAZLI)
// ==========================================

router.post('/subject', async (req, res) => {
  try {
    const { name, institutionId, classGroupId } = req.body;
    const subject = await prisma.curriculumSubject.create({ 
      data: { name, institutionId, classGroupId: classGroupId || "GENEL" } 
    });
    res.json(subject);
  } catch (error) { res.status(500).json({ error: 'Ders eklenemedi.' }); }
});

router.post('/topic', async (req, res) => {
  try {
    const { subjectId, title, orderIndex, weekLabel, startDate, endDate, specialNotes } = req.body;
    const topic = await prisma.curriculumTopic.create({ 
      data: { 
        subjectId, title, orderIndex, weekLabel, specialNotes,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      } 
    });
    res.json(topic);
  } catch (error) { res.status(500).json({ error: 'Konu eklenemedi.' }); }
});

router.post('/progress', async (req, res) => {
  try {
    const { topicId, institutionId, classGroupId, status } = req.body;
    const completedAt = status === 'ISLENDI' ? new Date() : null;
    const cId = classGroupId || "GENEL";

    const progress = await prisma.topicProgress.upsert({
      where: { 
        topicId_institutionId_classGroupId: { topicId, institutionId, classGroupId: cId } 
      },
      update: { status, completedAt },
      create: { topicId, institutionId, classGroupId: cId, status, completedAt }
    });
    res.json(progress);
  } catch (error) { res.status(500).json({ error: 'İlerleme kaydedilemedi.' }); }
});

// SADECE SEÇİLEN SINIFIN DERSLERİNİ VE İŞLENME DURUMUNU GETİR
router.get('/:institutionId/:classGroupId', async (req, res) => {
  try {
    const { institutionId, classGroupId } = req.params;
    
    const subjects = await prisma.curriculumSubject.findMany({
      where: { 
        institutionId,
        // Sadece seçili sınıfın VEYA Genel eklenmiş dersleri getir
        OR: [ { classGroupId: classGroupId }, { classGroupId: "GENEL" } ]
      },
      include: {
        topics: {
          orderBy: { orderIndex: 'asc' },
          include: { 
            progresses: { 
              // Öğretmen sadece kendi sınıfının işleme durumunu görsün
              where: { institutionId, classGroupId: classGroupId } 
            } 
          }
        }
      }
    });
    res.json(subjects);
  } catch (error) { res.status(500).json({ error: 'Müfredat getirilemedi.' }); }
});

module.exports = router;