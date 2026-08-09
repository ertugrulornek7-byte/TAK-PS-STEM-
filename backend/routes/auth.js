const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Güvenlik: Şifreyi .env dosyasından alıyoruz, yoksa geçici bir anahtar kullanıyoruz
const JWT_SECRET = process.env.JWT_SECRET || 'etut_takip_cok_gizli_anahtar_2026';

// ==========================================
// 1. KULLANICI GİRİŞİ (LOGIN) - BİLET ÜRETİM MERKEZİ
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Kullanıcıyı veritabanında bul
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        district: true,
        institution: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }

    // Şifre kontrolü
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }

    // JWT Token Üretimi (24 Saatlik Geçerli Bilet)
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        roleLevel: user.roleLevel // Yeni makam sistemimiz biletin içine işleniyor
      },
      JWT_SECRET,
      { expiresIn: '24h' } 
    );

    // Güvenlik: Şifreyi frontend'e (ön yüze) asla gönderme!
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Giriş başarılı',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error("Login Hatası:", error);
    res.status(500).json({ error: 'Sunucu hatası, giriş yapılamadı.' });
  }
});

// ==========================================
// 2. İLK KURULUM - KURUCU ADMİN OLUŞTURMA (Sihirli arka kapı yerine güvenli kurulum)
// ==========================================
router.post('/setup-admin', async (req, res) => {
  try {
    const { adminUsername, adminPassword, adminFullName } = req.body;

    // Sistemde zaten SISTEM seviyesinde biri var mı kontrol et (Sadece 1 kez çalışmasına izin ver)
    const existingAdmin = await prisma.user.findFirst({
      where: { roleLevel: 'SISTEM' }
    });

    if (existingAdmin) {
      return res.status(403).json({ error: 'Güvenlik kilidi: Sistem admini zaten mevcut. Bu işlem tekrarlanamaz.' });
    }

    if (!adminUsername || !adminPassword) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    // Şifreyi kriptola (geri döndürülemez şekilde şifrele)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const newAdmin = await prisma.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        fullName: adminFullName || 'Sistem Yöneticisi',
        roleLevel: 'SISTEM',
        roles: ['ADMIN'] // Eski sistemle geriye dönük uyumluluk için
      }
    });

    res.json({ message: 'Kurucu Sistem Admini başarıyla oluşturuldu!' });
  } catch (error) {
    console.error("Kurulum Hatası:", error);
    res.status(500).json({ error: 'Admin hesabı oluşturulamadı.' });
  }
});

module.exports = router;