const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);

// ==========================================
// VERİ DOĞRULAMA ŞABLONLARI (ZOD)
// ==========================================
const bookSchema = z.object({
  body: z.object({
    title: z.string({ required_error: "Kitap adı zorunludur" }).min(1, "Kitap adı boş olamaz"),
    totalPages: z.number({ required_error: "Sayfa sayısı zorunludur" }).int().positive("Sayfa sayısı 0'dan büyük olmalıdır"),
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable()
  })
});

const bookTrackingSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Öğrenci ID"),
    bookId: z.string().uuid("Geçersiz Kitap ID"),
    readPages: z.number().int({ required_error: "Okunan sayfa zorunludur" }),
    targetMonth: z.string().optional().nullable()
  })
});

const pauseTrackingSchema = z.object({
  body: z.object({
    studentId: z.string().uuid("Geçersiz Öğrenci ID"),
    targetMonth: z.string().optional().nullable()
  })
});

// ==========================================
// ALT MODÜL: KİTAP VE OKUMA TAKİBİ (SAYFA 3)
// ==========================================

// 1. Yeni Kitap Ekleme
router.post('/books', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(bookSchema), async (req, res, next) => {
  try {
    const { title, totalPages, institutionId } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Bu kuruma kitap ekleme yetkiniz yok.' });
    }

    const existingBook = await prisma.book.findFirst({
      where: { title, totalPages, institutionId: targetInstitution }
    });
    
    if (existingBook) return res.status(400).json({ error: 'Bu kitap kütüphanenizde zaten mevcut!' });

    const book = await prisma.book.create({ 
      data: { title, totalPages, institutionId: targetInstitution } 
    });
    res.json(book);
  } catch (error) { next(error); }
});

// 2. Kurumun Kitaplarını Listeleme
router.get('/books/:institutionId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    if (!await HierarchyService.assertOwnsInstitution(req.user, req.params.institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun kitaplarını görme yetkiniz yok.' });
    }

    const books = await prisma.book.findMany({ where: { institutionId: req.params.institutionId } });
    res.json(books);
  } catch (error) { next(error); }
});

// 3. Okuma İlerlemesi Kaydetme
router.post('/book-tracking', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(bookTrackingSchema), async (req, res, next) => {
  try {
    const { studentId, bookId, readPages, targetMonth } = req.body; 

    // Güvenlik Kalkanı: Öğrenci benim öğrencim mi?
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Bu öğrenciye okuma kaydı ekleme yetkiniz yok.' });
    }

    const eklenecekSayfa = parseInt(readPages);
    let islemTarihi = new Date();
    
    if (targetMonth) {
      const [yil, ay] = targetMonth.split('-');
      islemTarihi = new Date(parseInt(yil), parseInt(ay) - 1, 15, 12, 0, 0); 
      const bugun = new Date();
      if (new Date(parseInt(yil), parseInt(ay) - 1, 1) > new Date(bugun.getFullYear(), bugun.getMonth(), 1)) {
        return res.status(400).json({ error: 'Gelecek aylar için veri giremezsiniz!' });
      }
    }

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    let tracking = await prisma.studentBookTracking.findFirst({ where: { studentId, bookId } });

    if (tracking) {
      if (tracking.readPages >= book.totalPages) return res.status(400).json({ error: 'Bu kitabı bitirdiniz!' });
      const yeniToplam = tracking.readPages + eklenecekSayfa;
      if (yeniToplam > book.totalPages || yeniToplam < 0) return res.status(400).json({ error: 'Geçersiz sayfa!' });

      tracking = await prisma.studentBookTracking.update({
        where: { id: tracking.id },
        data: { readPages: yeniToplam, isCompleted: yeniToplam === book.totalPages }
      });
    } else {
      if (eklenecekSayfa > book.totalPages) return res.status(400).json({ error: 'Toplamı aşamazsınız!' });
      tracking = await prisma.studentBookTracking.create({
        data: { studentId, bookId, readPages: eklenecekSayfa, isCompleted: eklenecekSayfa === book.totalPages }
      });
    }

    if (eklenecekSayfa !== 0) {
      await prisma.readingLog.create({ data: { trackingId: tracking.id, pagesRead: eklenecekSayfa, date: islemTarihi } });
    }
    res.json(tracking);
  } catch (error) { next(error); }
});

// 4. Kurumun Devam Eden Okuma Takibini Getirme
router.get('/book-tracking/:institutionId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    if (!await HierarchyService.assertOwnsInstitution(req.user, req.params.institutionId)) {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const trackings = await prisma.studentBookTracking.findMany({
      where: { student: { institutionId: req.params.institutionId }, isCompleted: false },
      include: { book: true } 
    });
    res.json(trackings);
  } catch (error) { next(error); }
});

// 5. Tamamlanan Okumaları (Rozetleri) Getirme
router.get('/book-tracking/completed/:institutionId/:year/:month', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { institutionId, year, month } = req.params;
    
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const targetY = parseInt(year), targetM = parseInt(month);

    const trackings = await prisma.studentBookTracking.findMany({
      where: { student: { institutionId }, isCompleted: true },
      include: { book: true, logs: { orderBy: { date: 'desc' }, take: 1 } } 
    });

    const filteredBooks = trackings.filter(t => {
      const islemTarihi = t.logs[0] ? t.logs[0].date : t.createdAt;
      const islemYili = islemTarihi.getFullYear(), islemAyi = islemTarihi.getMonth() + 1;
      
      if (t.readPages >= t.book.totalPages) return islemYili === targetY && islemAyi === targetM;
      return targetY > islemYili || (targetY === islemYili && targetM >= islemAyi);
    });
    res.json(filteredBooks);
  } catch (error) { next(error); }
});

// 6. Okumayı Yarım Bırakma (Dondurma)
router.post('/book-tracking/pause', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(pauseTrackingSchema), async (req, res, next) => {
  try {
    const { studentId, targetMonth } = req.body; 
    
    if (!await HierarchyService.assertOwnsStudent(req.user, studentId)) {
      return res.status(403).json({ error: 'Yetkisiz işlem.' });
    }

    const tracking = await prisma.studentBookTracking.findFirst({ where: { studentId, isCompleted: false } });
    if (tracking) {
      await prisma.studentBookTracking.update({ where: { id: tracking.id }, data: { isCompleted: true } });
      if (targetMonth) {
        const [yil, ay] = targetMonth.split('-');
        await prisma.readingLog.create({
          data: { trackingId: tracking.id, pagesRead: 0, date: new Date(parseInt(yil), parseInt(ay) - 1, 15, 12, 0, 0) }
        });
      }
    }
    res.json({ mesaj: 'Kitap yarım bırakıldı.' });
  } catch (error) { next(error); }
});

// 7. Aylık Kitap İstatistikleri
router.get('/book-stats/:institutionId/:year/:month', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { institutionId, year, month } = req.params;
    
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 1); 

    const trackings = await prisma.studentBookTracking.findMany({
      where: { student: { institutionId } },
      include: { book: true, logs: { where: { date: { gte: startDate, lt: endDate } } } }
    });

    const aylikVeriler = trackings.map(kayit => ({
      ...kayit, buAyOkunan: kayit.logs.reduce((top, log) => top + log.pagesRead, 0)
    }));
    res.json(aylikVeriler);
  } catch (error) { next(error); }
});

module.exports = router;