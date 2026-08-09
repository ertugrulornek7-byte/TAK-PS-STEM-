const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu satır sayesinde bu dosyadaki TÜM rotalar KİMLİK KONTROLÜNDEN geçer!
router.use(authenticate);

// ==========================================
// 1. Grupları Getir (AKILLI VE YETKİ KONTROLLÜ)
// ==========================================
router.get('/groups/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;

    // 🔥 DÜZELTME: Yanlış yerleştirilen kalkan buradan kaldırıldı. Sadece listeleme işlemi yapıyoruz.
    let classes = await prisma.class.findMany({ where: { institutionId } });
    let levels = await prisma.levelGroup.findMany({ where: { institutionId } });

    if (req.user.roleLevel === 'PERSONEL') {
      const myClassIds = req.user.managedClassIds || [];
      classes = classes.filter(c => myClassIds.includes(c.id));
    }

    res.json({ classes, levels });
  } catch (error) { 
    res.status(500).json({ error: 'Gruplar getirilemedi.' }); 
  }
});

// ==========================================
// 2. KİŞİNİN MAKAMINA GÖRE FİLTRELENMİŞ PERSONEL LİSTESİ
// ==========================================
router.get('/personnel/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;
    
    let whereFilter = HierarchyService.getUserFilter(req.user);
    
    // KESİŞİM VAR
    if (institutionId) {
      whereFilter = { AND: [whereFilter, { institutionId }] };
    }

    const kurumPersonelleri = await prisma.user.findMany({
      where: whereFilter,
    });
    
    res.json(kurumPersonelleri);
  } catch (error) { 
    res.status(500).json({ error: 'Personeller getirilemedi.' }); 
  }
});

// ==========================================
// 3. SINIF EKLEME
// ==========================================
router.post('/class', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    // 🔥 KALKAN BURAYA EKLENDİ: Başka kurumun verisine veri yazılmasını engeller
    if (!HierarchyService.assertOwnsInstitution(req.user, req.body.institutionId)) {
      return res.status(403).json({ error: 'Bu kuruma sınıf ekleme yetkiniz yok.' });
    }

    const { name, institutionId, level } = req.body;
    const newClass = await prisma.class.create({ 
      data: { name, level: level || "Bilinmiyor", institutionId } 
    });

    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'CREATE', targetType: 'Class', targetId: newClass.id, after: JSON.stringify(newClass) }
    });

    res.json(newClass);
  } catch (error) { 
    res.status(500).json({ error: 'Sınıf eklenemedi.' }); 
  }
});

// ==========================================
// 4. SEVİYE GRUBU EKLEME
// ==========================================
router.post('/level', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    // 🔥 KALKAN BURAYA DA EKLENDİ
    if (!HierarchyService.assertOwnsInstitution(req.user, req.body.institutionId)) {
      return res.status(403).json({ error: 'Bu kuruma seviye ekleme yetkiniz yok.' });
    }

    const { name, institutionId } = req.body;
    const newLevel = await prisma.levelGroup.create({ data: { name, institutionId } });

    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'CREATE', targetType: 'LevelGroup', targetId: newLevel.id, after: JSON.stringify(newLevel) }
    });

    res.json(newLevel);
  } catch (error) { 
    res.status(500).json({ error: 'Seviye eklenemedi.' }); 
  }
});

// ==========================================
// 5. PERSONEL GÖREVLENDİRME 
// ==========================================
router.post('/assign-personnel', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { userId, classIds, institutionId } = req.body;

    const targetInstitutionId = institutionId || req.user.institutionId;
    if (req.user.roleLevel === 'KURUM' && targetInstitutionId !== req.user.institutionId) {
      return res.status(403).json({ error: 'Sadece kendi kurumunuzda atama yapabilirsiniz.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { managedClassIds: classIds }
    });

    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'ASSIGN_ROLES', targetType: 'User', targetId: userId, after: JSON.stringify(classIds) }
    });

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Personel yetkileri atanamadı.' });
  }
});

// ==========================================
// 6. TÜM KURUMLARI LİSTELE (Makam Sınırlandırmalı)
// ==========================================
router.get('/institutions', authorize(['SISTEM', 'BOLGE', 'MINTIKA']), async (req, res) => {
  try {
    const whereFilter = HierarchyService.getInstitutionFilter(req.user);
    const institutions = await prisma.institution.findMany({
      where: whereFilter,
      include: { district: true }
    });
    res.json(institutions);
  } catch (error) {
    res.status(500).json({ error: 'Kurumlar getirilemedi.' });
  }
});

module.exports = router;