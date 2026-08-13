const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { weeklyPeriodKey, monthlyPeriodKey, periodBounds } = require('./periodUtils');

/**
 * 🔥 YENİDEN YAZILDI: Önceki sürüm her Pazartesi TEK, hardcoded bir "Etüt
 * Yoklaması" görevi üretiyordu — kurum/mıntıka bazlı özelleştirme, farklı
 * modüller için farklı şablon, farklı gün/saat imkânı yoktu.
 *
 * Artık: aktif TaskTemplate kayıtları taranıyor, her birinin kendi
 * recurrence/dayOfWeek(veya dayOfMonth)/deadlineHour-Minute bilgisine göre
 * "bugün bu şablonun görevi üretilmeli mi" kontrol ediliyor. Aynı dönem
 * (periodKey, örn. "2026-W33") için ikinci kez üretmiyor.
 *
 * GÖÇ NOTU: Eski hardcoded davranışı ("her Pazartesi tüm kurumlara YOKLAMA
 * görevi") korumak istiyorsan, SISTEM hesabıyla POST /api/task-templates'e
 * şu gövdeyle bir kere istek at:
 *   { title: "Haftalık Etüt Yoklaması", moduleType: "YOKLAMA",
 *     recurrence: "HAFTALIK", dayOfWeek: 1, deadlineHour: 23, deadlineMinute: 59 }
 * (dayOfWeek: 0=Pazar, 1=Pazartesi ... 6=Cumartesi)
 */

function hesaplaDeadline(template, periodKey) {
  const { start } = periodBounds(periodKey);
  const deadline = new Date(start);

  if (template.recurrence === 'HAFTALIK') {
    // ISO hafta: start her zaman Pazartesi. dayOfWeek: 0=Pazar...6=Cumartesi.
    const hedefGun = template.dayOfWeek === 0 ? 7 : template.dayOfWeek; // Pazar'ı haftanın 7. günü say
    const kayma = hedefGun - 1; // Pazartesi'den (=1) itibaren kaç gün eklenecek
    deadline.setUTCDate(deadline.getUTCDate() + kayma);
  } else if (template.recurrence === 'AYLIK') {
    deadline.setUTCDate(template.dayOfMonth || 1);
  }

  deadline.setUTCHours(template.deadlineHour, template.deadlineMinute, 0, 0);
  return deadline;
}

/**
 * Bir şablondan, GÜNCEL dönem için bir Task + kapsamındaki personele
 * TaskAssignment üretir. Aynı periodKey için zaten üretilmişse tekrar
 * üretmez (force:true bile olsa — force sadece "bugün üretim günü mü"
 * kontrolünü atlar, dönem tekilleştirmesini ATLAMAZ).
 */
async function generateFromTemplate(template, { force = false } = {}) {
  if (!template.isActive && !force) {
    return { uretildi: false, mesaj: 'Şablon pasif.' };
  }

  const now = new Date();
  const periodKey = template.recurrence === 'HAFTALIK' ? weeklyPeriodKey(now) : monthlyPeriodKey(now);

  const mevcut = await prisma.task.findFirst({ where: { templateId: template.id, periodKey } });
  if (mevcut) {
    return { uretildi: false, mesaj: 'Bu dönem için zaten üretilmiş.', taskId: mevcut.id, periodKey };
  }

  const deadline = hesaplaDeadline(template, periodKey);

  const task = await prisma.task.create({
    data: {
      title: `${template.title} (${periodKey})`,
      description: template.description,
      moduleType: template.moduleType,
      isAutoTracked: true,
      status: 'BEKLIYOR',
      deadline,
      institutionId: template.institutionId,
      senderId: template.createdById,
      templateId: template.id,
      periodKey
    }
  });

  // Kapsamdaki PERSONEL rolündeki kullanıcılara ata
  let userFilter = { roleLevel: 'PERSONEL' };
  if (template.institutionId) userFilter.institutionId = template.institutionId;
  else if (template.districtId) userFilter.districtId = template.districtId;
  else if (template.regionId) userFilter.district = { regionId: template.regionId };

  const personeller = await prisma.user.findMany({ where: userFilter });
  if (personeller.length > 0) {
    await prisma.taskAssignment.createMany({
      data: personeller.map(p => ({ taskId: task.id, userId: p.id }))
    });
  }

  return { uretildi: true, task, periodKey, atananPersonelSayisi: personeller.length };
}

class SchedulerService {
  static init() {
    console.log('⏰ SchedulerService: Zamanlanmış görevler başlatıldı.');

    // Her gün gece 00:05'te, o günün şablonlarını kontrol eder.
    // (Test etmek için geçici olarak '* * * * *' yapıp her dakika çalıştırabilirsin.)
    cron.schedule('5 0 * * *', async () => {
      console.log('🔄 Şablon kontrolü tetiklendi...');
      await this.gunlukSablonKontrolu();
    });
  }

  static async gunlukSablonKontrolu() {
    try {
      const bugun = new Date();
      const haftaGunu = bugun.getUTCDay(); // 0=Pazar...6=Cumartesi
      const ayGunu = bugun.getUTCDate();

      const sablonlar = await prisma.taskTemplate.findMany({
        where: {
          isActive: true,
          OR: [
            { recurrence: 'HAFTALIK', dayOfWeek: haftaGunu },
            { recurrence: 'AYLIK', dayOfMonth: ayGunu }
          ]
        }
      });

      for (const sablon of sablonlar) {
        const sonuc = await generateFromTemplate(sablon);
        if (sonuc.uretildi) {
          console.log(`✅ Şablon üretildi: "${sablon.title}" (${sonuc.periodKey}, ${sonuc.atananPersonelSayisi} personele atandı)`);
        }
      }
    } catch (error) {
      console.error('❌ Şablon kontrolü sırasında hata:', error);
    }
  }
}

module.exports = SchedulerService;
module.exports.generateFromTemplate = generateFromTemplate;
module.exports.hesaplaDeadline = hesaplaDeadline;