// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. ORGANİZASYON ŞEMASINI GETİR (Bölge -> Mıntıka -> Kurum)
router.get('/organization', async (req, res) => {
  try {
    const tree = await prisma.region.findMany({
      include: {
        manager: { select: { fullName: true, roles: true } },
        districts: {
          include: {
            manager: { select: { fullName: true, roles: true } },
            institutions: {
              include: {
                manager: { select: { fullName: true, roles: true } },
                users: { select: { id: true, fullName: true, roles: true } }
              }
            }
          }
        }
      }
    });
    res.json(tree);
  } catch (error) { 
    res.status(500).json({ error: 'Organizasyon şeması çekilemedi.' }); 
  }
});

// 2. TÜM PERSONELİ GETİR
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        institution: true,
        managedRegion: true,
        managedDistrict: true,
        managedInstitution: true
      }
    });
    res.json(users);
  } catch (error) { 
    res.status(500).json({ error: 'Personel listesi çekilemedi.' }); 
  }
});

// 3. PERSONEL YETKİSİ VE GÖREV YERİ GÜNCELLE
router.post('/assign-role', async (req, res) => {
  const { userId, newRole, regionId, districtId, institutionId } = req.body;
  
  try {
    // 1. Personelin rolünü güncelle
    await prisma.user.update({
      where: { id: userId },
      data: { roles: [newRole] }
    });

    // 2. Eğer BOLGE_EM yapıldıysa, Bölge tablosunda managerId'yi güncelle
    if (newRole === 'BOLGE_EM' && regionId) {
      await prisma.region.update({ where: { id: regionId }, data: { managerId: userId } });
    }
    // 3. Eğer MINTIKA_EM yapıldıysa, Mıntıka tablosunda managerId'yi güncelle
    else if (newRole === 'MINTIKA_EM' && districtId) {
      await prisma.district.update({ where: { id: districtId }, data: { managerId: userId } });
    }
    // 4. Eğer KURUM_EM yapıldıysa, Kurum tablosunda managerId'yi güncelle
    else if (newRole === 'KURUM_EM' && institutionId) {
      await prisma.institution.update({ where: { id: institutionId }, data: { managerId: userId } });
    }

    // Personelin standart kurum bağlantısını da güncelle
    if (institutionId) {
      await prisma.user.update({ where: { id: userId }, data: { institutionId: institutionId } });
    }

    res.json({ message: 'Yetki ve görev başarıyla atandı!' });
  } catch (error) { 
    res.status(500).json({ error: 'Atama işlemi başarısız.' }); 
  }
});
// --- BİRİM EKLEME VE SİLME ROTALARI ---
router.post('/region', async (req, res) => {
  try {
    const region = await prisma.region.create({ data: { name: req.body.name } });
    res.json(region);
  } catch (error) { res.status(500).json({ error: 'Bölge eklenemedi.' }); }
});

router.post('/district', async (req, res) => {
  try {
    const district = await prisma.district.create({ data: { name: req.body.name, regionId: req.body.regionId } });
    res.json(district);
  } catch (error) { res.status(500).json({ error: 'Mıntıka eklenemedi.' }); }
});

router.post('/institution', async (req, res) => {
  try {
    const inst = await prisma.institution.create({ data: { name: req.body.name, districtId: req.body.districtId } });
    res.json(inst);
  } catch (error) { res.status(500).json({ error: 'Kurum eklenemedi.' }); }
});

router.delete('/unit/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type === 'region') await prisma.region.delete({ where: { id } });
    if (type === 'district') await prisma.district.delete({ where: { id } });
    if (type === 'institution') await prisma.institution.delete({ where: { id } });
    res.json({ message: 'Başarıyla silindi.' });
  } catch (error) { res.status(500).json({ error: 'Silme işlemi başarısız. İçinde personel veya alt birim olabilir.' }); }
});
module.exports = router;