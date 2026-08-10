const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod'); // 🔥 Zod eklendi
const validate = require('../middleware/validate'); // 🔥 Bekçimiz eklendi

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HierarchyService = require('../services/hierarchyService');

router.use(authenticate);

// ==========================================
// ZOD ŞEMALARI
// ==========================================
const proofSchema = z.object({
  body: z.object({
    description: z.string().optional(),
    photoUrl: z.string().url("Geçersiz URL formatı").optional().or(z.literal(''))
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
    targetClassId: z.string().optional().or(z.literal(''))
  })
});

// ==========================================
// 1. PERSONELİN KENDİ GÖREVLERİNİ GÖRMESİ
// ==========================================
router.get('/my-tasks', async (req, res) => {
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
    } catch (e) { console.log("Kanıtlar çekilirken uyarı:", e.message); }

    const result = assignments.map(a => ({
      ...a,
      proofs: allProofs
        .filter(p => p.taskId === a.taskId)
        .map(p => ({ ...p, description: p.note, photoUrl: p.imageUrl }))
    })).reverse();

    res.json(result);
  } catch (error) {
    console.error("Benim görevlerim hatası:", error.message);
    res.status(500).json({ error: 'Görevler getirilemedi.' });
  }
});

// ==========================================
// 2. GÖREVE KANIT (PROOF) YÜKLEME (🔥 BEKÇİ EKLENDİ)
// ==========================================
router.post('/proof/:assignmentId', validate(proofSchema), async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { description, photoUrl } = req.body;

    const assignment = await prisma.taskAssignment.findUnique({ 
      where: { id: assignmentId } 
    });

    if (!assignment || assignment.userId !== req.user.id) {
      return res.status(403).json({ error: 'Bu görev size atanmamış.' });
    }

    const proof = await prisma.taskProof.create({
      data: {
        note: description || '',
        imageUrl: photoUrl || null,
        task: { connect: { id: assignment.taskId } },
        user: { connect: { id: req.user.id } }
      }
    });

    try {
      await prisma.taskAssignment.update({
        where: { id: assignmentId },
        data: { status: 'ONAY_BEKLIYOR' }
      });
    } catch (e) { console.log("TaskAssignment status güncellenemedi, atlandı."); }

    res.json({ message: 'Kanıt yüklendi.', proof });
  } catch (error) {
    console.error("Kanıt yükleme hatası:", error.message);
    res.status(500).json({ error: 'Kanıt yüklenemedi.' });
  }
});

// ==========================================
// 3. YÖNETİCİLER İÇİN KURUM GÖREVLERİNİ LİSTELEME
// ==========================================
router.get('/institution/:institutionId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), async (req, res) => {
  try {
    const { institutionId } = req.params;

    if (!HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun görevlerini görme yetkiniz yok.' });
    }

    const tasks = await prisma.task.findMany({
      where: { institutionId },
      include: {
        assignments: {
          include: { user: { select: { id: true, fullName: true, roleLevel: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (tasks.length === 0) return res.json([]);

    const taskIds = tasks.map(t => t.id);
    let allProofs = [];
    
    try {
      allProofs = await prisma.taskProof.findMany({
        where: { taskId: { in: taskIds } }
      });
    } catch (e) {}

    const result = tasks.map(t => ({
      ...t,
      assignments: t.assignments ? t.assignments.map(a => ({
        ...a,
        proofs: allProofs
          .filter(p => p.taskId === a.taskId && p.userId === a.userId)
          .map(p => ({ ...p, description: p.note, photoUrl: p.imageUrl }))
      })) : []
    }));

    res.json(result);
  } catch (error) {
    console.error("Kurum görevleri hatası:", error.message);
    res.status(500).json({ error: 'Kurum görevleri getirilemedi.' });
  }
});

// ==========================================
// 4. KADEMELİ VE GELİŞMİŞ FİLTRELİ GÖREV ATAMA (🔥 BEKÇİ EKLENDİ)
// ==========================================
router.post('/assign-smart', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(assignSmartSchema), async (req, res) => {
  try {
    const { 
      title, description, moduleType, 
      targetDistrictId, targetInstitutionId, targetType, targetRoleId, targetUserId, targetClassId 
    } = req.body;

    const role = req.user.roleLevel;
    let userFilter = {};
    let finalInstitutionId = null;

    if (role === 'BOLGE') {
      if (targetInstitutionId) {
        userFilter.institutionId = targetInstitutionId;
        finalInstitutionId = targetInstitutionId;
      } else if (targetDistrictId) {
        userFilter.districtId = targetDistrictId;
      } else {
        userFilter.district = { regionId: req.user.managedRegion?.id };
      }
    } else if (role === 'MINTIKA') {
      if (targetInstitutionId) {
        userFilter.institutionId = targetInstitutionId;
        finalInstitutionId = targetInstitutionId;
      } else {
        userFilter.districtId = req.user.managedDistrict?.id;
      }
    } else if (role === 'KURUM') {
      userFilter.institutionId = req.user.institutionId;
      finalInstitutionId = req.user.institutionId;
    }

    if (finalInstitutionId && !HierarchyService.assertOwnsInstitution(req.user, finalInstitutionId)) {
      return res.status(403).json({ error: 'Bu kuruma görev atama yetkiniz yok.' });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        moduleType: moduleType || 'GENEL',
        status: 'BEKLIYOR',
        institutionId: finalInstitutionId,
        senderId: req.user.id
      }
    });

    if (targetType === 'TEK_PERSONEL' && targetUserId) {
      userFilter.id = targetUserId;
    } else if (targetType === 'ROL_BAZLI' && targetRoleId) {
      userFilter.roleLevel = targetRoleId;
    } else if (targetType === 'SINIF_BAZLI' && targetClassId) {
      userFilter.managedClassIds = { has: targetClassId }; 
    }

    const targetUsers = await prisma.user.findMany({ where: userFilter });

    if (targetUsers.length > 0) {
      const assignments = targetUsers.map(u => ({
        taskId: task.id,
        userId: u.id
      }));
      await prisma.taskAssignment.createMany({ data: assignments });
    }

    res.json({ message: 'Görev başarıyla oluşturuldu ve atandı.', task, userCount: targetUsers.length });
  } catch (error) {
    console.error("Görev atama hatası:", error.message);
    res.status(500).json({ error: 'Görev atanamadı.' });
  }
});

module.exports = router;