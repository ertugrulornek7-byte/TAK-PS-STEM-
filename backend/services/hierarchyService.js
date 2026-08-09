const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class HierarchyService {
  /**
   * 1. KURUMLARI GÖRÜNTÜLEME YETKİSİ (Kim hangi kurumları görebilir?)
   */
  static getInstitutionFilter(user) {
    if (user.roleLevel === 'SISTEM') return {}; 

    if (user.roleLevel === 'BOLGE' && user.district?.regionId) {
      return { district: { regionId: user.district.regionId } };
    } 

    if (user.roleLevel === 'MINTIKA') {
      return { districtId: user.districtId };
    } 

    if (user.roleLevel === 'KURUM' || user.roleLevel === 'PERSONEL') {
      return { id: user.institutionId };
    }

    return { id: 'YETKISIZ_ERISIM' }; 
  }

  /**
   * 2. TALEBELERİ GÖRÜNTÜLEME YETKİSİ (Kim hangi öğrencileri listeyebilir?)
   */
  static getStudentFilter(user) {
    if (user.roleLevel === 'SISTEM') return {};

    if (user.roleLevel === 'BOLGE' && user.district?.regionId) {
      return { institution: { district: { regionId: user.district.regionId } } };
    }
    
    if (user.roleLevel === 'MINTIKA') {
      return { institution: { districtId: user.districtId } };
    }
    
    if (user.roleLevel === 'KURUM') {
      return { institutionId: user.institutionId };
    }
    
    if (user.roleLevel === 'PERSONEL') {
      // 🔥 DEĞİŞKEN İSMİ HATASI DÜZELTİLDİ: myClassIds
      const myClassIds = user.managedClassIds || [];
      if (myClassIds.length === 0) return { id: 'GIZLI_KILIT_KIMSEYI_GOSTERME' };
      return { classId: { in: myClassIds }, institutionId: user.institutionId };
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
       return { id: user.id }; 
    }

    return { id: 'YETKISIZ_ERISIM' };
  }
}

/**
   * 4. GÜVENLİK KONTROLÜ: Kullanıcı bu kurumda işlem (ekleme/yazma) yapabilir mi?
   */
  static assertOwnsInstitution(user, institutionId) {
    if (!institutionId) return false;
    // Üst makamların yetkisi geniştir, alt kurumlarında işlem yapabilirler
    if (['SISTEM', 'BOLGE', 'MINTIKA'].includes(user.roleLevel)) return true;
    
    // Kurum mesulü ve personel SADECE kendi kurumunda işlem yapabilir
    return user.institutionId === institutionId;
  }
module.exports = HierarchyService;