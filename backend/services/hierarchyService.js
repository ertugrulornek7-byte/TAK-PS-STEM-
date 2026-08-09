const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class HierarchyService {
  /**
   * 1. KURUMLARI GÖRÜNTÜLEME YETKİSİ (Kim hangi kurumları görebilir?)
   * @param {Object} user - İsteği yapan kullanıcı (req.user)
   */
  static getInstitutionFilter(user) {
    if (user.roleLevel === 'SISTEM') return {}; // Sistem Admini her şeyi görür

    if (user.roleLevel === 'BOLGE' && user.district?.regionId) {
      // Bölge Mesulü kendi bölgesindeki (Region) mıntıkalara bağlı tüm kurumları görür
      return { district: { regionId: user.district.regionId } };
    } 

    if (user.roleLevel === 'MINTIKA') {
      // Mıntıka Mesulü sadece kendi mıntıkasındaki kurumları görür
      return { districtId: user.districtId };
    } 

    if (user.roleLevel === 'KURUM' || user.roleLevel === 'PERSONEL') {
      // Kurum mesulü ve personel sadece atandıkları kendi kurumlarını görür
      return { id: user.institutionId };
    }

    return { id: 'YETKISIZ_ERISIM' }; // Hata durumu kilidi
  }

  /**
   * 2. TALEBELERİ GÖRÜNTÜLEME YETKİSİ (Kim hangi öğrencileri listeyebilir?)
   */
  static getStudentFilter(user) {
    if (user.roleLevel === 'SISTEM') return {};

    if (user.roleLevel === 'BOLGE' && user.district?.regionId) {
      // Bölge mesulü kendi bölgesindeki kurumların talebelerini görür
      return { institution: { district: { regionId: user.district.regionId } } };
    }
    
    if (user.roleLevel === 'MINTIKA') {
      // Mıntıka mesulü kendi mıntıkasındaki talebeleri görür
      return { institution: { districtId: user.districtId } };
    }
    
    if (user.roleLevel === 'KURUM') {
      // Kurum mesulü sadece kendi kurumundaki talebeleri görür
      return { institutionId: user.institutionId };
    }
    
    if (user.roleLevel === 'PERSONEL') {
      // Personel sadece sorumlu olduğu sınıflardaki (managedClasses) talebeleri görür
      const classIds = user.managedClasses ? user.managedClasses.map(c => c.id) : [];
      if (classIds.length === 0) return { id: 'GIZLI_KILIT_KIMSEYI_GOSTERME' };
      return { classId: { in: classIds }, institutionId: user.institutionId };
    }

    return { id: 'YETKISIZ_ERISIM' };
  }

  /**
   * 3. PERSONELİ GÖRÜNTÜLEME YETKİSİ (Kim hangi hocaları görebilir/atama yapabilir?)
   */
  static getUserFilter(user) {
    if (user.roleLevel === 'SISTEM') return {};

    if (user.roleLevel === 'BOLGE' && user.district?.regionId) {
       return { district: { regionId: user.district.regionId } };
    }

    if (user.roleLevel === 'MINTIKA') {
       return { districtId: user.districtId };
    }

    if (user.roleLevel === 'KURUM') {
       return { institutionId: user.institutionId };
    }

    if (user.roleLevel === 'PERSONEL') {
       return { id: user.id }; // Personel sadece kendini görür
    }

    return { id: 'YETKISIZ_ERISIM' };
  }
}

module.exports = HierarchyService;