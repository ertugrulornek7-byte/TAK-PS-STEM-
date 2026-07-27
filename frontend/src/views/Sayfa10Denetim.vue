<script setup>
import { ref, onMounted, computed } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore' // GÜVENLİK KAPISI EKLENDİ
import axios from 'axios'

const etutStore = useEtutStore()
const authStore = useAuthStore() // GÜVENLİK KAPISI BAŞLATILDI
const islemDurumu = ref('')
const denetimler = ref([])

// Sekme (Tab) Kontrolü
const roller = [
  { id: 'KURUM', ad: 'Kurum Eğitim Mesulü' },
  { id: 'MINTIKA', ad: 'Mıntıka Eğitim Mesulü' },
  { id: 'BOLGE', ad: 'Bölge Eğitim Mesulü' }
]
const seciliRolTab = ref('KURUM')

// Form (İleride sadece yetkililer görecek)
const yeniDenetim = ref({
  inspectorRole: 'KURUM',
  inspectorName: '',
  inspectionDate: '',
  remarks: ''
})

onMounted(async () => {
  await denetimleriCek()
})

const denetimleriCek = async () => {
  const kurumId = authStore.user?.institutionId // HAYALET VERİ ÇÖZÜMÜ
  if (!kurumId) return

  try {
    const res = await axios.get(`http://localhost:3000/api/inspections/${kurumId}`)
    denetimler.value = res.data
  } catch (error) {
    console.error('Denetimler çekilemedi', error)
  }
}

// Filtrelenmiş Liste (Sadece seçili sekmenin denetimlerini gösterir)
const filtrelenmisDenetimler = computed(() => {
  return denetimler.value.filter(d => d.inspectorRole === seciliRolTab.value)
})

// DENETMEN: Yeni Rapor Ekle
const denetimEkle = async () => {
  if (!yeniDenetim.value.inspectorName || !yeniDenetim.value.inspectionDate || !yeniDenetim.value.remarks) {
    alert('Lütfen tüm alanları doldurun!')
    return
  }

  const kurumId = authStore.user?.institutionId // HAYALET VERİ ÇÖZÜMÜ
  if (!kurumId) {
    alert("Kurum kimliği bulunamadı, sayfayı yenileyin.")
    return
  }
  
  islemDurumu.value = 'Rapor Ekleniyor...'
  try {
    await axios.post('http://localhost:3000/api/inspections', {
      institutionId: kurumId, // GÜVENLİ MÜHÜR
      inspectorRole: yeniDenetim.value.inspectorRole,
      inspectorName: yeniDenetim.value.inspectorName,
      inspectionDate: yeniDenetim.value.inspectionDate,
      remarks: yeniDenetim.value.remarks
    })
    
    yeniDenetim.value.inspectorName = ''
    yeniDenetim.value.remarks = ''
    
    islemDurumu.value = 'Başarıyla Eklendi!'
    setTimeout(() => islemDurumu.value = '', 1500)
    await denetimleriCek()
  } catch (error) {
    islemDurumu.value = 'Hata!'
  }
}

// KURUM PERSONELİ: Eksiklerin Durumunu Güncelle
const durumGuncelle = async (id, yeniDurum) => {
  islemDurumu.value = 'Durum Güncelleniyor...'
  try {
    await axios.put(`http://localhost:3000/api/inspections/${id}`, { fixStatus: yeniDurum })
    islemDurumu.value = 'Güncellendi!'
    setTimeout(() => islemDurumu.value = '', 1000)
    await denetimleriCek() // Arayüzü tazele
  } catch (error) {
    alert('Güncellenemedi')
  }
}

