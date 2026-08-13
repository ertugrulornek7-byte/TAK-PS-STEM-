const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const HierarchyService = require('../services/hierarchyService');
const { generateFromTemplate } = require('../services/schedulerService');

router.use(authenticate);

const templateSchema = z.object({
  body: z.object({
    title: z.string({ required_error: 'Başlık zorunludur' }).min(3),
    description: z.string().optional(),
    moduleType: z.enum(['YOKLAMA', 'KITAP', 'MUFREDAT', 'PERFORMANS', 'YOY', 'DENEME', 'KDU', 'GENEL']),
    recurrence: z.enum(['HAFTALIK', 'AYLIK']),
    dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
    dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
    deadlineHour: z.number().int().min(0).max(23).default(15),
    deadlineMinute: z.number().int().min(0).max(59).default(0),
    institutionId: z.string().uuid().optional().nullable(),
    districtId: z.string().uuid().optional().nullable(),
    regionId: z.string().uuid().optional().nullable()
  })
});

// ==========================================
// 1. KAPSAMDAKİ ŞABLONLARI LİSTELE
// ==========================================
router.get('/', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const role = req.user.roleLevel;
    let where = { createdById: req.user.id }; // varsayılan: sadece kendi oluşturduklarını görsün

    // Üst makamlar, kendi kapsamındaki TÜM şablonları da görebilsin (sadece kendi oluşturdukları değil)
    if (role === 'SISTEM') where = {};
    else if (role === 'BOLGE' && req.user.managedRegion) where = { regionId: req.user.managedRegion.id };
    else if (role === 'MINTIKA' && req.user.managedDistrict) where = { districtId: req.user.managedDistrict.id };
    else if (role === 'KURUM') where = { institutionId: req.user.institutionId };

    const templates = await prisma.taskTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true } } }
    });
    res.json(templates);
  } catch (error) { next(error); }
});

// ==========================================
// 2. YENİ ŞABLON OLUŞTUR
// ==========================================
router.post('/', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(templateSchema), async (req, res, next) => {
  try {
    const role = req.user.roleLevel;
    const { title, description, moduleType, recurrence, dayOfWeek, dayOfMonth, deadlineHour, deadlineMinute } = req.body;
    let { institutionId, districtId, regionId } = req.body;

    // 🔥 GÜVENLİK: Kapsam alanları (institutionId/districtId/regionId) kullanıcının
    // GERÇEK yetki alanıyla eşleştiriliyor — body'den gelen değerlere körü körüne
    // güvenilmiyor. KURUM sadece kendi kurumu için, MINTIKA sadece kendi mıntıkası
    // için, BOLGE sadece kendi bölgesi için şablon oluşturabilir.
    if (role === 'KURUM') {
      institutionId = req.user.institutionId; districtId = null; regionId = null;
    } else if (role === 'MINTIKA') {
      if (institutionId && !await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
        return res.status(403).json({ error: 'Bu kurum yetki alanınızda değil.' });
      }
      if (!institutionId) { districtId = req.user.managedDistrict?.id || null; }
      regionId = null;
    } else if (role === 'BOLGE') {
      if (institutionId && !await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
        return res.status(403).json({ error: 'Bu kurum yetki alanınızda değil.' });
      }
      if (!institutionId && !districtId) { regionId = req.user.managedRegion?.id || null; }
    }
    // SISTEM: body'de ne gelmişse o kullanılır (serbest)

    const template = await prisma.taskTemplate.create({
      data: {
        title, description, moduleType, recurrence,
        dayOfWeek: dayOfWeek ?? null,
        dayOfMonth: dayOfMonth ?? null,
        deadlineHour, deadlineMinute,
        institutionId: institutionId || null,
        districtId: districtId || null,
        regionId: regionId || null,
        createdById: req.user.id
      }
    });

    res.json(template);
  } catch (error) { next(error); }
});

// ==========================================
// 3. ŞABLONU GÜNCELLE (aktif/pasif yapma dahil)
// ==========================================
router.put('/:id', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const template = await prisma.taskTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: 'Şablon bulunamadı.' });
    if (req.user.roleLevel !== 'SISTEM' && template.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Sadece kendi oluşturduğunuz şablonu düzenleyebilirsiniz.' });
    }

    const { isActive, title, description, deadlineHour, deadlineMinute } = req.body;
    const updated = await prisma.taskTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(deadlineHour !== undefined ? { deadlineHour } : {}),
        ...(deadlineMinute !== undefined ? { deadlineMinute } : {})
      }
    });
    res.json(updated);
  } catch (error) { next(error); }
});

// ==========================================
// 4. ŞABLONU SİL
// ==========================================
router.delete('/:id', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const template = await prisma.taskTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: 'Şablon bulunamadı.' });
    if (req.user.roleLevel !== 'SISTEM' && template.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Sadece kendi oluşturduğunuz şablonu silebilirsiniz.' });
    }
    await prisma.taskTemplate.delete({ where: { id: req.params.id } });
    res.json({ message: 'Şablon silindi.' });
  } catch (error) { next(error); }
});

// ==========================================
// 5. ŞİMDİ ÜRET (test/manuel tetikleme)
// Normalde cron her gün otomatik kontrol eder; bu uç nokta, şablonu
// eklendikten hemen sonra test etmek isteyenler için "bu şablonun görevini
// şimdi üret" der — aynı periodKey için daha önce üretilmişse tekrar
// üretmez (schedulerService'teki tekilleştirme mantığı burada da geçerli).
// ==========================================
router.post('/:id/generate-now', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const template = await prisma.taskTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: 'Şablon bulunamadı.' });
    if (req.user.roleLevel !== 'SISTEM' && template.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Sadece kendi oluşturduğunuz şablonu tetikleyebilirsiniz.' });
    }

    const sonuc = await generateFromTemplate(template, { force: true });
    res.json(sonuc);
  } catch (error) { next(error); }
});

module.exports = router;