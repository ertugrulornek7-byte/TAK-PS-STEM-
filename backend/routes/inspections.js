const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

// 🔥 GÜVENLİK KALKANLARI İÇERİ ALINIYOR
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const HierarchyService = require('../services/hierarchyService');

// DİKKAT: Bu dosyaya gelen tüm istekler Kimlik Kontrolünden geçmek zorundadır!
router.use(authenticate);
const prisma = new PrismaClient();

// ==========================================
// VERİ DOĞRULAMA ŞABLONLARI (ZOD)
// ==========================================
const inspectionSchema = z.object({
  body: z.object({
    institutionId: z.string().uuid("Geçersiz Kurum ID").optional().nullable(),
    inspectorRole: z.string().min(1, "Denetmen rolü zorunludur"),
    inspectorName: z.string().min(1, "Denetmen adı zorunludur"),
    inspectionDate: z.string().min(1, "Denetim tarihi zorunludur"),
    remarks: z.string().min(1, "Açıklama/Rapor boş olamaz")
  })
});

const fixStatusSchema = z.object({
  body: z.object({
    fixStatus: z.string().min(1, "Durum bilgisi zorunludur")
  })
});

// ==========================================
// ALT MODÜL: DENETİM VE TEFTİŞ (SAYFA 10)
// ==========================================

// 1. Yeni Denetim Raporu Ekle
router.post('/', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(inspectionSchema), async (req, res, next) => {
  try {
    const { institutionId, inspectorRole, inspectorName, inspectionDate, remarks } = req.body;
    const targetInstitution = institutionId || req.user.institutionId;

    // Hiyerarşi Kontrolü: Bu kuruma denetim raporu yazma yetkisi var mı?
    if (!await HierarchyService.assertOwnsInstitution(req.user, targetInstitution)) {
      return res.status(403).json({ error: 'Bu kuruma denetim ekleme yetkiniz yok.' });
    }

    const inspection = await prisma.inspection.create({
      data: { 
        institutionId: targetInstitution, 
        inspectorRole, 
        inspectorName, 
        inspectionDate: new Date(inspectionDate), 
        remarks 
      }
    });
    res.json(inspection);
  } catch (error) { next(error); }
});

// 2. Kurumun Denetim Geçmişini Getir
router.get('/:institutionId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    if (!await HierarchyService.assertOwnsInstitution(req.user, req.params.institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun denetimlerini görme yetkiniz yok.' });
    }

    const inspections = await prisma.inspection.findMany({
      where: { institutionId: req.params.institutionId },
      orderBy: { inspectionDate: 'desc' } 
    });
    res.json(inspections);
  } catch (error) { next(error); }
});

// 3. Denetim Durumunu (Giderildi vs.) Güncelle
router.put('/:id', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(fixStatusSchema), async (req, res, next) => {
  try {
    const { fixStatus } = req.body;

    // Önce denetim raporunu bul ve o kurumun bizim yetki alanımızda olup olmadığına bak
    const inspection = await prisma.inspection.findUnique({ where: { id: req.params.id } });
    if (!inspection) {
      return res.status(404).json({ error: 'Denetim raporu bulunamadı.' });
    }

    if (!await HierarchyService.assertOwnsInstitution(req.user, inspection.institutionId)) {
      return res.status(403).json({ error: 'Bu raporun durumunu güncelleme yetkiniz yok.' });
    }

    const updated = await prisma.inspection.update({
      where: { id: req.params.id },
      data: { fixStatus }
    });
    res.json(updated);
  } catch (error) { next(error); }
});

module.exports = router;