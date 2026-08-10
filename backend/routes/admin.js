const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

// 🔥 GÜVENLİK KALKANLARI
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);
// 🔥 DÜZELTME: router.use(authorize(['SISTEM'])) TÜM dosyayı SISTEM'e kilitliyordu.
// Ama /organization ve /users, içindeki BOLGE/MINTIKA/KURUM filtrelerinden ve
// AdminPanel.vue'daki isBolgeEM/isMintikaEM değişkenlerinden belli ki bu roller
// için de tasarlanmıştı — blanket kilit onları sessizce 403'e düşürüyordu.
// Artık her rotaya kendi uygun yetkisi ayrı ayrı veriliyor.

// =====================================
// 1. KİMLİĞE GÖRE ORGANİZASYON LİSTELEME
// =====================================
router.get('/organization', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  const { userId } = req.query;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { managedRegion: true, managedDistrict: true, institution: { include: { district: true } } }
    });
    const role = user.roleLevel; // Yeni şemaya göre roleLevel kullanıyoruz

    let regionFilter = {};
    let districtFilter = {};
    let institutionFilter = {};

    // YETKİ FİLTRELERİ
    if (role === 'BOLGE' && user.managedRegion) {
      regionFilter = { id: user.managedRegion.id };
    } else if (role === 'MINTIKA' && user.managedDistrict) {
      regionFilter = { id: user.managedDistrict.regionId };
      districtFilter = { id: user.managedDistrict.id };
    } else if (role === 'KURUM' && user.institution) {
      // 🔥 KURUM SADECE KENDİ KURUMUNUN HİYERARŞİSİNİ GÖREBİLİR!
      regionFilter = { id: user.institution.district.regionId };
      districtFilter = { id: user.institution.districtId };
      institutionFilter = { id: user.institutionId };
    }

    const tree = await prisma.region.findMany({
      where: regionFilter,
      include: {
        manager: { select: { fullName: true, roleLevel: true } },
        districts: {
          where: districtFilter,
          include: {
            manager: { select: { fullName: true, roleLevel: true } },
            institutions: {
              where: institutionFilter,
              include: {
                manager: { select: { fullName: true, roleLevel: true } },
                users: { select: { id: true, fullName: true, roleLevel: true } }
              }
            }
          }
        }
      }
    });
    res.json(tree);
  } catch (error) { res.status(500).json({ error: 'Şema çekilemedi.' }); }
});

// =====================================
// 2. KİMLİĞE GÖRE PERSONEL LİSTELEME
// =====================================
router.get('/users', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  const { userId } = req.query;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { managedRegion: true, managedDistrict: true }
    });
    const role = user.roleLevel; // Yeni şema

    let userFilter = {};
    if (role === 'BOLGE' && user.managedRegion) {
      userFilter = { district: { regionId: user.managedRegion.id } };
    } else if (role === 'MINTIKA' && user.managedDistrict) {
      userFilter = { districtId: user.managedDistrict.id };
    } else if (role === 'KURUM') {
      // 🔥 KURUM SADECE KENDİ KURUMUNDAKİ PERSONELİ GÖREBİLİR!
      userFilter = { institutionId: user.institutionId };
    }

    const users = await prisma.user.findMany({
      where: userFilter,
      include: { institution: true, district: true }
    });
    res.json(users);
  } catch (error) { res.status(500).json({ error: 'Personel çekilemedi.' }); }
});

