const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const HierarchyService = require('../services/hierarchyService');
const TaskService = require('../services/taskService'); // 🔥 Servisimiz eklendi

router.use(authenticate);

const proofSchema = z.object({
  body: z.object({
    description: z.string().optional(),
    photoUrl: z.string().url("Geçersiz URL").optional().or(z.literal(''))
  })
});

const assignSmartSchema = z.object({
  body: z.object({
    title: z.string({ required_error: "Görev başlığı zorunludur" }).min(3, "Başlık çok kısa"),
    description: z.string().optional(),
    moduleType: z.string().optional(),
    targetDistrictId: z.string().uuid("Geçersiz ID").optional().or(z.literal('')),
    targetInstitutionId: z.string().uuid("Geçersiz ID").optional().or(z.literal('')),
    targetType: z.string().optional(),
    targetRoleId: z.string().optional(),
    targetUserId: z.string().uuid("Geçersiz Personel ID").optional().or(z.literal('')),
    targetClassId: z.string().optional().or(z.literal('')),
    deadline: z.string().datetime({ message: "Geçersiz tarih formatı" }).optional().nullable() // 🔥 Tarih eklendi
  })
});

// 1. PERSONELİN KENDİ GÖREVLERİNİ GÖRMESİ
router.get('/my-tasks', async (req, res, next) => {
  try {
    const assignments = await prisma.taskAssignment.findMany({
      where: { userId: req.user.id },
      include: { task: true }
    });

    if (assignments.length === 0) return res.json([]);

    const taskIds = assignments.map(a => a.taskId);
    let allProofs = [];
    try {
      allProofs = await prisma.taskProof.findMany({
        where: { taskId: { in: taskIds }, userId: req.user.id }
      });
    } catch (e) { console.log("Kanıtlar çekilemedi", e.message); }

    const result = assignments.map(a => ({
      ...a,
      proofs: allProofs
        .filter(p => p.taskId === a.taskId)
        .map(p => ({ ...p, description: p.note, photoUrl: p.imageUrl }))
    })).reverse();

    res.json(result);
  } catch (error) { next(error); }
});

// 2. KANIT YÜKLEME (İşlem TaskService'e devredildi)
router.post('/proof/:assignmentId', validate(proofSchema), async (req, res, next) => {
  try {
    const proof = await TaskService.uploadProof(
      req.params.assignmentId, 
      req.user.id, 
      req.body.description, 
      req.body.photoUrl
    );
    res.json({ message: 'Kanıt yüklendi.', proof });
  } catch (error) { next(error); }
});

// 3. KURUM GÖREVLERİNİ LİSTELEME
router.get('/institution/:institutionId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const hasAccess = await HierarchyService.assertOwnsInstitution(req.user, institutionId);
    if (!hasAccess) return res.status(403).json({ error: 'Yetkiniz yok.' });

    const tasks = await prisma.task.findMany({
      where: { institutionId },
      include: {
        assignments: { include: { user: { select: { id: true, fullName: true, roleLevel: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
    // Not: Normalde burada da proofs birleştirilir
    res.json(tasks);
  } catch (error) { next(error); }
});

// 4. GÖREV ATAMA MOTORU (İşlem TaskService'e devredildi)
router.post('/assign-smart', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(assignSmartSchema), async (req, res, next) => {
  try {
    const { targetInstitutionId, targetDistrictId, targetType, targetUserId, targetRoleId, targetClassId } = req.body;
    let userFilter = {};
    let finalInstitutionId = targetInstitutionId || req.user.institutionId;

    if (targetType === 'TEK_PERSONEL' && targetUserId) userFilter.id = targetUserId;
    else if (targetType === 'ROL_BAZLI' && targetRoleId) userFilter.roleLevel = targetRoleId;
    else if (targetType === 'SINIF_BAZLI' && targetClassId) userFilter.managedClassIds = { has: targetClassId };

    const targetUsers = await prisma.user.findMany({ where: userFilter });
    const result = await TaskService.assignSmart(req.body, req.user, finalInstitutionId, targetUsers);
    
    res.json({ message: 'Görev başarıyla oluşturuldu ve atandı.', ...result });
  } catch (error) { next(error); }
});

// ==========================================
// 5. GECİKEN GÖREVLERİ LİSTELE (Yöneticiler İçin)
// ==========================================
router.get('/gecikenler', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res, next) => {
  try {
    const role = req.user.roleLevel;
    let taskFilter = {};

    // 1. Yönetici sadece kendi yetki alanındaki gecikenleri görebilir
    if (role === 'KURUM') {
      taskFilter.institutionId = req.user.institutionId;
    } else if (role === 'MINTIKA') {
      taskFilter.institution = { districtId: req.user.districtId };
    } else if (role === 'BOLGE') {
      taskFilter.institution = { district: { regionId: req.user.managedRegion?.id } };
    }
    // SISTEM rolü için filtre boş kalır, tüm gecikenleri görür.

    // 2. Süresi geçmiş ve durumu TAMAMLANDI olmayan atamaları çek
    const gecikenAtamalar = await prisma.taskAssignment.findMany({
      where: {
        status: { not: 'TAMAMLANDI' },
        task: {
          deadline: { lt: new Date() }, // Son tarih şu andan küçük (geçmiş)
          ...taskFilter
        }
      },
      include: {
        task: true,
        user: { select: { id: true, fullName: true, roleLevel: true } }
      },
      orderBy: { task: { deadline: 'asc' } } // En çok gecikenden en aza doğru sırala
    });

    res.json(gecikenAtamalar);
  } catch (error) {
    next(error);
  }
});

module.exports = router;