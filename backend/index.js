require('dotenv').config(); // Ayarlar her şeyden önce yüklenmeli
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient(); // Veritabanı bağlantımızı başlattık
const port = process.env.PORT || 3000;

// Sistem için gizli bir anahtar (Gerçek projede .env dosyasına konur)
const JWT_SECRET = 'etut_takip_cok_gizli_anahtar_2026';

app.use(cors({
  origin: '*', // Tüm bağlantılara izin ver
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// SİSTEM RADARI: Sunucuya gelen HER İSTEĞİ ekrana yazdırır!
app.use((req, res, next) => {
  console.log(`📡 RADAR: ${req.method} isteği geldi -> Hedef: ${req.originalUrl}`);
  next();
});

// --- 1. SİSTEM DURUMU ---
app.get('/api/status', (req, res) => {
  res.json({ mesaj: 'Hesap/Hiyerarşi ve Etüt API Servisi Aktif!', durum: 'Başarılı' });
});

// =================================================================
// 🚀 YENİ NESİL MİKRO-MODÜLER YAPI (Dosyalara Ayrılmış Sistemler)
// =================================================================

// 1. ÖZEL İSİMLİ ROTALAR (İsteklerin Çalınmaması İçin EN ÜSTTE olmalılar!)
app.use('/api/admin', require('./routes/admin')); // Yeni Admin rotamız!
app.use('/api/hierarchy', require('./routes/hierarchy'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/inspections', require('./routes/inspections'));
app.use('/api/curriculum', require('./routes/curriculum'));
app.use('/api/testbook', require('./routes/testbook'));

// 2. GENEL ROTALAR (Sadece /api kullananlar EN ALTTA olmalıdır)
app.use('/api', require('./routes/books'));
app.use('/api', require('./routes/performance'));
app.use('/api', require('./routes/exams'));
app.use('/api', require('./routes/reports'));

// Sunucuyu Başlat
app.listen(port, () => {
  console.log(`🚀 Backend servisi http://localhost:${port} adresinde çalışıyor`);
});