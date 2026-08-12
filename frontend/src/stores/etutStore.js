import { defineStore } from 'pinia'
import api from '../api/axios' // Kurumsal API İstemcimiz
import { useAuthStore } from './authStore'

export const useEtutStore = defineStore('etut', {
  state: () => ({
    talebler: [], 
    siniflar: [], 
    aktifSinifFiltresi: '', // Varsayılan: Boş (Tüm sınıfları gösterir)
    yukleniyor: false,
    hata: null,
  }),
  
  getters: {
    aktifKurumId: () => {
      const authStore = useAuthStore()
      return authStore.user?.institutionId
    },
    // Backend zaten yetki kontrolü yaptığı için bu getter artık sadece ön yüz (UI) gizleme/gösterme işlemleri için kullanılacak
    yetkiliMi: () => {
      const authStore = useAuthStore()
      const roles = authStore.user?.roles || []
      return roles.includes('KURUM_EM') || roles.includes('MINTIKA_EM') || roles.includes('BOLGE_EM') || roles.includes('ADMIN')
    },
    gosterilenTalebeler: (state) => {
      let filtrelenmis = state.talebler;
      if (state.aktifSinifFiltresi) {
        // HATA DÜZELTİLDİ: classGroupId değil, veritabanındaki gibi classId olmalı
        filtrelenmis = state.talebler.filter(t => t.classId === state.aktifSinifFiltresi);
      }
      return filtrelenmis.map((t, index) => ({ ...t, dinamikSira: index + 1 }));
    }
  },

  actions: {
    async gruplariGetir() {
      const authStore = useAuthStore()
      const kurumId = authStore.user?.institutionId
      if (!kurumId) return

      try {
        // HATA DÜZELTİLDİ: Sözdizimi (syntax) hatası giderildi ve doğru endpoint yazıldı.
        // Artık isAdmin veya userId yollamıyoruz, backend kim olduğumuzu token'dan biliyor!
        const res = await api.get(`/hierarchy/groups/${kurumId}`)
        this.siniflar = res.data?.classes || []
      } catch (error) { 
        console.error("Sınıflar getirilemedi", error) 
      }
    },

    async talebeleriGetir() {
      this.yukleniyor = true
      this.hata = null
      
      const authStore = useAuthStore()
      const kurumId = authStore.user?.institutionId

      if (!kurumId) {
        this.hata = 'Kurum kimliği bulunamadı.'
        this.yukleniyor = false
        return
      }

      try {
        await this.gruplariGetir() 

        const res = await api.get('/students', {
          params: { institutionId: kurumId }
        })

        // 🔥 YENİ GÜVENLİK KALKANI EKLENDİ (TypeError: filtrelenmis.map is not a function hatasını engeller)
        if (Array.isArray(res.data)) {
          this.talebler = res.data;
        } else {
          console.warn('Backend geçerli bir öğrenci dizisi (array) döndürmedi!', res.data);
          this.talebler = []; // Çökmeyi engellemek için boş liste ata
        }

      } catch (error) {
        this.hata = 'Talebeler yüklenirken hata oluştu.'
      } finally {
        this.yukleniyor = false
      }
    },

    async talebeEkle(yeniTalebe) {
      const authStore = useAuthStore()
      const kurumId = authStore.user?.institutionId
      if (!kurumId) throw new Error("Kurum kimliği yok!")

      // HATA DÜZELTİLDİ: Yeni kayıt eklendiği için "api.get" değil "api.post" olmalı!
      await api.post('/students', { ...yeniTalebe, institutionId: kurumId })
      await this.talebeleriGetir()
    },

    async talebeSil(id) {
      if (!confirm('Bu talebeyi silmek istediğinize emin misiniz?')) return
      try {
        // HATA DÜZELTİLDİ: axios.delete yerine api.delete yapıldı ve tırnak hatası düzeltildi.
        await api.delete(`/students/${id}`)
        this.talebler = this.talebler.filter(t => t.id !== id)
      } catch (error) { 
        alert('Silme işlemi başarısız oldu.') 
      }
    }
  }
})