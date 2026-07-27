const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. TALEBELERİ GETİR (MAKAM SINIRLARINA GÖRE AKILLI FİLTRELEME)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { institutionId, userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Kullanıcı ID eksik.' });

    // İsteği yapan yetkiliyi tapu (makam) bilgileriyle çekiyoruz
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { district: { include: { region: true } }, managedClasses: true }
    });
    
    const role = user.roles[0];
    let whereClause = {};

    // 🔥 GÜVENLİK DUVARI VE GÖRÜNÜRLÜK SINIRLARI
    if (role === 'ADMIN') {
      if (institutionId) whereClause.institutionId = institutionId;
    } 
    else if (role === 'BOLGE_EM') {
      // Bölge mesulü sadece kendi bölgesine bağlı kurumlardaki öğrencileri görür
      whereClause.institution = { district: { regionId: user.district?.regionId } };
      if (institutionId) whereClause.institutionId = institutionId;
    } 
    else if (role === 'MINTIKA_EM') {
      // Mıntıka mesulü sadece kendi mıntıkasındaki kurumlardaki öğrencileri görür
      whereClause.institution = { districtId: user.districtId };
      if (institutionId) whereClause.institutionId = institutionId;
    } 
    else if (role === 'KURUM_EM') {
      // Kurum mesulü kendi kurumundan dışarı çıkamaz
      whereClause.institutionId = user.institutionId;
    } 
    else {
      // Normal personel sadece atandığı sınıfları görür
      const classIds = user.managedClasses.map(c => c.id);
      if (classIds.length === 0) return res.json([]); // Sınıfı yoksa boş liste
      whereClause.classId = { in: classIds };
      whereClause.institutionId = user.institutionId;
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      orderBy: [{ status: 'asc' }, { orderIndex: 'asc' }],
      include: { class: true, institution: true } 
    });

    res.json(students);
  } catch (error) { 
    console.error("Talebe Listeleme Hatası:", error);
    res.status(500).json({ error: 'Talebeler getirilemedi.' }); 
  }
});

// ==========================================
// 2. TEKLİ TALEBE EKLEME (TÜM MAKAM SAHİPLERİ İÇİN)
// ==========================================
router.post('/', async (req, res) => {
  try {
    const { studentCode, fullName, institutionId, classId, orderIndex } = req.body;
    
    // Güvenlik: Kurum ID'si mutlaka gönderilmelidir (Mıntıka veya Bölge mesulü seçmiş olmalı)
    if (!institutionId) return res.status(400).json({ error: 'Öğrencinin ekleneceği kurum seçilmelidir!' });

    const newStudent = await prisma.student.create({
      data: { 
        studentCode, fullName, institutionId, 
        orderIndex: orderIndex || 999, classId: classId || null 
      }
    });
    res.json(newStudent);
  } catch (error) { 
    console.error("Talebe Ekleme Hatası:", error);
    res.status(500).json({ error: 'Talebe eklenemedi.' }); 
  }
});

