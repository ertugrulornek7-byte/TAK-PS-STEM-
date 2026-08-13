const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod'); // 🔥 Zod Kütüphanesi

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');
const validate = require('../middleware/validate'); // 🔥 Bekçimiz
const { resolveOrCreateInstitution } = require('../services/hierarchyProvisioningService');

router.use(authenticate);

// ==========================================
// ZOD ŞEMALARI (Kurallar Dizisi)
// ==========================================
const createStudentSchema = z.object({
  body: z.object({
    studentCode: z.string({ required_error: "Talebe numarası zorunludur" }).min(1, "Numara boş olamaz"),
    fullName: z.string({ required_error: "Ad Soyad zorunludur" }).min(2, "Ad Soyad en az 2 harf olmalıdır"),
    institutionId: z.string().uuid("Geçersiz Kurum ID formatı").optional().nullable(),
    classId: z.string().uuid("Geçersiz Sınıf ID formatı").optional().nullable(),
    orderIndex: z.number().int().optional().nullable()
  })
});

// ==========================================
// SINIF/SEVİYE ÇÖZÜMLEYİCİ
// TopluOgrenciEkle.vue'daki "sinifIdCozumle" ile birebir aynı mantık —
// Excel'de "7", "7.sınıf", "ortaokul 7" gibi serbest metinlerin hepsini
// sistemdeki sabit anahtarlardan (5_SINIF, 6_SINIF...) birine eşliyor.
// Fonksiyon kendi çıktısı üzerinde de çalışır (idempotent), yani frontend'in
// zaten normalize edip gönderdiği bir anahtarı ikinci kez normalize etmek
// güvenlidir — API'nin doğrudan çağrılması ihtimaline karşı bu bir güvenlik.
// ==========================================
function sinifCozumle(gelenSinif) {
  if (!gelenSinif) return null;
  const s = String(gelenSinif).toLowerCase().replace(/[\s._-]/g, '');

  if (s.includes('4') && s.includes('nehari')) return { key: '4_NEHARI', label: '4. Sınıf Nehari' };
  if (s.includes('8') && s.includes('nehari')) return { key: '8_NEHARI', label: '8. Sınıf Nehari' };

  if (s.includes('lise1') || s === 'l1' || s.includes('9')) return { key: 'LISE_1', label: 'Lise 1' };
  if (s.includes('lise2') || s === 'l2' || s.includes('10')) return { key: 'LISE_2', label: 'Lise 2' };
  if (s.includes('lise3') || s === 'l3' || s.includes('11')) return { key: 'LISE_3', label: 'Lise 3' };

  if (s.includes('5')) return { key: '5_SINIF', label: '5. Sınıf' };
  if (s.includes('6')) return { key: '6_SINIF', label: '6. Sınıf' };
  if (s.includes('7')) return { key: '7_SINIF', label: '7. Sınıf' };
  if (s.includes('8')) return { key: '8_SINIF', label: '8. Sınıf' };

  return null;
}

