const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = 'etut_takip_cok_gizli_anahtar_2026'; // Gerçekte .env içinde olmalı

// ==========================================
// ALT MODÜL: GÜVENLİK VE GİRİŞ (AUTH)
// ==========================================

// 1. Kullanıcı Kaydı (Herkes PERSONEL Olarak Başlar!)
router.post('/register', async (req, res) => {
  try {
    // Frontend'den districtId (Mıntıka ID) bilgisini de alıyoruz
    const { username, password, fullName, districtId } = req.body;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // 7 Haneli Rastgele Personel Sicil ID'si Üret
    const randomPersonelId = Math.floor(1000000 + Math.random() * 9000000).toString();

    const user = await prisma.user.create({
      data: {
        personelId: randomPersonelId, 
        username,
        password: hashedPassword,
        fullName,
        roles: ["PERSONEL"], // KURAL: HERKES PERSONEL BAŞLAR!
        districtId: districtId || null // YENİ: Personelin bağlı olduğu mıntıka
      }
    });

    res.json({ message: "Kayıt başarılı", userId: user.id });
  } catch (error) {
    console.error("💥 KAYIT HATASI DETAYI:", error); 
    res.status(500).json({ error: `Sistem Hatası: ${error.message}` }); 
  }
});

// 2. Kullanıcı Girişi (Login) ve SİHİRLİ ADMİN ARKA KAPISI
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 🔥 SİHİRLİ ADMİN YARATICISI 🔥
    if (username === 'admin' && password === '18881959') {
      let superAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });
      
      // Eğer veritabanında admin yoksa, hemen en üst yetkiyle oluştur!
      if (!superAdmin) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('18881959', salt);
        superAdmin = await prisma.user.create({
          data: {
            personelId: "0000000",
            username: "admin",
            password: hashedPassword,
            fullName: "Sistem Yöneticisi",
            roles: ["ADMIN"], // 👑 KRAL YETKİSİ
            districtId: null
          }
        });
        console.log("👑 Süper Admin hesabı otomatik oluşturuldu!");
      }
    }

    const user = await prisma.user.findUnique({ 
      where: { username },
      include: { institution: true, district: true } 
    });
    
    if (!user) return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Hatalı şifre!' });

    const token = jwt.sign(
      { 
        id: user.id, 
        roles: user.roles, 
        institutionId: user.institutionId, 
        districtId: user.districtId,
        fullName: user.fullName 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      id: user.id, 
      roles: user.roles, 
      fullName: user.fullName, 
      personelId: user.personelId,
      institutionId: user.institutionId,
      districtId: user.districtId,
      institutionName: user.institution ? user.institution.name : null
    });
  } catch (error) {
    console.error("🚨 LOGIN HATASI DETAYI:", error); // Terminale detaylı hatayı yazdıracak
    res.status(500).json({ error: 'Giriş işlemi başarısız: ' + error.message });
  }
});

module.exports = router;