// ==========================================
// 3. EXCEL İLE TOPLU TALEBE EKLEME (MAKAM SINIRLARINI KORUYAN SİSTEM)
// ==========================================
router.post('/bulk', async (req, res) => {
  try {
    // Ön yüzden Excel verisi ile birlikte yükleyenin ID'sini de alıyoruz!
    const { studentsData, userId } = req.body;
    let eklenenler = [];
    let atlananlar = 0;
    let yetkiDisi = 0;

    // Yükleyenin makamını öğreniyoruz
    const uploader = await prisma.user.findUnique({ 
      where: { id: userId }, 
      include: { district: { include: { region: true } } } 
    });
    
    if (!uploader) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const uRole = uploader.roles[0];

    for (let i = 0; i < studentsData.length; i++) {
      const s = studentsData[i];
      const mintikaAd = s['MINTIKA']?.toString().trim();
      const kurumAd = s['KURUM']?.toString().trim();
      const sinifAd = s['SINIF']?.toString().trim();
      const ogrenciKodu = s['TALEBE KODU']?.toString().trim();
      const adSoyad = s['AD SOYAD']?.toString().trim();

      if (!adSoyad || !kurumAd || !ogrenciKodu || !mintikaAd) continue;

      // 🔥 CASUS KONTROLÜ: Mıntıka mesulü, Excel'e başka mıntıka adı yazmışsa engelle!
      if (uRole === 'MINTIKA_EM' && uploader.district?.name !== mintikaAd) {
        yetkiDisi++;
        continue; // Başka mıntıkaya eklemesine izin verme, satırı atla!
      }

      // Talebe Kodu Çakışma Kontrolü
      const mevcutTalebe = await prisma.student.findUnique({ where: { studentCode: ogrenciKodu } });
      if (mevcutTalebe) { atlananlar++; continue; }

      // Kurum ve Mıntıka veritabanı eşleşmesi
      const dist = await prisma.district.findFirst({ where: { name: mintikaAd } });
      if (!dist) continue;
      
      const inst = await prisma.institution.findFirst({ where: { name: kurumAd, districtId: dist.id } });
      if (!inst) continue;

      // Sınıfı bul (Yoksa oluştur)
      let targetClass = null;
      if (sinifAd) {
        targetClass = await prisma.class.findFirst({ where: { name: sinifAd, institutionId: inst.id } });
        if (!targetClass) {
          targetClass = await prisma.class.create({ data: { name: sinifAd, level: "Bilinmiyor", institutionId: inst.id } });
        }
      }

      // Talebeyi Sisteme Kaydet
      const newStd = await prisma.student.create({
        data: { 
          studentCode: ogrenciKodu, 
          fullName: adSoyad, 
          institutionId: inst.id, 
          classId: targetClass ? targetClass.id : null,
          orderIndex: 999 
        }
      });
      eklenenler.push(newStd);
    }
    
    res.json({ 
      message: `İşlem tamam! ${eklenenler.length} eklendi. ${atlananlar} çakışma atlandı. ${yetkiDisi} yetki dışı işlem reddedildi.`, 
      eklenenCount: eklenenler.length,
      atlananCount: atlananlar
    });
  } catch (error) { 
    console.error("Toplu Ekleme Hatası:", error);
    res.status(500).json({ error: 'Toplu ekleme hatası. Lütfen terminali kontrol edin.' }); 
  }
});

// ==========================================
// 4. AKILLI SİLME İŞLEMİ (SOFT DELETE VE HARD DELETE)
// ==========================================
router.delete('/:id', async (req, res) => {
  try {
    const sId = req.params.id;
    const { userId, role } = req.query; // Frontend'den silen kişinin ID'si ve ROLÜ gelmeli!

    const student = await prisma.student.findUnique({
      where: { id: sId },
      include: { institution: { include: { district: true } } }
    });

    if (!student) return res.status(404).json({ error: 'Talebe bulunamadı.' });

    // A) KURUM EĞİTİM MESULÜ SİLİYORSA -> SADECE PASİFE AL VE BİLDİRİM GÖNDER
    if (role === 'KURUM_EM') {
      await prisma.student.update({ where: { id: sId }, data: { status: 'PASIF' } });

      // Mıntıka Mesulünü Bul ve Ona "Görev/Bildirim" At
      const mintikaManagerId = student.institution.district?.managerId;
      if (mintikaManagerId) {
        await prisma.task.create({
          data: {
            title: '⚠️ Talebe Silme Onayı Bekliyor',
            description: `${student.institution.name} kurumundan ${student.fullName} adlı talebe silinmek üzere pasife alındı. Kesin silme onayı için lütfen kontrol edin.`,
            status: 'BEKLIYOR',
            senderId: userId,
            receiverId: mintikaManagerId,
            institutionId: student.institutionId
          }
        });
      }
      return res.json({ message: 'Talebe pasife alındı, onay için Mıntıka Mesulüne bildirim gönderildi.' });
    } 
    
    // B) MINTIKA, BÖLGE VEYA SİSTEM ADMİNİ SİLİYORSA -> TAMAMEN SİL (HARD DELETE)
    else if (['MINTIKA_EM', 'BOLGE_EM', 'ADMIN'].includes(role)) {
      // Önce talebeye bağlı tüm alt verileri temizliyoruz
      await prisma.attendance.deleteMany({ where: { studentId: sId } });
      await prisma.studentBookTracking.deleteMany({ where: { studentId: sId } });
      await prisma.performanceGrade.deleteMany({ where: { studentId: sId } });
      await prisma.preExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.mockExamResult.deleteMany({ where: { studentId: sId } });
      await prisma.testBookResult.deleteMany({ where: { studentId: sId } });

      // Son olarak talebenin kendisini siliyoruz
      await prisma.student.delete({ where: { id: sId } });
      return res.json({ message: 'Talebe sistemden kalıcı olarak silindi.' });
    }

    res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
  } catch (error) { 
    console.error("Öğrenci Silme Hatası:", error);
    res.status(500).json({ error: 'İşlem başarısız.' }); 
  }
});

module.exports = router;