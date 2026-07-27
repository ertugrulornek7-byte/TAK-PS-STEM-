const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: DENETİM VE TEFTİŞ (SAYFA 10)
// ==========================================

router.post('/', async (req, res) => {
  try {
    const { institutionId, inspectorRole, inspectorName, inspectionDate, remarks } = req.body;
    const inspection = await prisma.inspection.create({
      data: { institutionId, inspectorRole, inspectorName, inspectionDate: new Date(inspectionDate), remarks }
    });
    res.json(inspection);
  } catch (error) {
    res.status(500).json({ error: 'Denetim raporu eklenemedi.' });
  }
});

router.get('/:institutionId', async (req, res) => {
  try {
    const inspections = await prisma.inspection.findMany({
      where: { institutionId: req.params.institutionId },
      orderBy: { inspectionDate: 'desc' } 
    });
    res.json(inspections);
  } catch (error) {
    res.status(500).json({ error: 'Denetimler getirilemedi.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { fixStatus } = req.body;
    const updated = await prisma.inspection.update({
      where: { id: req.params.id },
      data: { fixStatus }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Durum güncellenemedi.' });
  }
});

module.exports = router;