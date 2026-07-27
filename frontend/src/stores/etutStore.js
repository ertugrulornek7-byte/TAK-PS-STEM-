import { defineStore } from 'pinia'
import axios from 'axios'
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
    yetkiliMi: () => {
      const authStore = useAuthStore()
      const roles = authStore.user?.roles
      if (!roles) return false
      return String(roles).includes('EM') 
    },
    gosterilenTalebeler: (state) => {
      let filtrelenmis = state.talebler;
      if (state.aktifSinifFiltresi) {
        filtrelenmis = state.talebler.filter(t => t.classGroupId === state.aktifSinifFiltresi);
      }
      return filtrelenmis.map((t, index) => ({ ...t, dinamikSira: index + 1 }));
    }
  },

  actions: {
    async gruplariGetir() {
      const authStore = useAuthStore()
      const kurumId = authStore.user?.institutionId
      const userId = authStore.user?.id
      if (!kurumId) return

      try {
        const res = await axios.get(`http://localhost:3000/api/hierarchy/groups/${kurumId}`, {
          params: { userId: userId, isAdmin: this.yetkiliMi }
        })
        // Backend zaten sadece Mustafa'nın sınıflarını (7 ve 8) gönderiyor
        this.siniflar = res.data.classes || []
      } catch (error) { console.error("Sınıflar getirilemedi", error) }
    },

    async talebeleriGetir() {
      this.yukleniyor = true
      this.hata = null
      
      const authStore = useAuthStore()
      const kurumId = authStore.user?.institutionId
      const userId = authStore.user?.id

      if (!kurumId) {
        this.hata = 'Kurum kimliği bulunamadı.'
        this.yukleniyor = false
        return
      }

      try {
        await this.gruplariGetir() 

        // Backend zaten sadece 7 ve 8. sınıf öğrencilerini filtreleyip gönderiyor
        const res = await axios.get('http://localhost:3000/api/students', {
          params: { institutionId: kurumId, userId: userId, isAdmin: this.yetkiliMi }
        })
        this.talebler = res.data

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

      await axios.post('http://localhost:3000/api/students', { ...yeniTalebe, institutionId: kurumId })
      await this.talebeleriGetir()
    },

    async talebeSil(id) {
      if (!confirm('Bu talebeyi silmek istediğinize emin misiniz?')) return
      try {
        await axios.delete(`http://localhost:3000/api/students/${id}`)
        this.talebler = this.talebler.filter(t => t.id !== id)
      } catch (error) { alert('Silme işlemi başarısız oldu.') }
    }
  }
})