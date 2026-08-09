const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: SINAVLAR (YÖY, OKUL, KDU, DENEME) (SAYFA 6, 7, 8)
// ==========================================

// --- Y.Ö.Y (YAZILI ÖNCESİ YAZILI) İŞLEMLERİ ---
router.post('/pre-exams/result', async (req, res) => {
  try {
    const { studentId, term, subject, targetScore, practiceScores } = req.body;
    const scoresString = JSON.stringify(practiceScores || []);

    const result = await prisma.preExamResult.upsert({
      where: { studentId_term_subject: { studentId, term, subject } },
      update: { targetScore, practiceScores: scoresString },
      create: { studentId, term, subject, targetScore, practiceScores: scoresString }
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: 'Sınav notları kaydedilemedi.' }); }
});

router.post('/pre-exams/settings', async (req, res) => {
  try {
    const { institutionId, term, subject, practiceCount } = req.body;
    const setting = await prisma.preExamSetting.upsert({
      where: { institutionId_term_subject: { institutionId, term, subject } },
      update: { practiceCount },
      create: { institutionId, term, subject, practiceCount }
    });
    res.json(setting);
  } catch (error) { res.status(500).json({ error: 'Sütun ayarı kaydedilemedi.' }); }
});

router.get('/pre-exams/:institutionId/:term', async (req, res) => {
  try {
    const { institutionId, term } = req.params;
    const results = await prisma.preExamResult.findMany({ where: { student: { institutionId }, term: term } });
    const settings = await prisma.preExamSetting.findMany({ where: { institutionId, term } });
    res.json({ results, settings });
  } catch (error) { res.status(500).json({ error: 'Sınav verileri getirilemedi.' }); }
});

// --- GERÇEK OKUL YAZILI İŞLEMLERİ ---
router.get('/school-exams/:institutionId/:semester', async (req, res) => {
  try {
    const { institutionId, semester } = req.params; 
    const results = await prisma.preExamResult.findMany({
      where: { student: { institutionId }, term: { startsWith: semester } }
    });
    res.json(results);
  } catch (error) { res.status(500).json({ error: 'Okul yazılı verileri getirilemedi.' }); }
});

router.post('/school-exams/result', async (req, res) => {
  try {
    const { studentId, term, subject, targetScore, actualScore } = req.body;
    const result = await prisma.preExamResult.upsert({
      where: { studentId_term_subject: { studentId, term, subject } },
      update: { targetScore: targetScore, actualScore: actualScore },
      create: { studentId, term, subject, targetScore: targetScore, actualScore: actualScore, practiceScores: "[]" }
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: 'Okul notları kaydedilemedi.' }); }
});

// --- KDU VE DENEME SINAVLARI İŞLEMLERİ ---
router.post('/mock-exams/result', async (req, res) => {
  try {
    const { studentId, examType, examNumber, turkce, sosyal, matematik, ingilizce, fen, din, score } = req.body;
    const result = await prisma.mockExamResult.upsert({
      where: { studentId_examType_examNumber: { studentId, examType, examNumber } },
      update: { turkce, sosyal, matematik, ingilizce, fen, din, score },
      create: { studentId, examType, examNumber, turkce, sosyal, matematik, ingilizce, fen, din, score }
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: 'Sınav sonuçları kaydedilemedi.' }); }
});

router.post('/mock-exams/settings', async (req, res) => {
  try {
    const { institutionId, examType, count } = req.body;
    const setting = await prisma.mockExamSetting.upsert({
      where: { institutionId_examType: { institutionId, examType } },
      update: { count },
      create: { institutionId, examType, count }
    });
    res.json(setting);
  } catch (error) { res.status(500).json({ error: 'Sınav ayarı kaydedilemedi.' }); }
});

router.get('/mock-exams/:institutionId/:examType/:examNumber', async (req, res) => {
  try {
    const { institutionId, examType, examNumber } = req.params;
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