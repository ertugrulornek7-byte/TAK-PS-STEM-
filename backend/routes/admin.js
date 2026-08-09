// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =====================================
// 1. KİMLİĞE GÖRE ORGANİZASYON LİSTELEME
// =====================================
router.get('/organization', async (req, res) => {
  const { userId } = req.query;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { managedRegion: true, managedDistrict: true, institution: { include: { district: true } } }
    });
    const role = user.roles[0];

    let regionFilter = {};
    let districtFilter = {};
    let institutionFilter = {};

    // YETKİ FİLTRELERİ
    if (role === 'BOLGE_EM' && user.managedRegion) {
      regionFilter = { id: user.managedRegion.id };
    } else if (role === 'MINTIKA_EM' && user.managedDistrict) {
      regionFilter = { id: user.managedDistrict.regionId };
      districtFilter = { id: user.managedDistrict.id };
    } else if (role === 'KURUM_EM' && user.institution) {
      // 🔥 KURUM EM SADECE KENDİ KURUMUNUN HİYERARŞİSİNİ GÖREBİLİR!
      regionFilter = { id: user.institution.district.regionId };
      districtFilter = { id: user.institution.districtId };
      institutionFilter = { id: user.institutionId };
    }

    const tree = await prisma.region.findMany({
      where: regionFilter,
      include: {
        manager: { select: { fullName: true, roles: true } },
        districts: {
          where: districtFilter,
          include: {
            manager: { select: { fullName: true, roles: true } },
            institutions: {
              where: institutionFilter,
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
  } catch (error) { res.status(500).json({ error: 'Şema çekilemedi.' }); }
});

// =====================================
// 2. KİMLİĞE GÖRE PERSONEL LİSTELEME
// =====================================
router.get('/users', async (req, res) => {
  const { userId } = req.query;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { managedRegion: true, managedDistrict: true }
    });
    const role = user.roles[0];

    let userFilter = {};
    if (role === 'BOLGE_EM' && user.managedRegion) {
      userFilter = { district: { regionId: user.managedRegion.id } };
    } else if (role === 'MINTIKA_EM' && user.managedDistrict) {
      userFilter = { districtId: user.managedDistrict.id };
    } else if (role === 'KURUM_EM') {
      // 🔥 KURUM EM SADECE KENDİ KURUMUNDAKİ PERSONELİ GÖREBİLİR!
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
// =====================================
router.post('/assign-role', async (req, res) => {
  const { userId, newRole, regionId, districtId, institutionId } = req.body;
  try {
    await prisma.user.update({ where: { id: userId }, data: { roles: [newRole] } });

    if (newRole === 'BOLGE_EM' && regionId) {
      await prisma.region.update({ where: { id: regionId }, data: { managerId: userId } });
    } else if (newRole === 'MINTIKA_EM' && districtId) {
      await prisma.district.update({ where: { id: districtId }, data: { managerId: userId } });
    } else if (newRole === 'KURUM_EM' && institutionId) {
      await prisma.institution.update({ where: { id: institutionId }, data: { managerId: userId } });
    }

    // Personelin Kurumunu ve Mıntıkasını Güncelle
    let updateData = {};
    if (institutionId) updateData.institutionId = institutionId;
    if (districtId) updateData.districtId = districtId; // Mıntıka değişimi!

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: updateData });
    }

    res.json({ message: 'Yetki atandı!' });
  } catch (error) { res.status(500).json({ error: 'Atama başarısız.' }); }
});

// =====================================
// 4. BİRİM EKLEME (Değişmedi)
// =====================================
router.post('/region', async (req, res) => { res.json(await prisma.region.create({ data: { name: req.body.name } })); });
router.post('/district', async (req, res) => { res.json(await prisma.district.create({ data: { name: req.body.name, regionId: req.body.regionId } })); });
router.post('/institution', async (req, res) => { res.json(await prisma.institution.create({ data: { name: req.body.name, districtId: req.body.districtId } })); });

// Kayıt ekranı için sadece Mıntıkaları dışarı veren özel rota
router.get('/public-districts', async (req, res) => {
  try { res.json(await prisma.district.findMany({ include: { region: true } })); } 
  catch (error) { res.status(500).json({ error: 'Mıntıkalar çekilemedi.' }); }
});

const bcrypt = require('bcryptjs');

// 1. TEKLİ PERSONEL OLUŞTURMA
router.post('/create-user', async (req, res) => {
  try {
    const { fullName, username, email, districtId, institutionId } = req.body;
    // 4 Haneli Rastgele Şifre Oluştur
    const rawPassword = Math.floor(1000 + Math.random() * 9000).toString(); 
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);
    
    const personelId = Math.floor(1000000 + Math.random() * 9000000).toString();

    const user = await prisma.user.create({
      data: {
        fullName, username, email, password: hashedPassword, personelId,
        roles: ["PERSONEL"], districtId: districtId || null, institutionId: institutionId || null
      }
    });

    res.json({ message: 'Personel oluşturuldu', user, rawPassword });
  } catch (error) { res.status(500).json({ error: 'Personel eklenemedi: ' + error.message }); }
});
// 2. EXCEL İLE ÇOKLU PERSONEL OLUŞTURMA
router.post('/bulk-create-users', async (req, res) => {
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

      let dbRole = "PERSONEL";
      if (rolExcel === "STANDART") dbRole = "PERSONEL";
      else if (rolExcel === "KURUM") {
        dbRole = "KURUM_EM";
        if (!mintikaAd || !kurumAd) return res.status(400).json({ error: `${adSoyad} için MINTIKA ve KURUM zorunludur!` });
      } 
      else if (rolExcel === "MINTIKA") {
        dbRole = "MINTIKA_EM";
        if (!mintikaAd) return res.status(400).json({ error: `${adSoyad} için MINTIKA zorunludur!` });
      } 
      else if (rolExcel === "BÖLGE") dbRole = "BOLGE_EM";

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
          password: hashedPassword, personelId, roles: [dbRole],
          institutionId: instId, districtId: distId
        }
      });

      // 🔥 ÇÖZÜM BURADA: MAKAM ANAHTARLARINI TESLİM ET!
      if (dbRole === "KURUM_EM" && instId) {
        await prisma.institution.update({ where: { id: instId }, data: { managerId: newUser.id } });
      }
      if (dbRole === "MINTIKA_EM" && distId) {
        await prisma.district.update({ where: { id: distId }, data: { managerId: newUser.id } });
      }

      eklenenler.push({ fullName: newUser.fullName, username: newUser.username, rawPassword: sifre, kurum: kurumAd || mintikaAd || 'Genel' });
    }
    res.json({ message: 'Toplu ekleme başarılı!', eklenenler });
  } catch (error) { res.status(500).json({ error: 'Sistemsel bir hata oluştu.' }); }
});
// 3. PERSONEL GÜNCELLEME VE TRANSFER (YENİ ROLELEVEL UYUMLU)
router.put('/update-user/:id', async (req, res) => {
  try {
    const { fullName, email, districtId, institutionId, role, password } = req.body;
    
    let dataToUpdate = { 
      fullName, 
      email, 
      districtId: districtId || null, 
      institutionId: institutionId || null, 
      roleLevel: role || 'PERSONEL', // 🔥 Yeni şema ana alanı
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

    // 🔥 MAKAM VE TAPU ATAMALARI (YENİ ENUM DEĞERLERİNE GÖRE DÜZELTİLDİ)
    
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
router.delete('/user/:id', async (req, res) => {
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