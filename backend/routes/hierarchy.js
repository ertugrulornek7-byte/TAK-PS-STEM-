const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. Grupları Getir (AKILLI VE YETKİ KONTROLLÜ)
router.get('/groups/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;
    const { userId, isAdmin } = req.query;

    let classes = await prisma.class.findMany({ where: { institutionId } });
    let levels = await prisma.levelGroup.findMany({ where: { institutionId } });

    // Eğer normal personelse, SADECE sorumlu olduğu sınıfları ver!
    if (userId && isAdmin !== 'true') {
      const user = await prisma.user.findUnique({ 
        where: { id: userId }, 
        include: { managedClasses: true } 
      });
      const myClassIds = user?.managedClasses.map(c => c.id) || [];
      classes = classes.filter(c => myClassIds.includes(c.id));
    }

    res.json({ classes, levels });
  } catch (error) { 
    console.error("Gruplar çekilirken hata:", error);
    res.status(500).json({ error: 'Hata' }); 
  }
});

// 🔥 2. KURUMA GÖRE FİLTRELENMİŞ PERSONEL LİSTESİ (SORUNUN ÇÖZÜLDÜĞÜ YER)
router.get('/personnel/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;
    console.log(`📢 [DİKKAT] ${institutionId} ID'li kurum için personel isteği geldi!`);
    
    // SADECE isteği yapılan kuruma (institutionId) ait personelleri getir
    const kurumPersonelleri = await prisma.user.findMany({
      where: { institutionId: institutionId }, 
      include: { managedClasses: true, managedLevels: true }
    });
    
    console.log(`✅ Bu kuruma ait toplam ${kurumPersonelleri.length} personel gönderiliyor!`);
    res.json(kurumPersonelleri);
  } catch (error) { 
    console.error("Personel çekilirken hata:", error);
    res.status(500).json({ error: 'Hata' }); 
  }
});

// 3. SINIF EKLEME
router.post('/class', async (req, res) => {
  try {
    const { name, institutionId, level } = req.body;
    const newClass = await prisma.class.create({ 
      data: { 
        name, 
        level: level || "Bilinmiyor", // Prisma şemasındaki level zorunluluğu için eklendi
        institutionId: institutionId 
      } 
    });
    res.json(newClass);
  } catch (error) { 
    console.error("Sınıf eklenirken hata:", error);
    res.status(500).json({ error: 'Hata' }); 
  }
});

// 4. SEVİYE GRUBU EKLEME
router.post('/level', async (req, res) => {
  try {
    const { name, institutionId } = req.body;
    const newLevel = await prisma.levelGroup.create({ 
      data: { 
        name, 
        institutionId: institutionId 
      } 
    });
    res.json(newLevel);
  } catch (error) { 
    console.error("Seviye eklenirken hata:", error);
    res.status(500).json({ error: 'Hata' }); 
  }
});
// 5. PERSONEL GÖREVLENDİRME (SAYFA 12 KESİN ÇÖZÜM)
router.post('/assign-personnel', async (req, res) => {
  try {
    const { userId, classIds, levelIds } = req.body;
    console.log(`📡 GÖREVLENDİRME İSTEĞİ: User=${userId}`, { classIds, levelIds });

    // 🔥 DÜZELTME: Gelen verinin [ 'id1', 'id2' ] mi yoksa [ {id:'id1'} ] mi olduğunu anlayan Akıllı Formatlayıcı
    const formatIds = (arr) => {
      if (!arr || !Array.isArray(arr)) return [];
      return arr.map(item => typeof item === 'object' ? { id: item.id } : { id: item }).filter(i => i.id);
    };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        managedClasses: { set: formatIds(classIds) },
        managedLevels: { set: formatIds(levelIds) }
      }
    });
    res.json({ message: 'Görevlendirme başarıyla kaydedildi!', updatedUser });
  } catch (error) { 
    console.error("Görevlendirme Kayıt Hatası:", error);
    res.status(500).json({ error: 'Personel ataması yapılamadı.' }); 
  }
});

module.exports = router;