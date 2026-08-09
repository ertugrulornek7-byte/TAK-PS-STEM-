const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);

// ==========================================
// ALT MODÜL: KARNE VE RAPORLAMA (SAYFA 11)
// ==========================================

router.get('/report/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const preExams = await prisma.preExamResult.findMany({ where: { studentId } });
    const mockExams = await prisma.mockExamResult.findMany({ where: { studentId } });
    const testBooks = await prisma.testBookResult.findMany({ 
      where: { studentId },
      include: { topic: true } 
    });
    res.json({ preExams, mockExams, testBooks });
  } catch (error) { res.status(500).json({ error: 'Karne verisi getirilemedi.' }); }
});

module.exports = router;