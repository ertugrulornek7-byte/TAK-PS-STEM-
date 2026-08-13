const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * MODÜL İZLEYİCİ DESENİ
 *
 * Her izleyici aynı imzaya sahiptir:
 *   async (studentIds: string[], periodStart: Date, periodEnd: Date)
 *     => { tamamlananSayi, beklenenSayi, sonIslemTarihi }
 *
 * studentIds çağıran tarafından hazırlanır (kurumun tüm aktif öğrencileri,
 * ya da bir personelin sorumlu olduğu sınıfların öğrencileri gibi) — bu
 * sayede aynı izleyici hem kurum bazlı hem personel bazlı analizde
 * değişiklik yapılmadan kullanılabiliyor.
 *
 * ÖNEMLİ SINIRLAMA: Şu an sadece YOKLAMA, KITAP, PERFORMANS modülleri için
 * izleyici var — çünkü sadece bunların şemasında "ne zaman yapıldı" bilgisi
 * (tarih alanı) mevcut. MUFREDAT, YOY, DENEME, KDU modüllerinin şemasında
 * henüz dönem/tarih bilgisi yok — bu modüller için otomatik izleme eklemek
 * istersen önce ilgili modelin şemasına bir tarih alanı eklenmesi gerekiyor
 * (bkz. yol haritası Faz 4.2 notları).
 */

async function yoklamaIzleyici(studentIds, periodStart, periodEnd) {
  if (studentIds.length === 0) return { tamamlananSayi: 0, beklenenSayi: 0, sonIslemTarihi: null };

  const kayitlar = await prisma.attendance.findMany({
    where: { studentId: { in: studentIds }, date: { gte: periodStart, lte: periodEnd } },
    select: { studentId: true, date: true },
    orderBy: { date: 'desc' }
  });

  const tekilOgrenciSayisi = new Set(kayitlar.map(k => k.studentId)).size;
  return {
    tamamlananSayi: tekilOgrenciSayisi,
    beklenenSayi: studentIds.length,
    sonIslemTarihi: kayitlar.length > 0 ? kayitlar[0].date : null
  };
}

async function kitapIzleyici(studentIds, periodStart, periodEnd) {
  if (studentIds.length === 0) return { tamamlananSayi: 0, beklenenSayi: 0, sonIslemTarihi: null };

  // Not: StudentBookTracking'in kendisinde tarih yok, ama alt kaydı olan
  // ReadingLog'da var — "bu dönemde en az bir okuma günlüğü girmiş mi" sorusu
  // bu yüzden ReadingLog üzerinden soruluyor.
  const loglar = await prisma.readingLog.findMany({
    where: {
      date: { gte: periodStart, lte: periodEnd },
      tracking: { studentId: { in: studentIds } }
    },
    select: { date: true, tracking: { select: { studentId: true } } },
    orderBy: { date: 'desc' }
  });

  const tekilOgrenciSayisi = new Set(loglar.map(l => l.tracking.studentId)).size;
  return {
    tamamlananSayi: tekilOgrenciSayisi,
    beklenenSayi: studentIds.length,
    sonIslemTarihi: loglar.length > 0 ? loglar[0].date : null
  };
}

async function performansIzleyici(studentIds, periodStart, periodEnd) {
  if (studentIds.length === 0) return { tamamlananSayi: 0, beklenenSayi: 0, sonIslemTarihi: null };

  const notlar = await prisma.performanceGrade.findMany({
    where: { studentId: { in: studentIds }, weekStartDate: { gte: periodStart, lte: periodEnd } },
    select: { studentId: true, weekStartDate: true },
    orderBy: { weekStartDate: 'desc' }
  });

  const tekilOgrenciSayisi = new Set(notlar.map(n => n.studentId)).size;
  return {
    tamamlananSayi: tekilOgrenciSayisi,
    beklenenSayi: studentIds.length,
    sonIslemTarihi: notlar.length > 0 ? notlar[0].weekStartDate : null
  };
}

const izleyiciler = {
  YOKLAMA: yoklamaIzleyici,
  KITAP: kitapIzleyici,
  PERFORMANS: performansIzleyici
};

function getIzleyici(moduleType) {
  return izleyiciler[moduleType] || null;
}

function desteklenenModuller() {
  return Object.keys(izleyiciler);
}

module.exports = { getIzleyici, desteklenenModuller };