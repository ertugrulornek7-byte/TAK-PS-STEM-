const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Excel'den gelen Bölge/Mıntıka/Kurum isimlerine göre hedef kurumu bulur,
 * yoksa YÜKLEYEN KİŞİNİN YETKİ ALANI İÇİNDE otomatik oluşturur.
 *
 * Yetki kuralları (kasıtlı ve önemli):
 * - KURUM / PERSONEL: hiyerarşi oluşturamaz, her zaman kendi kurumuna eklenir.
 * - MINTIKA: SADECE kendi mıntıkası içinde kurum oluşturabilir. Yeni bir
 *   mıntıka veya bölge OLUŞTURAMAZ (Excel'de başka bir mıntıka adı yazsa bile
 *   kendi mıntıkasına sabitlenir) — bu, önceki sürümde olmayan bir güvenlik
 *   sıkılaştırmasıdır: eskiden herhangi bir üst makam Excel'e yeni bir bölge
 *   adı yazarak sistemde İSTEDİĞİ HERHANGİ BİR YERDE yeni bölge/mıntıka
 *   oluşturabiliyordu.
 * - BOLGE: kendi bölgesi İÇİNDE yeni mıntıka ve kurum oluşturabilir.
 * - SISTEM: tamamen serbest; Bölge belirtilmezse mıntıka bölgesiz (regionId
 *   null) oluşturulur, sonradan elle bir bölgeye bağlanabilir.
 *
 * @returns {Promise<string|null>} institution id, ya da yetkisi/verisi
 *          yetersizse null.
 */
async function resolveOrCreateInstitution({ role, user, bolgeAdi, mintikaAdi, kurumAdi, kurumKodu, nevi }) {
  if (role === 'KURUM' || role === 'PERSONEL') {
    return user.institutionId || null;
  }

  if (!mintikaAdi || !kurumAdi) return null;

  let district = null;

  if (role === 'MINTIKA') {
    if (!user.managedDistrict) {
      throw new Error('Hesabınıza yönetici olarak atanmış bir mıntıka bulunamadı.');
    }
    district = user.managedDistrict; // Excel'de başka isim yazılsa da kendi mıntıkasına sabit
  } else if (role === 'BOLGE') {
    if (!user.managedRegion) {
      throw new Error('Hesabınıza yönetici olarak atanmış bir bölge bulunamadı.');
    }
    district = await prisma.district.findFirst({ where: { name: mintikaAdi, regionId: user.managedRegion.id } });
    if (!district) {
      district = await prisma.district.create({ data: { name: mintikaAdi, regionId: user.managedRegion.id } });
    }
  } else if (role === 'SISTEM') {
    let region = null;
    if (bolgeAdi) {
      region = await prisma.region.findFirst({ where: { name: bolgeAdi } });
      if (!region) region = await prisma.region.create({ data: { name: bolgeAdi } });
    }
    district = await prisma.district.findFirst({ where: { name: mintikaAdi, regionId: region ? region.id : null } });
    if (!district) {
      district = await prisma.district.create({ data: { name: mintikaAdi, regionId: region ? region.id : null } });
    }
  }

  if (!district) return null;

  // Kurumu ÖNCE kodla (varsa, daha güvenilir), sonra isim+mıntıka ile ara
  let institution = null;
  const temizKod = kurumKodu ? String(kurumKodu).trim() : null;

  if (temizKod) {
    institution = await prisma.institution.findFirst({ where: { code: temizKod } });
  }
  if (!institution) {
    institution = await prisma.institution.findFirst({ where: { name: kurumAdi, districtId: district.id } });
  }

  if (!institution) {
    institution = await prisma.institution.create({
      data: {
        name: kurumAdi,
        districtId: district.id,
        code: temizKod || null,
        ...(nevi ? { nevi } : {})
      }
    });
  } else if (!institution.code && temizKod) {
    // 🔥 İSTENEN DAVRANIŞ: bir kuruma ait ilk talebe/kayıt hangi kodu
    // taşıyorsa, o kurumun kalıcı kodu o olur. Kurum daha önce kodsuz
    // oluşmuşsa (örn. personel eklerken), ilk kod geldiğinde geriye dönük atanır.
    institution = await prisma.institution.update({ where: { id: institution.id }, data: { code: temizKod } });
  }

  return institution.id;
}

module.exports = { resolveOrCreateInstitution };