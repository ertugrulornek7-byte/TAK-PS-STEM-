const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ALT MODÜL: AĞ VE DAVET SİSTEMİ
// ==========================================

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query; 
    if (!q) return res.json([]);

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { personelId: { contains: q } } 
        ]
      },
      select: { id: true, username: true, fullName: true, roles: true, personelId: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Arama yapılamadı.' });
  }
});

router.post('/invite', async (req, res) => {
  try {
    const { senderId, receiverId, targetType, targetId } = req.body;
    const existing = await prisma.connectionRequest.findFirst({
      where: { senderId, receiverId, status: 'PENDING' }
    });
    if (existing) return res.status(400).json({ error: 'Bu kullanıcıya zaten beklemede olan bir isteğiniz var.' });

    const request = await prisma.connectionRequest.create({
      data: { senderId, receiverId, targetType, targetId }
    });
    res.json({ message: 'Davet başarıyla gönderildi!', request });
  } catch (error) {
    res.status(500).json({ error: `Sistem Hatası: ${error.message}` });
  }
});

router.get('/my-requests/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const requests = await prisma.connectionRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: { sender: { select: { fullName: true, roles: true } } }
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Davetler getirilemedi.' });
  }
});

router.post('/accept', async (req, res) => {
  try {
    const { requestId, receiverId, targetType, targetId } = req.body;
    await prisma.connectionRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' }
    });

    if (targetType === 'INSTITUTION') {
      await prisma.user.update({
        where: { id: receiverId },
        data: { institutionId: targetId }
      });
    }
    res.json({ message: 'Davet kabul edildi ve ağa katıldınız!' });
  } catch (error) {
    res.status(500).json({ error: 'Davet kabul edilemedi.' });
  }
});

router.get('/my-team/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;
    if (!institutionId) return res.json([]);

    const team = await prisma.user.findMany({
      where: { institutionId },
      select: { id: true, fullName: true, username: true, roles: true, personelId: true }
    });
    res.json(team);
  } catch (error) {
    res.status(500).json({ error: 'Ekip getirilemedi.' });
  }
});

module.exports = router;