// ==========================================
// 1. TALEBELERİ GETİR (SAYFALAMA İLE)
// ==========================================
router.get('/', async (req, res, next) => {
  try {
    let whereFilter = HierarchyService.getStudentFilter(req.user);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const { institutionId, search } = req.query;

    if (institutionId) {
      whereFilter = { AND: [whereFilter, { institutionId }] };
    }

    if (search) {
      whereFilter = {
        AND: [
          whereFilter,
          { fullName: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const [students, totalCount] = await Promise.all([
      prisma.student.findMany({
        where: whereFilter,
        orderBy: [{ status: 'asc' }, { orderIndex: 'asc' }],
        include: { institution: true },
        skip: skip,
        take: limit
      }),
      prisma.student.count({ where: whereFilter })
    ]);

    res.json({
      data: students,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. TEKLİ TALEBE EKLEME
// ==========================================
router.post('/', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(createStudentSchema), async (req, res) => {
  try {
    const { studentCode, fullName, institutionId, classId, orderIndex } = req.body;

    const targetInstitution = institutionId || req.user.institutionId;
    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Sadece yetkili olduğunuz kuruma işlem yapabilirsiniz.' });
    }
    if (!targetInstitution) return res.status(400).json({ error: 'Kurum tespit edilemedi!' });

    const newStudent = await prisma.student.create({
      data: {
        studentCode,
        fullName,
        institutionId: targetInstitution,
        orderIndex: orderIndex || 999,
        classId: classId || null
      }
    });
    res.json(newStudent);
  } catch (error) {
    console.error("Talebe Ekleme Hatası:", error);
    res.status(500).json({ error: 'Talebe eklenemedi.' });
  }
});

// ==========================================
// 3. AKILLI TOPLU TALEBE YÜKLEME (EXCEL) — YENİDEN YAZILDI
//
// Değişenler:
// - Kimlik No (nationalId) ve Talebe Türü (studentType) artık gerçekten
//   kaydediliyor (önceden şemada yer yoktu, sessizce kayboluyordu).
// - Okul Seviyesi artık gerçek bir Class kaydına (institutionId + level)
//   bağlanıyor — sadece bir metin olarak durmuyor.
// - Kurum kodu artık Institution.code alanına yazılıyor (önceden isme
//   [KOD] şeklinde gömülüyordu, aranması/eşleşmesi kırılgandı). Bir kuruma
//   ait İLK kayıt hangi kodu taşıyorsa, kurumun kalıcı kodu o olur.
// - "Var mı" kontrolü artık sadece studentCode değil; kimlik no ve
//   (ad soyad + kurum) eşleşmesiyle de yapılıyor — istenen davranış
//   TAM OLARAK BUYDU: "aynı kodda veya aynı isim soyisimde satırı atla".
//   Önceki "upsert" davranışı (var olanı sessizce güncelleme) kaldırıldı;
//   artık var olan bir kayıt tespit edilirse o satır ATLANIYOR, ezilmiyor.
// - Hiyerarşi otomatik oluşturma artık yükleyenin GERÇEK yetki sınırına
//   göre yapılıyor (bkz. hierarchyProvisioningService.js) — önceden her
//   üst makam (MINTIKA dahil) Excel'e istediği bölge/mıntıka adını yazarak
//   sistemin herhangi bir yerinde yeni birim oluşturabiliyordu.
// - Sonuç artık sadece bir sayı değil, satır satır dökümle dönüyor.
// ==========================================
router.post('/bulk', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const { studentsData } = req.body;
    const role = req.user.roleLevel;

    let eklenen = 0, atlanan = 0, hatali = 0;
    const detaylar = [];

    for (const data of studentsData) {
      const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();

      if (!data.studentCode || !fullName) {
        hatali++;
        detaylar.push({ satir: fullName || data.studentCode || '(bilinmiyor)', sonuc: 'HATA', mesaj: 'Talebe Kodu veya Ad Soyad eksik' });
        continue;
      }

      // 1. Hedef kurumu bul / oluştur (yetki sınırına göre)
      let targetInstitutionId;
      try {
        targetInstitutionId = await resolveOrCreateInstitution({
          role,
          user: req.user,
          bolgeAdi: data.bolge,
          mintikaAdi: data.mintika,
          kurumAdi: data.kurum,
          kurumKodu: data.kurumKodu,
          nevi: data.nevi
        });
      } catch (e) {
        hatali++;
        detaylar.push({ satir: fullName, sonuc: 'HATA', mesaj: e.message });
        continue;
      }

      if (!targetInstitutionId || !await HierarchyService.assertOwnsInstitution(req.user, targetInstitutionId)) {
        atlanan++;
        detaylar.push({ satir: fullName, sonuc: 'ATLANDI', mesaj: 'Kurum belirlenemedi veya bu kurum yetki alanınızda değil' });
        continue;
      }

      // 2. Aynı kişi zaten kayıtlı mı? (kod / kimlik no / ad-soyad+kurum)
      const temizKimlik = data.kimlikNo ? String(data.kimlikNo).trim() : null;
      const orFiltre = [{ studentCode: data.studentCode }];
      if (temizKimlik) orFiltre.push({ nationalId: temizKimlik });
      orFiltre.push({ fullName, institutionId: targetInstitutionId });

      const mevcut = await prisma.student.findFirst({ where: { OR: orFiltre } });
      if (mevcut) {
        atlanan++;
        detaylar.push({ satir: fullName, sonuc: 'ATLANDI', mesaj: 'Bu talebe zaten kayıtlı (kod/kimlik/isim eşleşti)' });
        continue;
      }

      // 3. Sınıf/seviye çözümle, gerçek bir Class kaydına bağla
      let classId = null;
      const seviye = sinifCozumle(data.classId);
      if (seviye) {
        let klas = await prisma.class.findFirst({ where: { institutionId: targetInstitutionId, level: seviye.key } });
        if (!klas) {
          klas = await prisma.class.create({ data: { institutionId: targetInstitutionId, level: seviye.key, name: seviye.label } });
        }
        classId = klas.id;
      }

      // 4. Talebeyi oluştur
      await prisma.student.create({
        data: {
          studentCode: data.studentCode,
          fullName,
          institutionId: targetInstitutionId,
          nationalId: temizKimlik,
          studentType: data.talebeTuru || null,
          classId,
          orderIndex: 999
        }
      });

      eklenen++;
      detaylar.push({ satir: fullName, sonuc: 'EKLENDI' });
    }

    res.json({ success: true, eklenen, atlanan, hatali, detaylar });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 4. AKILLI SİLME VE GÜVENLİK LOGU
// ==========================================
router.delete('/:id', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const sId = req.params.id;
    const role = req.user.roleLevel;

    const student = await prisma.student.findUnique({
      where: { id: sId },
      include: { institution: { include: { district: true } } }
    });

    if (!student) return res.status(404).json({ error: 'Talebe bulunamadı.' });

    if (role === 'KURUM') {
      await prisma.student.update({ where: { id: sId }, data: { status: 'PASIF' } });

      await prisma.auditLog.create({
        data: { userId: req.user.id, action: 'SOFT_DELETE', targetType: 'Student', targetId: sId, before: JSON.stringify(student) }
      });

      const mintikaManagerId = student.institution.district?.managerId;
      if (mintikaManagerId) {
        const notifyTask = await prisma.task.create({
          data: {
            title: '⚠️ Talebe Silme Onayı Bekliyor',
            description: `${student.institution.name} kurumundan ${student.fullName} adlı talebe pasife alındı.`,
            status: 'BEKLIYOR',
            moduleType: 'GENEL',
            senderId: req.user.id,
            institutionId: student.institutionId
          }
        });

        await prisma.taskAssignment.create({
          data: { taskId: notifyTask.id, userId: mintikaManagerId }
        });
      }
      return res.json({ message: 'Talebe pasife alındı.' });
    }

    if (['MINTIKA', 'BOLGE', 'SISTEM'].includes(role)) {
      await prisma.attendance.deleteMany({ where: { studentId: sId } });
      await prisma.studentBookTracking.deleteMany({ where: { studentId: sId } });
      await prisma.performanceGrade.deleteMany({ where: { studentId: sId } });
      await prisma.preExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.mockExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.testBookResult.deleteMany({ where: { studentId: sId } });
      await prisma.student.delete({ where: { id: sId } });

      await prisma.auditLog.create({
        data: { userId: req.user.id, action: 'HARD_DELETE', targetType: 'Student', targetId: sId, before: JSON.stringify(student) }
      });

      return res.json({ message: 'Talebe kalıcı olarak silindi.' });
    }
  } catch (error) {
    console.error("Öğrenci silme hatası:", error);
    res.status(500).json({ error: 'İşlem başarısız.' });
  }
});

module.exports = router;