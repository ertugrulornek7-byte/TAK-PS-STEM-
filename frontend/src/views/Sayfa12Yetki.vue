<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios'

const authStore = useAuthStore()

const kurumlar = ref([])
const seciliKurumId = ref('')
const seciliKurumNevi = ref('ORTAOKUL')
const personeller = ref([])
const islemDurumu = ref('')
const yetkiForm = ref({})

// ==========================================
// YENİ SİSTEM: SABİT SINIFLAR
// ==========================================
const ORTAOKUL_SINIFLARI = [
  { id: '4_NEHARI', name: '4. Sınıf Nehari' },
  { id: '5_SINIF', name: '5. Sınıf' },
  { id: '6_SINIF', name: '6. Sınıf' },
  { id: '7_SINIF', name: '7. Sınıf' },
  { id: '8_SINIF', name: '8. Sınıf' }
]

const LISE_SINIFLARI = [
  { id: '8_NEHARI', name: '8. Sınıf Nehari' },
  { id: 'LISE_1', name: 'Lise 1' },
  { id: 'LISE_2', name: 'Lise 2' },
  { id: 'LISE_3', name: 'Lise 3' }
]

const aktifSiniflar = computed(() => {
  return seciliKurumNevi.value === 'LISE' ? LISE_SINIFLARI : ORTAOKUL_SINIFLARI
})

// ==========================================
// YETKİ KALKANI MOTORU
// ==========================================
const yetkiliMi = computed(() => {
  const role = authStore.user?.roleLevel
  return role && role !== 'PERSONEL' // Personel bu sayfayı GÖREMEZ
})

const ustMakamMi = computed(() => {
  const role = authStore.user?.roleLevel
  return role === 'SISTEM' || role === 'BOLGE' || role === 'MINTIKA'
})

const kurumlariGetir = async () => {
  if (!authStore.user) return;

  // Eğer üst makam (Sistem, Bölge, Mıntıka) DEĞİLSE:
  if (!ustMakamMi.value) {
    // Kurum mesulü ise kendi kurumunu seç ve personelleri getir
    if (authStore.user.roleLevel === 'KURUM') {
      seciliKurumId.value = authStore.user.institutionId || ''
      seciliKurumNevi.value = authStore.user.institution?.nevi || 'ORTAOKUL'
      if (seciliKurumId.value) {
        await personelleriVeYetkileriGetir()
      }
    }
    // GÜVENLİK KİLİDİ: Kurum veya Personel fark etmez, buradan aşağıya inemez! 403 yememek için durduruyoruz.
    return; 
  }
  
  // Sadece ÜST MAKAMLAR (Sistem, Bölge, Mıntıka) buraya ulaşıp tüm kurumları çekebilir
  try {
    const res = await api.get('/hierarchy/institutions')
    kurumlar.value = res.data || []
  } catch (error) {
    console.error("Kurumlar çekilemedi:", error)
  }
}

const personelleriVeYetkileriGetir = async () => {
  if (!seciliKurumId.value) return

  if (ustMakamMi.value) {
    const kurum = kurumlar.value.find(k => k.id === seciliKurumId.value)
    if (kurum) seciliKurumNevi.value = kurum.nevi || 'ORTAOKUL'
  }

  try {
    islemDurumu.value = 'Personeller Yükleniyor...'
    const res = await api.get(`/hierarchy/personnel/${seciliKurumId.value}`)
    personeller.value = res.data || []

    yetkiForm.value = {}
    personeller.value.forEach(p => {
      yetkiForm.value[p.id] = {
        classes: p.managedClassIds || [] 
      }
    })
    islemDurumu.value = '' 
  } catch (error) { 
    islemDurumu.value = 'HATA: Personeller alınamadı!'
  }
}

const yetkiKaydet = async (userId) => {
  try {
    await api.post('/hierarchy/assign-personnel', {
      userId: userId, 
      classIds: yetkiForm.value[userId].classes,
      institutionId: seciliKurumId.value
    })
    alert("Yetkiler Başarıyla Kaydedildi!")
  } catch (error) {
    alert("HATA: Yetki Kaydedilemedi! " + (error.response?.data?.error || error.message))
  }
}

onMounted(() => {
  if (authStore.user) {
    kurumlariGetir()
  }
})

