const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Güvenlik: Şifreyi .env dosyasından alıyoruz, yoksa geçici bir anahtar kullanıyoruz
if (!process.env.JWT_SECRET) {
  console.error("🚨 KRİTİK HATA: .env dosyasında JWT_SECRET tanımlı değil! Sunucu başlatılamıyor.");
  process.exit(1); // Uygulamayı güvenli bir şekilde durdurur
}
const JWT_SECRET = process.env.JWT_SECRET;


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