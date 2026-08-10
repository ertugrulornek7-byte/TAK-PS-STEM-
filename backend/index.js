// 1. ÇEVRE DEĞİŞKENLERİ VE PAKET İÇE AKTARIMLARI (En üstte olmak zorundadır)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

const errorHandler = require('./middleware/errorHandler');
const SchedulerService = require('./services/schedulerService');

// 2. UYGULAMA VE VERİTABANI BAŞLATMA
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// =================================================================
// 3. GÜVENLİK VE HIZ SINIRLANDIRMA (Middleware'ler en başta çalışır)
// =================================================================
// Güvenlik başlıklarını ekler
app.use(helmet()); 

// Gelen istekleri sınırlama (Brute-force koruması)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // Her IP için 15 dakikada en fazla 100 istek
  message: { error: { message: 'Çok fazla istek attınız, lütfen daha sonra tekrar deneyin.' } }
});
app.use('/api/', limiter);

// =================================================================
// 4. GENEL AYARLAR VE LOGLAMA (CORS, JSON, Radar)
// =================================================================
app.use(cors({
  origin: '*', // Tüm bağlantılara izin ver (Canlıda sadece frontend URL'si olacak)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// SİSTEM RADARI: Sunucuya gelen HER İSTEĞİ ekrana yazdırır!
app.use((req, res, next) => {
  console.log(`📡 RADAR: ${req.method} isteği geldi -> Hedef: ${req.originalUrl}`);
  next();
});

// =================================================================
// 5. ROTALAR (API Uç Noktaları)
// =================================================================
// Sistem Durumu
app.get('/api/status', (req, res) => {
  res.json({ mesaj: 'Hesap/Hiyerarşi ve Etüt API Servisi Aktif!', durum: 'Başarılı' });
});

// Özel İsimli Rotalar
app.use('/api/admin', require('./routes/admin'));
app.use('/api/hierarchy', require('./routes/hierarchy'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/inspections', require('./routes/inspections'));
app.use('/api/curriculum', require('./routes/curriculum'));
app.use('/api/testbook', require('./routes/testbook'));

// Genel Rotalar
app.use('/api', require('./routes/books'));
app.use('/api', require('./routes/performance'));
app.use('/api', require('./routes/exams'));
app.use('/api', require('./routes/reports'));

// =================================================================
// 6. MERKEZİ HATA YAKALAYICI (Tüm Rotalardan SONRA Eklenmek ZORUNDADIR)
// =================================================================
app.use(errorHandler);

// =================================================================
// 7. ZAMANLANMIŞ GÖREV MOTORUNU (Cron) BAŞLAT VE SUNUCUYU AÇ
// =================================================================
SchedulerService.init();

app.listen(PORT, () => {
  console.log(`🚀 Backend servisi http://localhost:${PORT} adresinde çalışıyor`);
});