// =====================================
// 3. ATAMA VE YETKİLENDİRME GÜVENLİĞİ
// (En hassas işlem — sadece SISTEM)
// =====================================
router.post('/assign-role', authorize(['SISTEM']), async (req, res) => {
  const { userId, newRole, regionId, districtId, institutionId } = req.body;
  try {
    // Enum RoleLevel güncellemesi
    await prisma.user.update({
      where: { id: userId },
      data: { roleLevel: newRole, roles: [newRole] }
    });

    if (newRole === 'BOLGE' && regionId) {
      await prisma.region.update({ where: { id: regionId }, data: { managerId: userId } });
    } else if (newRole === 'MINTIKA' && districtId) {
      await prisma.district.update({ where: { id: districtId }, data: { managerId: userId } });
    } else if (newRole === 'KURUM' && institutionId) {
      await prisma.institution.update({ where: { id: institutionId }, data: { managerId: userId } });
    }

    // Personelin Kurumunu ve Mıntıkasını Güncelle
    let updateData = {};
    if (institutionId) updateData.institutionId = institutionId;
    if (districtId) updateData.districtId = districtId;

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: updateData });
    }

    res.json({ message: 'Yetki atandı!' });
  } catch (error) { res.status(500).json({ error: 'Atama başarısız.' }); }
});

// =====================================
// 4. BİRİM EKLEME (Sadece SISTEM)
// =====================================
router.post('/region', authorize(['SISTEM']), async (req, res) => { res.json(await prisma.region.create({ data: { name: req.body.name } })); });
router.post('/district', authorize(['SISTEM']), async (req, res) => { res.json(await prisma.district.create({ data: { name: req.body.name, regionId: req.body.regionId } })); });
router.post('/institution', authorize(['SISTEM']), async (req, res) => { res.json(await prisma.institution.create({ data: { name: req.body.name, districtId: req.body.districtId } })); });

router.get('/public-districts', authorize(['SISTEM']), async (req, res) => {
  try { res.json(await prisma.district.findMany({ include: { region: true } })); }
  catch (error) { res.status(500).json({ error: 'Mıntıkalar çekilemedi.' }); }
});

// =====================================
// 5. PERSONEL İŞLEMLERİ (Sadece SISTEM)
// =====================================