// Tarih Formatlayıcı
const tarihFormatla = (tarih) => {
  const d = new Date(tarih)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 10 - Kurum Denetim ve Teftiş Raporları</h2>

    <div class="denetmen-paneli">
      <h3>🔒 Denetmen Veri Girişi (Sadece Yetkililer)</h3>
      <div class="form-grup">
        <select v-model="yeniDenetim.inspectorRole" class="input-text w-rol">
          <option value="KURUM">Kurum E. Mesulü</option>
          <option value="MINTIKA">Mıntıka E. Mesulü</option>
          <option value="BOLGE">Bölge E. Mesulü</option>
        </select>
        <input type="date" v-model="yeniDenetim.inspectionDate" class="input-text w-tarih" title="Kontrol Tarihi" />
        <input type="text" v-model="yeniDenetim.inspectorName" placeholder="Kontrol Eden Hocaefendi Ad-Soyad" class="input-text w-isim" />
      </div>
      <div class="form-grup" style="margin-top: 10px;">
        <textarea v-model="yeniDenetim.remarks" placeholder="Mülahaza (Tespit edilen eksikler, tavsiyeler...)" class="input-text w-mulahaza" rows="2"></textarea>
        <button @click="denetimEkle" class="btn-ekle">Raporu Gönder</button>
      </div>
      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <div class="kurum-paneli">
      
      <div class="sekme-alani">
        <button 
          v-for="rol in roller" :key="rol.id"
          @click="seciliRolTab = rol.id"
          class="btn-sekme"
          :class="{'sekme-aktif': seciliRolTab === rol.id}"
        >
          {{ rol.ad }} Raporları
        </button>
      </div>

      <div class="tablo-kapsayici">
        <table class="etut-table" v-if="filtrelenmisDenetimler.length > 0">
          <thead>
            <tr>
              <th style="width: 120px;">Kontrol Tarihi</th>
              <th style="width: 220px;">Kontrol Eden Hocaefendi</th>
              <th>Mülahaza</th>
              <th style="width: 200px;">Eksiklerin Giderilme Vaziyeti</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rapor in filtrelenmisDenetimler" :key="rapor.id">
              <td class="tarih-hucre"><strong>{{ tarihFormatla(rapor.inspectionDate) }}</strong></td>
              <td class="isim-hucre">👤 {{ rapor.inspectorName }}</td>
              <td class="mulahaza-hucre">{{ rapor.remarks }}</td>
              <td>
                <select 
                  :value="rapor.fixStatus" 
                  @change="durumGuncelle(rapor.id, $event.target.value)"
                  class="durum-select"
                  :class="{
                    'bekliyor': rapor.fixStatus === 'BEKLIYOR',
                    'islemde': rapor.fixStatus === 'ISLEMDE',
                    'giderildi': rapor.fixStatus === 'GIDERILDI'
                  }"
                >
                  <option value="BEKLIYOR">⏳ Bekliyor (Giderilmedi)</option>
                  <option value="ISLEMDE">🛠️ İşlem Yapılıyor</option>
                  <option value="GIDERILDI">✔️ Giderildi</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-else class="uyari-mesaj">
          Bu makam tarafından kurumunuza henüz bir denetim raporu girilmemiştir.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }

/* Denetmen Paneli */
.denetmen-paneli { background: #f8fafc; border: 1px dashed #94a3b8; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
.denetmen-paneli h3 { margin-top: 0; color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; font-size: 1.1rem; }
.form-grup { display: flex; gap: 10px; align-items: stretch; }
.input-text { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; font-family: inherit; }
.w-rol { width: 220px; font-weight: bold; color: #1e293b; background: white; }
.w-tarih { width: 140px; }
.w-isim { flex: 1; }
.w-mulahaza { flex: 1; resize: vertical; min-height: 45px; }
.btn-ekle { background: #0f172a; color: white; border: none; padding: 0 25px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; white-space: nowrap; }
.btn-ekle:hover { background: #334155; }

/* Sekmeler */
.kurum-paneli { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.sekme-alani { display: flex; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; gap: 5px; }
.btn-sekme { padding: 12px 20px; border: none; background: transparent; font-weight: bold; color: #64748b; cursor: pointer; border-radius: 8px 8px 0 0; transition: 0.2s; font-size: 1rem; border-bottom: 3px solid transparent; margin-bottom: -2px; }
.btn-sekme:hover { color: #0f172a; background: #f8fafc; }
.sekme-aktif { color: #2563eb; border-bottom: 3px solid #2563eb; background: #eff6ff; }

/* Tablo */
.tablo-kapsayici { overflow-x: auto; }
.etut-table { width: 100%; border-collapse: collapse; }
.etut-table th, .etut-table td { padding: 15px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
.etut-table th { background-color: #f8fafc; color: #475569; font-size: 0.95rem; text-transform: uppercase; }
.etut-table tr:hover { background-color: #f8fafc; }

.tarih-hucre { color: #334155; font-size: 1.05rem; }
.isim-hucre { font-weight: bold; color: #0f172a; }
.mulahaza-hucre { color: #475569; line-height: 1.5; font-style: italic; background: #f8fafc; border-left: 3px solid #cbd5e1; }

/* Durum Seçici */
.durum-select { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: bold; cursor: pointer; outline: none; font-size: 0.95rem; appearance: none; text-align: center; }
.durum-select.bekliyor { background-color: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
.durum-select.islemde { background-color: #fef9c3; color: #854d0e; border-color: #fde047; }
.durum-select.giderildi { background-color: #dcfce7; color: #166534; border-color: #86efac; }

.toast { margin-top: 15px; background: #dcfce7; color: #166534; padding: 10px; border-radius: 6px; font-weight: bold; text-align: center; }
.uyari-mesaj { background: #eff6ff; color: #1d4ed8; padding: 20px; border-radius: 6px; border: 1px dashed #bfdbfe; font-weight: bold; text-align: center; font-size: 1.1rem; }
</style>