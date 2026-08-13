const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');
const { getIzleyici, desteklenenModuller } = require('../services/moduleTrackers');
const { weeklyPeriodKey, periodBounds } = require('../services/periodUtils');
const { gecikmeHesapla } = require('../services/gecikmeUtils');

router.use(authenticate);

// Hangi modüller için otomatik analiz mevcut? (Frontend'in dropdown'ı bunu okur)
router.get('/desteklenen-moduller', (req, res) => {
  res.json(desteklenenModuller());
});

// ==========================================
// HİYERARŞİK KULLANIM ANALİZİ
//
// GET /api/analytics/module-usage?moduleType=YOKLAMA&period=2026-W33&groupBy=institution
//
// groupBy:
//   - 'institution' (varsayılan): kapsamdaki her KURUM için bir satır.
//     MINTIKA -> kendi kurumları, BOLGE -> kendi bölgesindeki tüm kurumlar,
//     SISTEM -> tüm kurumlar (hepsi HierarchyService.getInstitutionFilter
//     üzerinden otomatik belirlenir, ayrıca kod yazmaya gerek yok).
//   - 'district': kapsamdaki her MINTIKA için özet bir satır (kurumların
//     toplamı). Özellikle BOLGE/SISTEM için anlamlı.
//   - 'personnel': TEK BİR kurumun (institutionId zorunlu) her PERSONELİ
//     için bir satır — o personelin sorumlu olduğu sınıflardaki öğrenciler
//     baz alınır.
// ==========================================
router.get('/module-usage', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const { moduleType, groupBy } = req.query;
    if (!moduleType) return res.status(400).json({ error: 'moduleType zorunludur.' });

    const izleyici = getIzleyici(moduleType);
    if (!izleyici) {
      return res.status(400).json({
        error: `'${moduleType}' için otomatik takip henüz desteklenmiyor. Desteklenenler: ${desteklenenModuller().join(', ')}`
      });
    }

    const periodKey = req.query.period || weeklyPeriodKey();
    let start, end;
    try {
      ({ start, end } = periodBounds(periodKey));
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // ---------- PERSONEL BAZLI ----------
    if (groupBy === 'personnel') {
      const { institutionId } = req.query;
      if (!institutionId) return res.status(400).json({ error: 'Personel bazlı görünüm için institutionId zorunludur.' });
      if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
        return res.status(403).json({ error: 'Bu kurumun verilerine erişim yetkiniz yok.' });
      }

      const personeller = await prisma.user.findMany({ where: { institutionId, roleLevel: 'PERSONEL' } });
      const satirlar = [];

      for (const p of personeller) {
        const sinifIdleri = p.managedClassIds || [];
        let studentIds = [];
        if (sinifIdleri.length > 0) {
          const ogrenciler = await prisma.student.findMany({
            where: { institutionId, classId: { in: sinifIdleri }, status: 'AKTIF' },
            select: { id: true }
          });
          studentIds = ogrenciler.map(o => o.id);
        }

        const sonuc = await izleyici(studentIds, start, end);
        const yuzde = sonuc.beklenenSayi > 0 ? Math.round((sonuc.tamamlananSayi / sonuc.beklenenSayi) * 100) : null;
        const gecikme = gecikmeHesapla(end, sonuc.tamamlananSayi >= sonuc.beklenenSayi ? sonuc.sonIslemTarihi : null);

        satirlar.push({
          personelId: p.id,
          personelAdi: p.fullName,
          sorumluSinifSayisi: sinifIdleri.length,
          tamamlananSayi: sonuc.tamamlananSayi,
          beklenenSayi: sonuc.beklenenSayi,
          tamamlananYuzde: yuzde,
          sonIslemTarihi: sonuc.sonIslemTarihi,
          gecikmeGunu: gecikme.geciktiMi ? gecikme.gunSayisi : 0
        });
      }

      satirlar.sort((a, b) => (a.tamamlananYuzde ?? -1) - (b.tamamlananYuzde ?? -1));
      return res.json({ moduleType, periodKey, periodStart: start, periodEnd: end, groupBy: 'personnel', satirlar });
    }

    // Kapsamdaki kurumlar (rol bazlı otomatik filtre)
    const institutionFilter = HierarchyService.getInstitutionFilter(req.user);
    const institutions = await prisma.institution.findMany({ where: institutionFilter, include: { district: true } });

    // ---------- MINTIKA BAZLI ÖZET ----------
    if (groupBy === 'district') {
      const gruplu = {};

      for (const inst of institutions) {
        const dKey = inst.districtId || 'atanmamis';
        const dAdi = inst.district?.name || 'Atanmamış';
        if (!gruplu[dKey]) gruplu[dKey] = { mintikaId: inst.districtId, mintikaAdi: dAdi, kurumSayisi: 0, toplamTamamlanan: 0, toplamBeklenen: 0, sonIslemTarihi: null };

        const ogrenciler = await prisma.student.findMany({ where: { institutionId: inst.id, status: 'AKTIF' }, select: { id: true } });
        const studentIds = ogrenciler.map(o => o.id);
        const sonuc = await izleyici(studentIds, start, end);

        gruplu[dKey].kurumSayisi++;
        gruplu[dKey].toplamTamamlanan += sonuc.tamamlananSayi;
        gruplu[dKey].toplamBeklenen += sonuc.beklenenSayi;
        if (sonuc.sonIslemTarihi && (!gruplu[dKey].sonIslemTarihi || sonuc.sonIslemTarihi > gruplu[dKey].sonIslemTarihi)) {
          gruplu[dKey].sonIslemTarihi = sonuc.sonIslemTarihi;
        }
      }

      const satirlar = Object.values(gruplu).map(g => ({
        ...g,
        tamamlananYuzde: g.toplamBeklenen > 0 ? Math.round((g.toplamTamamlanan / g.toplamBeklenen) * 100) : null
      }));
      satirlar.sort((a, b) => (a.tamamlananYuzde ?? -1) - (b.tamamlananYuzde ?? -1));
      return res.json({ moduleType, periodKey, periodStart: start, periodEnd: end, groupBy: 'district', satirlar });
    }

    // ---------- KURUM BAZLI (varsayılan) ----------
    const satirlar = [];
    for (const inst of institutions) {
      const ogrenciler = await prisma.student.findMany({ where: { institutionId: inst.id, status: 'AKTIF' }, select: { id: true } });
      const studentIds = ogrenciler.map(o => o.id);
      const sonuc = await izleyici(studentIds, start, end);
      const yuzde = sonuc.beklenenSayi > 0 ? Math.round((sonuc.tamamlananSayi / sonuc.beklenenSayi) * 100) : null;
      const gecikme = gecikmeHesapla(end, sonuc.tamamlananSayi >= sonuc.beklenenSayi ? sonuc.sonIslemTarihi : null);

      satirlar.push({
        kurumId: inst.id,
        kurumAdi: inst.name,
        mintikaAdi: inst.district?.name || null,
        tamamlananSayi: sonuc.tamamlananSayi,
        beklenenSayi: sonuc.beklenenSayi,
        tamamlananYuzde: yuzde,
        sonIslemTarihi: sonuc.sonIslemTarihi,
        gecikmeGunu: gecikme.geciktiMi ? gecikme.gunSayisi : 0
      });
    }

    satirlar.sort((a, b) => (a.tamamlananYuzde ?? -1) - (b.tamamlananYuzde ?? -1));
    res.json({ moduleType, periodKey, periodStart: start, periodEnd: end, groupBy: 'institution', kapsam: satirlar.length, satirlar });
  } catch (error) {
    next(error);
  }
});

module.exports = router;