const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 🔥 GÜVENLİK KALKANLARI VE MERKEZİ BEYİN İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu satır sayesinde bu dosyadaki TÜM rotalar KİMLİK KONTROLÜNDEN (Token) geçmek zorunda!
router.use(authenticate);

// ==========================================
// 1. Grupları Getir (AKILLI VE YETKİ KONTROLLÜ)
// ==========================================
router.get('/groups/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;

    let classes = await prisma.class.findMany({ where: { institutionId } });
    let levels = await prisma.levelGroup.findMany({ where: { institutionId } });

    // 🎯 ESKİ GÜVENSİZ KONTROL (isAdmin) GİTTİ! Artık kimliği direkt sunucudan (req.user) doğruluyoruz.
    if (req.user.roleLevel === 'PERSONEL') {
      const myClassIds = req.user.managedClasses?.map(c => c.id) || [];
      classes = classes.filter(c => myClassIds.includes(c.id));
    }

    res.json({ classes, levels });
  } catch (error) { 
    console.error("Gruplar çekilirken hata:", error);
    res.status(500).json({ error: 'Gruplar getirilemedi.' }); 
  }
});

// ==========================================
// 2. KİŞİNİN MAKAMINA GÖRE FİLTRELENMİŞ PERSONEL LİSTESİ
// ==========================================
router.get('/personnel/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;
    
    // 🎯 SADECE KENDİ YETKİSİ OLANLARI GÖREBİLİR! Merkezi Makam Servisinden filtreyi alıyoruz
    const whereFilter = HierarchyService.getUserFilter(req.user);
    
    // İstenen kurumu da filtreye dahil ediyoruz
    if (institutionId) {
      whereFilter.institutionId = institutionId;
    }

    const kurumPersonelleri = await prisma.user.findMany({
      where: whereFilter,
    });
    
    res.json(kurumPersonelleri);
  } catch (error) { 
    console.error("Personel çekilirken hata:", error);
    res.status(500).json({ error: 'Personeller getirilemedi.' }); 
  }
});

// ==========================================
// 3. SINIF EKLEME (Personel Sınıf Ekleyemez!)
// ==========================================
router.post('/class', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { name, institutionId, level } = req.body;
    const newClass = await prisma.class.create({ 
      data: { 
        name, 
        level: level || "Bilinmiyor", 
        institutionId 
      } 
    });

    // 📝 AUDIT LOG YAZILIYOR
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'CREATE', targetType: 'Class', targetId: newClass.id, after: JSON.stringify(newClass) }
    });

    res.json(newClass);
  } catch (error) { 
    console.error("Sınıf eklenirken hata:", error);
    res.status(500).json({ error: 'Sınıf eklenemedi.' }); 
  }
});

// ==========================================
// 4. SEVİYE GRUBU EKLEME (Personel Seviye Ekleyemez!)
// ==========================================
router.post('/level', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { name, institutionId } = req.body;
    const newLevel = await prisma.levelGroup.create({ 
      data: { 
        name, 
        institutionId 
      } 
    });

    // 📝 AUDIT LOG YAZILIYOR
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'CREATE', targetType: 'LevelGroup', targetId: newLevel.id, after: JSON.stringify(newLevel) }
    });

    res.json(newLevel);
  } catch (error) { 
    console.error("Seviye eklenirken hata:", error);
    res.status(500).json({ error: 'Seviye eklenemedi.' }); 
  }
});

// ==========================================
// 5. PERSONEL GÖREVLENDİRME (Sayfa 12 - Makam Korumalı ve Loglu)
// ==========================================
router.post('/assign-personnel', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { userId, classIds, institutionId } = req.body;

    // Sadece üst makamlar başka kuruma atama yapabilir, Kurum yetkilisi sadece kendi kurumuna
    const targetInstitutionId = institutionId || req.user.institutionId;

    if (req.user.roleLevel === 'KURUM' && targetInstitutionId !== req.user.institutionId) {
      return res.status(403).json({ error: 'Sadece kendi kurumunuzda atama yapabilirsiniz.' });
    }

    // Personeli güncelle (classIds'leri veritabanına JSON veya String Array olarak kaydediyoruz)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        managedClassIds: classIds // Prisma şemanda bu alanı (String[]) eklemiş olman gerekir
      }
    });

    // AUDIT LOG
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'ASSIGN_ROLES', targetType: 'User', targetId: userId, after: JSON.stringify(classIds) }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Yetki atama hatası:", error);
    res.status(500).json({ error: 'Personel yetkileri atanamadı.' });
  }
});

// ==========================================
// 6. TÜM KURUMLARI LİSTELE (Eksik Köprü)
// ==========================================
router.get('/institutions', authorize(['SISTEM', 'BOLGE', 'MINTIKA']), async (req, res) => {
  try {
    // Sadece yetkili olanların kurumları görmesini sağla
    const institutions = await prisma.institution.findMany({
      include: { district: true }
    });
    res.json(institutions);
  } catch (error) {
    console.error("Kurumlar listelenemedi:", error);
    res.status(500).json({ error: 'Kurumlar getirilemedi.' });
  }
});

module.exports = router;