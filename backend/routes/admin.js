const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

// 🔥 GÜVENLİK KALKANLARI
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');
const { resolveOrCreateInstitution } = require('../services/hierarchyProvisioningService');

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
// 5. PERSONEL İŞLEMLERİ
// 🔥 DÜZELTME: create-user ve bulk-create-users artık sadece SISTEM değil,
// BOLGE ve MINTIKA da kullanabiliyor — istenen "admin tüm personeli, bölge
// kendi bölgesindekini, mıntıka kendi mıntıkasındakini ekleyebilecek" kuralı.
// =====================================

// 1. TEKLİ PERSONEL OLUŞTURMA
router.post('/create-user', authorize(['SISTEM', 'BOLGE', 'MINTIKA']), async (req, res) => {
  try {
    const { fullName, username, email, districtId, institutionId } = req.body;
    const role = req.user.roleLevel;

    // 🔥 EKLENDİ: SISTEM dışındaki roller sadece kendi yetki alanlarına
    // personel ekleyebilir. Önceden bu endpoint SISTEM-only olduğu için hiç
    // kontrol yoktu; şimdi BOLGE/MINTIKA'ya açılırken bu kontrol de geldi.
    if (role !== 'SISTEM') {
      if (institutionId && !await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
        return res.status(403).json({ error: 'Bu kuruma personel ekleme yetkiniz yok.' });
      }
      if (districtId) {
        if (role === 'MINTIKA' && req.user.managedDistrict?.id !== districtId) {
          return res.status(403).json({ error: 'Sadece kendi mıntıkanıza personel ekleyebilirsiniz.' });
        }
        if (role === 'BOLGE' && req.user.managedRegion) {
          const dist = await prisma.district.findUnique({ where: { id: districtId } });
          if (!dist || dist.regionId !== req.user.managedRegion.id) {
            return res.status(403).json({ error: 'Sadece kendi bölgenizdeki mıntıkalara personel ekleyebilirsiniz.' });
          }
        }
      }
    }

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

// 2. EXCEL İLE ÇOKLU PERSONEL OLUŞTURMA — YENİDEN YAZILDI
//
// Değişenler:
// - Artık SISTEM/BOLGE/MINTIKA kullanabiliyor (önceden SISTEM-only).
// - Excel'de yazan Mıntıka/Kurum sistemde yoksa, yükleyenin YETKİ ALANI
//   İÇİNDE otomatik oluşturuluyor (hierarchyProvisioningService ile — aynı
//   mantık talebe toplu yüklemesiyle paylaşılıyor). Önceden sadece
//   findFirst yapılıyordu, bulunamazsa satır sessizce kurumsuz kalıyordu.
// - ROL/YETKİ artık ZORUNLU DEĞİL — boş bırakılırsa PERSONEL varsayılır.
//   Yani istenen "sadece Mıntıka, Kurum, Adı Soyadı" 3 sütunlu basit format
//   da bu endpoint ile doğrudan çalışır.
// - Aynı kurumda aynı isimde biri zaten varsa o satır ATLANIYOR (önceden
//   böyle bir kontrol hiç yoktu, her çalıştırmada yeni bir hesap+şifre
//   üretilip kişi çoğaltılıyordu).
// - Bir yükleyici kendi rütbesinin üstünde bir rol atamaya çalışırsa
//   (örn. MINTIKA kullanıcısı birini BOLGE yapmaya çalışırsa) bu görmezden
//   gelinip PERSONEL'e düşürülüyor.
router.post('/bulk-create-users', authorize(['SISTEM', 'BOLGE', 'MINTIKA']), async (req, res, next) => {
  try {
    const usersData = req.body.users;
    const role = req.user.roleLevel;

    const izinliRoller = {
      SISTEM: ['PERSONEL', 'KURUM', 'MINTIKA', 'BOLGE'],
      BOLGE: ['PERSONEL', 'KURUM', 'MINTIKA'],
      MINTIKA: ['PERSONEL', 'KURUM']
    };

    let eklenen = 0, atlanan = 0, hatali = 0;
    const detaylar = [];

    for (const u of usersData) {
      const adSoyad = (u['AD-SOYAD'] || u['Adı Soyadı'] || u['ADI SOYADI'] || '').toString().trim();
      const mintikaAdi = (u['MINTIKA'] || u['Mıntıka'] || '').toString().trim();
      const kurumAdi = (u['KURUM'] || u['Kurum'] || '').toString().trim();
      const bolgeAdi = (u['BÖLGE'] || u['Bölge'] || '').toString().trim();
      const rolExcel = (u['ROL/YETKİ'] || '').toString().trim().toUpperCase();
      const sifre = (u['ŞİFRE'] && String(u['ŞİFRE']).trim()) || Math.floor(1000 + Math.random() * 9000).toString();

      if (!adSoyad) {
        hatali++;
        detaylar.push({ satir: '(boş satır)', sonuc: 'HATA', mesaj: 'Ad Soyad boş olamaz' });
        continue;
      }

      let dbRoleLevel = 'PERSONEL';
      if (rolExcel === 'BÖLGE') dbRoleLevel = 'BOLGE'; else if (['PERSONEL', 'KURUM', 'MINTIKA', 'BOLGE', 'STANDART'].includes(rolExcel)) {
        dbRoleLevel = rolExcel === 'STANDART' ? 'PERSONEL' : rolExcel;
      }
      if (!izinliRoller[role].includes(dbRoleLevel)) dbRoleLevel = 'PERSONEL'; // rütbe üstü atama engeli

      // Hedef kurumu bul/oluştur (Mıntıka+Kurum verilmişse)
      let targetInstitutionId = null;
      let targetDistrictId = null;
      try {
        if (mintikaAdi && kurumAdi) {
          targetInstitutionId = await resolveOrCreateInstitution({
            role, user: req.user, bolgeAdi: bolgeAdi || null,
            mintikaAdi, kurumAdi, kurumKodu: null, nevi: null
          });
          if (targetInstitutionId) {
            const inst = await prisma.institution.findUnique({ where: { id: targetInstitutionId } });
            targetDistrictId = inst ? inst.districtId : null;
          }
        } else if (role === 'MINTIKA' && req.user.managedDistrict) {
          targetDistrictId = req.user.managedDistrict.id; // sadece mıntıka bilgisiyle eklenen personel kendi mıntıkasına düşer
        }
      } catch (e) {
        hatali++;
        detaylar.push({ satir: adSoyad, sonuc: 'HATA', mesaj: e.message });
        continue;
      }

      if ((mintikaAdi && kurumAdi) && !targetInstitutionId) {
        atlanan++;
        detaylar.push({ satir: adSoyad, sonuc: 'ATLANDI', mesaj: 'Kurum belirlenemedi veya yetki alanınız dışında' });
        continue;
      }

      // Aynı isimde, aynı kurumda/mıntıkada zaten personel var mı? (dedup)
      const mevcut = await prisma.user.findFirst({
        where: {
          fullName: { equals: adSoyad, mode: 'insensitive' },
          ...(targetInstitutionId ? { institutionId: targetInstitutionId } : (targetDistrictId ? { districtId: targetDistrictId } : {}))
        }
      });
      if (mevcut) {
        atlanan++;
        detaylar.push({ satir: adSoyad, sonuc: 'ATLANDI', mesaj: 'Bu isimde bir personel zaten kayıtlı' });
        continue;
      }

      const hashedPassword = await bcrypt.hash(sifre, 10);
      const personelId = Math.floor(1000000 + Math.random() * 9000000).toString();
      const uname = (adSoyad.toLowerCase().replace(/\s+/g, '_').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c') + Math.floor(Math.random() * 1000));

      const newUser = await prisma.user.create({
        data: {
          fullName: adSoyad, username: uname, email: u['E-POSTA'] || null,
          password: hashedPassword, personelId,
          roleLevel: dbRoleLevel, roles: [dbRoleLevel],
          institutionId: targetInstitutionId, districtId: targetDistrictId
        }
      });

      if (dbRoleLevel === 'KURUM' && targetInstitutionId) {
        await prisma.institution.update({ where: { id: targetInstitutionId }, data: { managerId: newUser.id } });
      }
      if (dbRoleLevel === 'MINTIKA' && targetDistrictId) {
        await prisma.district.update({ where: { id: targetDistrictId }, data: { managerId: newUser.id } });
      }

      eklenen++;
      detaylar.push({ satir: adSoyad, sonuc: 'EKLENDI', kullaniciAdi: uname, sifre, kurum: kurumAdi || mintikaAdi || 'Genel' });
    }

    res.json({ message: 'Toplu ekleme tamamlandı.', eklenen, atlanan, hatali, detaylar });
  } catch (error) { next(error); }
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