watch(() => authStore.user, (yeniUser) => {
  if (yeniUser) {
    kurumlariGetir()
  }
}, { immediate: true })
</script>

<template>
  <div class="sayfa-container" v-if="yetkiliMi">
    <h2>Hiyerarşi ve Görevlendirme Matrisi</h2>
    <p class="aciklama">Personellerin sorumlu oldukları sınıfları bu ekrandan atayabilirsiniz.</p>

    <!-- ÜST MAKAMLAR İÇİN KURUM SEÇİCİ -->
    <div v-if="ustMakamMi" class="filtre-karti">
      <label>İşlem Yapılacak Kurumu Seçin:</label>
      <select v-model="seciliKurumId" @change="personelleriVeYetkileriGetir" class="kurum-select">
        <option value="" disabled>Kurum Seçiniz...</option>
        <option v-for="kurum in kurumlar" :key="kurum.id" :value="kurum.id">
          {{ kurum.name }} ({{ kurum.nevi || 'ORTAOKUL' }})
        </option>
      </select>
    </div>

    <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('HATA')}">{{ islemDurumu }}</div>

    <div class="yetki-paneli" v-if="seciliKurumId">
      <div class="panel-baslik">
        <h3>👨‍🏫 Personel Görevlendirme</h3>
        <span class="nevi-etiket">Aktif Sistem: {{ seciliKurumNevi }} Sınıfları</span>
      </div>

      <table class="etut-table" v-if="personeller.length > 0">
        <thead>
          <tr>
            <th style="width: 200px;">Personel Adı</th>
            <th>Sorumlu Olduğu Sınıflar</th>
            <th style="width: 120px; text-align: center;">İşlem</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="personel in personeller" :key="personel.id">
            <td><strong>{{ personel.fullName }}</strong> <br><small style="color: gray;">{{ personel.roleLevel }}</small></td>
            <td>
              <div class="checkbox-grid" v-if="yetkiForm[personel.id]">
                <label v-for="sinif in aktifSiniflar" :key="sinif.id" class="check-kutu">
                  <input type="checkbox" :value="sinif.id" v-model="yetkiForm[personel.id].classes">
                  {{ sinif.name }}
                </label>
              </div>
            </td>
            <td style="text-align: center;">
              <button @click="yetkiKaydet(personel.id)" class="btn-kaydet">💾 Kaydet</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="uyari-mesaj">Bu kurumda kayıtlı personel bulunamadı.</div>
    </div>
  </div>
  
  <div class="sayfa-container" v-else>
    <div class="uyari-mesaj">Yetkisiz Erişim: Bu sayfayı görüntüleme izniniz bulunmamaktadır.</div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; max-width: 1200px; margin: 0 auto; }
.aciklama { color: #64748b; margin-bottom: 20px; }
.filtre-karti { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px; border-left: 4px solid #3b82f6; }
.filtre-karti label { font-weight: bold; color: #1e293b; }
.kurum-select { padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; width: 100%; max-width: 400px; }
.yetki-paneli { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.panel-baslik { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
.panel-baslik h3 { margin: 0; color: #1e293b; }
.nevi-etiket { background: #eff6ff; color: #1d4ed8; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; border: 1px solid #bfdbfe; }
.etut-table { width: 100%; border-collapse: collapse; }
.etut-table th, .etut-table td { padding: 15px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
.etut-table th { background-color: #f8fafc; color: #334155; font-size: 0.9rem; text-transform: uppercase; }
.checkbox-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.check-kutu { display: flex; align-items: center; gap: 5px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #cbd5e1; cursor: pointer; font-weight: 500; transition: 0.2s; }
.check-kutu:hover { border-color: #3b82f6; }
.btn-kaydet { padding: 10px 15px; background-color: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.2s; }
.btn-kaydet:hover { background-color: #059669; }
.toast { margin-bottom: 20px; background: #dcfce7; color: #166534; padding: 12px 20px; border-radius: 6px; font-weight: bold; text-align: center; }
.toast.hata { background: #fee2e2; color: #b91c1c; }
.uyari-mesaj { background: #fffbeb; color: #b45309; padding: 20px; border-radius: 6px; text-align: center; font-weight: bold; border: 1px dashed #fcd34d; }
</style>