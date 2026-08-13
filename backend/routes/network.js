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
const inviteSchema = z.object({
  body: z.object({
    senderId: z.string().uuid("Geçersiz Gönderen ID").optional(),
    receiverId: z.string().uuid("Geçersiz Alıcı ID"),
    targetType: z.string().min(1, "Hedef türü zorunludur"),
    targetId: z.string().uuid("Geçersiz Hedef ID")
  })
});

const acceptSchema = z.object({
  body: z.object({
    requestId: z.string().uuid("Geçersiz İstek ID"),
    receiverId: z.string().uuid("Geçersiz Alıcı ID").optional(),
    targetType: z.string().min(1, "Hedef türü zorunludur"),
    targetId: z.string().uuid("Geçersiz Hedef ID")
  })
});

// ==========================================
// ALT MODÜL: AĞ VE DAVET SİSTEMİ
// ==========================================

// 1. Personel Arama
router.get('/search', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
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
  } catch (error) { next(error); }
});

// 2. Davet Gönderme
router.post('/invite', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM']), validate(inviteSchema), async (req, res, next) => {
  try {
    const { receiverId, targetType, targetId } = req.body;
    const senderId = req.user.id; // Güvenlik: Gönderen daima isteği yapan kişidir.

    // Güvenlik Kalkanı: Yöneticisi olmadığı bir kuruma adam davet edemez!
    if (targetType === 'INSTITUTION' && !await HierarchyService.assertOwnsInstitution(req.user, targetId)) {
      return res.status(403).json({ error: 'Sadece yetkili olduğunuz kurumlara davet gönderebilirsiniz.' });
    }

    const existing = await prisma.connectionRequest.findFirst({
      where: { senderId, receiverId, status: 'PENDING' }
    });
    if (existing) return res.status(400).json({ error: 'Bu kullanıcıya zaten beklemede olan bir isteğiniz var.' });

    const request = await prisma.connectionRequest.create({
      data: { senderId, receiverId, targetType, targetId }
    });
    res.json({ message: 'Davet başarıyla gönderildi!', request });
  } catch (error) { next(error); }
});

// 3. Gelen Davetleri Listeleme
router.get('/my-requests/:userId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Güvenlik: Sadece kendi davetlerini veya SISTEM yetkilisi görebilir
    if (userId !== req.user.id && req.user.roleLevel !== 'SISTEM') {
      return res.status(403).json({ error: 'Başkasının davetlerini görüntüleyemezsiniz.' });
    }

    const requests = await prisma.connectionRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: { sender: { select: { fullName: true, roles: true } } }
    });
    res.json(requests);
  } catch (error) { next(error); }
});

// 4. Daveti Kabul Etme
router.post('/accept', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), validate(acceptSchema), async (req, res, next) => {
  try {
    const { requestId, targetType, targetId } = req.body;
    const receiverId = req.user.id; // Güvenlik: Sadece giriş yapan kişi kendi adına kabul edebilir

    // İstek gerçekten bu kişiye mi ait kontrolü
    const validRequest = await prisma.connectionRequest.findFirst({
      where: { id: requestId, receiverId, status: 'PENDING' }
    });

    if (!validRequest) {
      return res.status(404).json({ error: 'Geçerli bir davet bulunamadı veya başkasına ait.' });
    }

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
  } catch (error) { next(error); }
});

// 5. Ekibi Görüntüleme
router.get('/my-team/:institutionId', authorize(['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM', 'PERSONEL']), async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    if (!institutionId) return res.json([]);

    // Güvenlik Kalkanı: Başka kurumun personel listesini sızdırmayı engelle
    if (!await HierarchyService.assertOwnsInstitution(req.user, institutionId)) {
      return res.status(403).json({ error: 'Bu kurumun personel listesini görme yetkiniz yok.' });
    }

    const team = await prisma.user.findMany({
      where: { institutionId },
      select: { id: true, fullName: true, username: true, roles: true, personelId: true }
    });
    res.json(team);
  } catch (error) { next(error); }
});

module.exports = router;