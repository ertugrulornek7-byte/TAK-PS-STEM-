const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: KİTAP VE OKUMA TAKİBİ (SAYFA 3)
// ==========================================

router.post('/books', async (req, res) => {
  try {
    const { title, totalPages, institutionId } = req.body;
    const existingBook = await prisma.book.findFirst({
      where: { title, totalPages, institutionId }
    });
    if (existingBook) return res.status(400).json({ error: 'Bu kitap kütüphanenizde zaten mevcut!' });

    const book = await prisma.book.create({ data: { title, totalPages, institutionId } });
    res.json(book);
  } catch (error) { res.status(500).json({ error: 'Kitap eklenemedi.' }); }
});

router.get('/books/:institutionId', async (req, res) => {
  try {
    const books = await prisma.book.findMany({ where: { institutionId: req.params.institutionId } });
    res.json(books);
  } catch (error) { res.status(500).json({ error: 'Kitaplar getirilemedi.' }); }
});

router.post('/book-tracking', async (req, res) => {
  try {
    const { studentId, bookId, readPages, targetMonth } = req.body; 
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
  } catch (error) { res.status(500).json({ error: 'Okuma kaydı güncellenemedi.' }); }
});

router.get('/book-tracking/:institutionId', async (req, res) => {
  try {
    const trackings = await prisma.studentBookTracking.findMany({
      where: { student: { institutionId: req.params.institutionId }, isCompleted: false },
      include: { book: true } 
    });
    res.json(trackings);
  } catch (error) { res.status(500).json({ error: 'Okuma durumları getirilemedi.' }); }
});

router.get('/book-tracking/completed/:institutionId/:year/:month', async (req, res) => {
  try {
    const { institutionId, year, month } = req.params;
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
  } catch (error) { res.status(500).json({ error: 'Rozetler getirilemedi.' }); }
});

router.post('/book-tracking/pause', async (req, res) => {
  try {
    const { studentId, targetMonth } = req.body; 
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
  } catch (error) { res.status(500).json({ error: 'İşlem başarısız.' }); }
});

router.get('/book-stats/:institutionId/:year/:month', async (req, res) => {
  try {
    const { institutionId, year, month } = req.params;
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
  } catch (error) { res.status(500).json({ error: 'Aylık istatistikler getirilemedi.' }); }
});

module.exports = router;