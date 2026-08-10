const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod'); // 🔥 Zod Kütüphanesi
const validate = require('../middleware/validate'); // 🔥 Bekçimiz

if (!process.env.JWT_SECRET) {
  console.error("🚨 KRİTİK HATA: .env dosyasında JWT_SECRET tanımlı değil! Sunucu başlatılamıyor.");
  process.exit(1); 
}
const JWT_SECRET = process.env.JWT_SECRET;

// ==========================================
// ZOD ŞEMALARI
// ==========================================
const loginSchema = z.object({
  body: z.object({
    username: z.string({ required_error: "Kullanıcı adı zorunludur" }).min(1, "Kullanıcı adı boş olamaz"),
    password: z.string({ required_error: "Şifre zorunludur" }).min(1, "Şifre boş olamaz")
  })
});

const setupAdminSchema = z.object({
  body: z.object({
    adminUsername: z.string({ required_error: "Kullanıcı adı zorunludur" }).min(3, "Kullanıcı adı en az 3 karakter olmalıdır"),
    adminPassword: z.string({ required_error: "Şifre zorunludur" }).min(6, "Şifre en az 6 karakter olmalıdır"),
    adminFullName: z.string().optional()
  })
});

// ==========================================
// 1. KULLANICI GİRİŞİ (LOGIN) 
// ==========================================
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { username },
      include: { district: true, institution: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, roleLevel: user.roleLevel },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({ message: 'Giriş başarılı', token, user: userWithoutPassword });
  } catch (error) {
    console.error("Login Hatası:", error);
    res.status(500).json({ error: 'Sunucu hatası, giriş yapılamadı.' });
  }
});

// ==========================================
// 2. İLK KURULUM - KURUCU ADMİN OLUŞTURMA
// ==========================================
router.post('/setup-admin', validate(setupAdminSchema), async (req, res) => {
  try {
    const { adminUsername, adminPassword, adminFullName } = req.body;

    const existingAdmin = await prisma.user.findFirst({
      where: { roleLevel: 'SISTEM' }
    });

    if (existingAdmin) {
      return res.status(403).json({ error: 'Güvenlik kilidi: Sistem admini zaten mevcut. Bu işlem tekrarlanamaz.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const newAdmin = await prisma.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        fullName: adminFullName || 'Sistem Yöneticisi',
        roleLevel: 'SISTEM',
        roles: ['ADMIN']
      }
    });

    res.json({ message: 'Kurucu Sistem Admini başarıyla oluşturuldu!' });
  } catch (error) {
    console.error("Kurulum Hatası:", error);
    res.status(500).json({ error: 'Admin hesabı oluşturulamadı.' });
  }
});

module.exports = router;