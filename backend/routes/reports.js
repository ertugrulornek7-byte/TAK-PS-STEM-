const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: KARNE VE RAPORLAMA (SAYFA 11)
// ==========================================

router.get('/report/:studentId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { studentId } = req.params;

    // Hiyerarşi Kontrolü: Yöneticinin bu talebenin karnesini görme yetkisi var mı?
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Bu talebenin karne verilerini görüntüleme yetkiniz yok.' });
    }

    const preExams = await prisma.preExamResult.findMany({ where: { studentId } });
    const mockExams = await prisma.mockExamResult.findMany({ where: { studentId } });
    const testBooks = await prisma.testBookResult.findMany({ 
      where: { studentId },
      include: { topic: true } 
    });
    
    res.json({ preExams, mockExams, testBooks });
  } catch (error) { 
    // Hata yakalama (Sentry) mekanizmasına gönder
    next(error); 
  }
});

module.exports = router;