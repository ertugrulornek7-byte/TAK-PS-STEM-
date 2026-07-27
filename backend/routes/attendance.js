const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: YOKLAMA VE HAFTALIK MATRİS
// ==========================================

// 1. Yoklama Kaydetme, Güncelleme veya Silme (Gelecek Zaman Korumalı)
router.post('/', async (req, res) => {
  try {
    const { studentId, date, status } = req.body;
    
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const bugun = new Date();
    bugun.setUTCHours(0, 0, 0, 0); 

    if (targetDate > bugun) {
      return res.status(400).json({ error: 'Gelecek tarihler için yoklama giremezsiniz!' });
    }

    let attendance = await prisma.attendance.findFirst({
      where: { studentId: studentId, date: targetDate }
    });

    if (attendance) {
      if (status === "") {
         await prisma.attendance.delete({ where: { id: attendance.id }});
         return res.json({ mesaj: 'Yoklama kaydı silindi.' });
      } else {
         attendance = await prisma.attendance.update({
           where: { id: attendance.id },
           data: { status: status }
         });
      }
    } else {
      if (status !== "") {
         attendance = await prisma.attendance.create({
           data: { studentId, date: targetDate, status }
         });
      }
    }
    res.json(attendance);
  } catch (error) {
    console.error("💥 YOKLAMA KAYIT HATASI:", error);
    res.status(500).json({ error: 'Yoklama kaydedilemedi.' });
  }
});

// 2. Seçilen Haftanın Tüm Yoklamalarını Getirme
router.get('/weekly/:institutionId/:startDate/:endDate', async (req, res) => {
  try {
    const { institutionId, startDate, endDate } = req.params;
    
    const start = new Date(startDate);
    start.setUTCHours(0,0,0,0);
    const end = new Date(endDate);
    end.setUTCHours(23,59,59,999);

    const attendances = await prisma.attendance.findMany({
      where: {
        student: { institutionId: institutionId },
        date: { gte: start, lte: end }
      }
    });
    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: 'Haftalık yoklamalar getirilemedi.' });
  }
});

module.exports = router;