// 1. TEKLİ PERSONEL OLUŞTURMA
router.post('/create-user', authorize(['SISTEM']), async (req, res) => {
  try {
    const { fullName, username, email, districtId, institutionId } = req.body;
    const rawPassword = Math.floor(1000 + Math.random() * 9000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    const personelId = Math.floor(1000000 + Math.random() * 9000000).toString();

    const user = await prisma.user.create({
      data: {
        fullName, username, email, password: hashedPassword, personelId,
        roleLevel: "PERSONEL", roles: ["PERSONEL"],
        districtId: districtId || null, institutionId: institutionId || null
      }
    });

    res.json({ message: 'Personel oluşturuldu', user, rawPassword });
  } catch (error) { res.status(500).json({ error: 'Personel eklenemedi: ' + error.message }); }
});

// 2. EXCEL İLE ÇOKLU PERSONEL OLUŞTURMA
router.post('/bulk-create-users', authorize(['SISTEM']), async (req, res) => {
  try {
    const usersData = req.body.users;
    let eklenenler = [];

    for (let i = 0; i < usersData.length; i++) {
      const u = usersData[i];
      const adSoyad = u['AD-SOYAD']?.toString().trim();
      const rolExcel = u['ROL/YETKİ']?.toString().trim().toUpperCase();
      const mintikaAd = u['MINTIKA']?.toString().trim();
      const kurumAd = u['KURUM']?.toString().trim();

      const sifre = (u['ŞİFRE'] !== undefined && u['ŞİFRE'] !== null && String(u['ŞİFRE']).trim() !== '')
                    ? String(u['ŞİFRE'])
                    : '1234';

      if (!adSoyad || !rolExcel) return res.status(400).json({ error: `${i + 2}. satırda AD-SOYAD veya ROL/YETKİ boş olamaz!` });

      let dbRoleLevel = "PERSONEL";
      if (rolExcel === "STANDART") dbRoleLevel = "PERSONEL";
      else if (rolExcel === "KURUM") {
        dbRoleLevel = "KURUM";
        if (!mintikaAd || !kurumAd) return res.status(400).json({ error: `${adSoyad} için MINTIKA ve KURUM zorunludur!` });
      }
      else if (rolExcel === "MINTIKA") {
        dbRoleLevel = "MINTIKA";
        if (!mintikaAd) return res.status(400).json({ error: `${adSoyad} için MINTIKA zorunludur!` });
      }
      else if (rolExcel === "BÖLGE" || rolExcel === "BOLGE") dbRoleLevel = "BOLGE";

      let distId = null;
      let instId = null;

      if (mintikaAd) {
        const dist = await prisma.district.findFirst({ where: { name: mintikaAd } });
        if (dist) {
          distId = dist.id;
          if (kurumAd) {
            const inst = await prisma.institution.findFirst({ where: { name: kurumAd, districtId: dist.id } });
            if (inst) instId = inst.id;
          }
        }
      }

      const hashedPassword = await bcrypt.hash(sifre, 10);
      const personelId = Math.floor(1000000 + Math.random() * 9000000).toString();
      const uname = (adSoyad.toLowerCase().replace(/\s+/g, '_').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c') + Math.floor(Math.random()*1000));

      const newUser = await prisma.user.create({
        data: {
          fullName: adSoyad, username: uname, email: u['E-POSTA'] || null,
          password: hashedPassword, personelId,
          roleLevel: dbRoleLevel, roles: [dbRoleLevel],
          institutionId: instId, districtId: distId
        }
      });

      // 🔥 MAKAM ANAHTARLARINI TESLİM ET
      if (dbRoleLevel === "KURUM" && instId) {
        await prisma.institution.update({ where: { id: instId }, data: { managerId: newUser.id } });
      }
      if (dbRoleLevel === "MINTIKA" && distId) {
        await prisma.district.update({ where: { id: distId }, data: { managerId: newUser.id } });
      }

      eklenenler.push({ fullName: newUser.fullName, username: newUser.username, rawPassword: sifre, kurum: kurumAd || mintikaAd || 'Genel' });
    }
    res.json({ message: 'Toplu ekleme başarılı!', eklenenler });
  } catch (error) { res.status(500).json({ error: 'Sistemsel bir hata oluştu.' }); }
});

// 3. PERSONEL GÜNCELLEME VE TRANSFER
router.put('/update-user/:id', authorize(['SISTEM']), async (req, res) => {
  try {
    const { fullName, email, districtId, institutionId, role, password } = req.body;

    let dataToUpdate = {
      fullName,
      email,
      districtId: districtId || null,
      institutionId: institutionId || null,
      roleLevel: role || 'PERSONEL',
      roles: role ? [role] : undefined
    };

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      dataToUpdate.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: dataToUpdate
    });

    if (role === "KURUM" && institutionId) {
      await prisma.institution.update({ where: { id: institutionId }, data: { managerId: updatedUser.id } });
    }

    if (role === "MINTIKA" && districtId) {
      await prisma.district.update({ where: { id: districtId }, data: { managerId: updatedUser.id } });
    }

    if (role === "BOLGE" && districtId) {
      const dist = await prisma.district.findUnique({ where: { id: districtId } });
      if (dist && dist.regionId) {
        await prisma.region.update({ where: { id: dist.regionId }, data: { managerId: updatedUser.id } });
      }
    }

    res.json({ message: 'Personel başarıyla güncellendi ve makama atandı!' });
  } catch (error) {
    console.error("Personel Güncelleme Hatası:", error);
    res.status(500).json({ error: 'Güncelleme başarısız oldu.' });
  }
});

// 4. PERSONEL SİLME İŞLEMİ
router.delete('/user/:id', authorize(['SISTEM']), async (req, res) => {
  try {
    await prisma.user.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Personel başarıyla silindi.' });
  } catch (error) {
    res.status(500).json({ error: 'Personel silinirken hata oluştu. Üzerinde görev olan personeller silinemez.' });
  }
});

module.exports = router;