import { describe, it, expect } from 'vitest';
const HierarchyService = require('../services/hierarchyService.js');

describe('HierarchyService - Yetki ve Sınır Kontrolleri', () => {
  
  it('PERSONEL rolü (üzerinde sınıf yoksa) hiçbir öğrenciyi göremez', () => {
    const user = { roleLevel: 'PERSONEL', managedClassIds: [], institutionId: 'kurum-1' };
    const filter = HierarchyService.getStudentFilter(user);
    // Güvenlik kilidi devreye girmeli
    expect(filter).toEqual({ id: 'GIZLI_KILIT_KIMSEYI_GOSTERME' });
  });

  it('KURUM mesulü sadece kendi kurumunun öğrencilerini görebilmelidir', () => {
    const user = { roleLevel: 'KURUM', institutionId: 'kurum-1' };
    const filter = HierarchyService.getStudentFilter(user);
    // Filtre sadece o kurumu kapsamalı
    expect(filter).toEqual({ institutionId: 'kurum-1' });
  });

  it('SISTEM yöneticisi tüm öğrencileri görebilmelidir', () => {
    const user = { roleLevel: 'SISTEM' };
    const filter = HierarchyService.getStudentFilter(user);
    // Sistem rolüne filtre (sınır) uygulanmaz, boş obje döner
    expect(filter).toEqual({}); 
  });

});