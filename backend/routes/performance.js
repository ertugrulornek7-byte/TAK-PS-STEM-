const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: DERSHANE PERFORMANS (SAYFA 4)
// ==========================================

router.post('/performance', async (req, res) => {
  try {
    const { studentId, weekStartDate, subjectId, score } = req.body;
    const targetDate = new Date(weekStartDate);
    targetDate.setUTCHours(0,0,0,0);
    const bugun = new Date();
    bugun.setUTCHours(0,0,0,0);
    
    if (targetDate > bugun) return res.status(400).json({ error: 'Gelecek haftalar için not giremezsiniz!' });

    const grade = await prisma.performanceGrade.upsert({
      where: { studentId_weekStartDate_subjectId: { studentId, weekStartDate: targetDate, subjectId } },
      update: { score },
      create: { studentId, weekStartDate: targetDate, subjectId, score }
    });
    res.json(grade);
  } catch (error) { res.status(500).json({ error: 'Not kaydedilemedi.' }); }
});

router.post('/performance/settings', async (req, res) => {
  try {
    const { institutionId, weekStartDate, subjectId, isCancelled } = req.body;
    const targetDate = new Date(weekStartDate);
    targetDate.setUTCHours(0,0,0,0);

    const setting = await prisma.weeklyClassSetting.upsert({
      where: { institutionId_weekStartDate_subjectId: { institutionId, weekStartDate: targetDate, subjectId } },
      update: { isCancelled },
      create: { institutionId, weekStartDate: targetDate, subjectId, isCancelled }
    });

    if (isCancelled) {
      await prisma.performanceGrade.deleteMany({
        where: { student: { institutionId }, weekStartDate: targetDate, subjectId }
      });
    }
    res.json(setting);
  } catch (error) { res.status(500).json({ error: 'Ders ayarı kaydedilemedi.' }); }
});

router.get('/performance/:institutionId/:weekStartDate', async (req, res) => {
  try {
    const { institutionId, weekStartDate } = req.params;
    const targetDate = new Date(weekStartDate);
    targetDate.setUTCHours(0,0,0,0);

    const grades = await prisma.performanceGrade.findMany({ where: { student: { institutionId }, weekStartDate: targetDate } });
    const settings = await prisma.weeklyClassSetting.findMany({ where: { institutionId, weekStartDate: targetDate } });

    res.json({ grades, settings });
  } catch (error) { res.status(500).json({ error: 'Haftalık veriler getirilemedi.' }); }
});

module.exports = router;