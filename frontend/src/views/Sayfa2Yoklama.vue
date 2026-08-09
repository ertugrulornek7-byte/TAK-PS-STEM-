<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios'

const etutStore = useEtutStore()
const authStore = useAuthStore()
const islemDurumu = ref('')

const seciliAyDegeri = ref(new Date().toISOString().slice(0, 7))
const haftalar = ref([])
const seciliHaftaIndeks = ref(0)
const haftalikYoklamalar = ref({})

// YENİ SİSTEM: Sabit Sınıf Listeleri ve Çözümleyici
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

const sinifAdiniBul = (classId) => {
  const tumSiniflar = [...ORTAOKUL_SINIFLARI, ...LISE_SINIFLARI]
  const sinif = tumSiniflar.find(s => s.id === classId)
  return sinif ? sinif.name : 'Atanmamış / Bağımsız Talebeler'
}

// --- YETKİ KONTROLÜ ---
const isPersonel = computed(() => authStore.user?.roleLevel === 'PERSONEL')
const yetkiliSiniflar = computed(() => authStore.user?.managedClassIds || [])

// FİLTRELEME VE GRUPLAMA MOTORU
const aktifSinifFiltresi = ref('')

// 1. AŞAMA: Önce yetkiye göre öğrencileri süzer
const izinVerilenTalebeler = computed(() => {
  let talebeler = etutStore.gosterilenTalebeler || []
  
  // Eğer giriş yapan kişi sadece 'PERSONEL' (Hoca) ise, SADECE kendi sınıflarını görebilir!
  if (isPersonel.value) {
    talebeler = talebeler.filter(t => yetkiliSiniflar.value.includes(t.classId))
  }
  
  // Kurum Mesulü ve üstü ise herkesi (tüm talebeleri) görür.
  return talebeler
})

// 2. AŞAMA: Filtre dropdown'ını sadece izin verilen sınıflara göre doldurur
const benzersizSinifIsimleri = computed(() => {
  const siniflar = new Set()
  izinVerilenTalebeler.value.forEach(t => {
    if (t.classId) siniflar.add(t.classId)
  })
  return Array.from(siniflar).map(id => ({ id, name: sinifAdiniBul(id) }))
})

// 3. AŞAMA: Ekrana basılacak son listeyi hazırlar
const gruplanmisTalebeler = computed(() => {
  let talebeler = izinVerilenTalebeler.value

  // Hoca dropdown'dan ekstra bir sınıf seçerse sadece onu göster
  if (aktifSinifFiltresi.value) {
    talebeler = talebeler.filter(t => t.classId === aktifSinifFiltresi.value)
  }

  // Sınıflara Göre Grupla
  const gruplar = {}
  talebeler.forEach(t => {
    const sinifAdi = sinifAdiniBul(t.classId)
    if (!gruplar[sinifAdi]) gruplar[sinifAdi] = []
    gruplar[sinifAdi].push(t)
  })

  return gruplar
})

// Gelecek zaman kontrolü için bugünün tarihini sıfırlayarak alıyoruz
const bugunSifirlanmis = new Date()
bugunSifirlanmis.setHours(0,0,0,0)

onMounted(async () => {
  if (etutStore.gosterilenTalebeler.length === 0) {
    await etutStore.talebeleriGetir()
  }
  ayDegisti()
})

const ayDegisti = () => {
  if (!seciliAyDegeri.value) return
  const [yil, ay] = seciliAyDegeri.value.split('-')
  const y = parseInt(yil)
  const m = parseInt(ay) - 1

  const date = new Date(y, m, 1)
  const days = []
  
  while (date.getMonth() === m) {
    if (date.getDay() >= 1 && date.getDay() <= 5) {
      days.push(new Date(date))
    }
    date.setDate(date.getDate() + 1)
  }

  const weeks = []
  let currentWeek = []
  for (let i = 0; i < days.length; i++) {
    currentWeek.push(days[i])
    if (days[i].getDay() === 5 || i === days.length - 1) {
      weeks.push({
        label: `${weeks.length + 1}. Hafta (${tarihGoster(currentWeek[0])} - ${tarihGoster(currentWeek[currentWeek.length-1])})`,
        gunler: [...currentWeek],
        startDate: currentWeek[0].toISOString(),
        endDate: currentWeek[currentWeek.length-1].toISOString()
      })
      currentWeek = []
    }
  }
  
  haftalar.value = weeks
  seciliHaftaIndeks.value = 0 
  haftalikVerileriCek()
}

const haftalikVerileriCek = async () => {
  if (haftalar.value.length === 0) return
  const hafta = haftalar.value[seciliHaftaIndeks.value]
  
  const kurumId = authStore.user?.institutionId
  if (!kurumId) return
  
  try {
    const res = await api.get(`attendance/weekly/${kurumId}/${hafta.startDate}/${hafta.endDate}`)
    haftalikYoklamalar.value = {} 
    
    res.data.forEach(yoklama => {
      const tarihKey = yoklama.date.split('T')[0]
      haftalikYoklamalar.value[`${yoklama.studentId}-${tarihKey}`] = yoklama.status
    })
  } catch (error) {
    console.error('Veriler çekilemedi', error)
  }
}

watch(seciliHaftaIndeks, () => {
  haftalikVerileriCek()
})

const yoklamaKaydet = async (studentId, gunObjesi) => {
  const tarihKey = tarihFormatla(gunObjesi)
  const yeniDurum = haftalikYoklamalar.value[`${studentId}-${tarihKey}`] || ""
  
  islemDurumu.value = 'Kaydediliyor...'
  try {
    const formatliTarih = `${tarihKey}T00:00:00.000Z`
    
    await api.post('attendance', {
      studentId: studentId,
      date: formatliTarih,
      status: yeniDurum
    })
    
    islemDurumu.value = 'Başarıyla Kaydedildi!'
    setTimeout(() => { islemDurumu.value = '' }, 1500)
  } catch (error) {
    if (error.response && error.response.data.error) {
       alert(error.response.data.error);
       haftalikVerileriCek(); 
    }
    islemDurumu.value = 'Kaydedilemedi!'
    setTimeout(() => { islemDurumu.value = '' }, 2000)
    return;
  }

  try {
    const islemTarihi = new Date(tarihKey);
    const ay = islemTarihi.getMonth() + 1; 
    const hafta = Math.ceil(islemTarihi.getDate() / 7);

    await api.post('/tasks/calculate-progress', {
      institutionId: authStore.user?.institutionId,
      userId: authStore.user?.id,
      month: ay,
      week: hafta,
      moduleType: 'YOKLAMA'
    });
  } catch (error) {
    console.error("Görev yüzdesi güncellenemedi", error);
  }
}

const tarihFormatla = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` 
}

const tarihGoster = (date) => {
  return `${date.getDate()}/${date.getMonth() + 1}` 
}

const gunIsmi = (date) => {
  const gunler = ['Pazar', 'Pzt', 'Salı', 'Çarş', 'Perş', 'Cuma', 'Cmt']
  return gunler[date.getDay()]
}

const gelecekTarihMi = (gun) => {
  const gunSifirlanmis = new Date(gun)
  gunSifirlanmis.setHours(0,0,0,0)
  return gunSifirlanmis > bugunSifirlanmis
}
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 2 - Haftalık Yoklama Tablosu</h2>

    <!-- GELİŞMİŞ FİLTRE PANELİ -->
    <div class="filtre-paneli">
      <div class="filtre-grup">
        <label>📅 Ay Seçin:</label>
        <input type="month" v-model="seciliAyDegeri" @change="ayDegisti" class="input-kutu" />
      </div>
      
      <div class="filtre-grup" v-if="haftalar.length > 0">
        <label>🗓️ Hafta Seçin:</label>
        <select v-model="seciliHaftaIndeks" class="input-kutu select-hafta">
          <option v-for="(hafta, index) in haftalar" :key="index" :value="index">
            {{ hafta.label }}
          </option>
        </select>
      </div>

      <!-- YENİ EKLENEN SINIF FİLTRESİ -->
      <div class="filtre-grup" style="margin-left: 20px; border-left: 2px solid #e2e8f0; padding-left: 20px;">
        <label>📚 Sınıf Filtresi:</label>
        <select v-model="aktifSinifFiltresi" class="input-kutu" style="background-color: #f0fdf4; border-color: #86efac; font-weight: bold;">
          <option value="">Tüm Sınıfları Göster</option>
          <option v-for="sinif in benzersizSinifIsimleri" :key="sinif.id" :value="sinif.id">
            Sadece {{ sinif.name }}
          </option>
        </select>
      </div>

      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <!-- SINIFLARA GÖRE GRUPLANMIŞ YOKLAMA TABLOLARI -->
    <div v-if="haftalar.length > 0">
      
      <div v-if="Object.keys(gruplanmisTalebeler).length === 0" class="uyari-mesaj">
        Bu kriterlere uygun talebe bulunamadı.
      </div>

      <div v-for="(ogrenciler, sinifAdi) in gruplanmisTalebeler" :key="sinifAdi" class="sinif-bloku">
        <div class="sinif-basligi">
          <span>📖 {{ sinifAdi }}</span>
          <span class="sinif-mevcudu">{{ ogrenciler.length }} Talebe</span>
        </div>
        
        <table class="etut-table">
          <thead>
            <tr>
              <th style="width: 50px;">Sıra</th>
              <th style="width: 200px;">Ad Soyad</th>
              <th v-for="gun in haftalar[seciliHaftaIndeks].gunler" :key="gun.toISOString()" class="gun-baslik">
                {{ gunIsmi(gun) }} <span class="kucuk-tarih">({{ tarihGoster(gun) }})</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(talebe) in ogrenciler" :key="talebe.id">
              <td>{{ talebe.orderIndex }}</td>
              <td><strong>{{ talebe.fullName }}</strong></td>
              
              <td v-for="gun in haftalar[seciliHaftaIndeks].gunler" :key="gun.toISOString()">
                <select 
                  v-model="haftalikYoklamalar[`${talebe.id}-${tarihFormatla(gun)}`]" 
                  @change="yoklamaKaydet(talebe.id, gun)"
                  class="durum-select"
                  :class="haftalikYoklamalar[`${talebe.id}-${tarihFormatla(gun)}`]?.toLowerCase() || 'bos'"
                  :disabled="gelecekTarihMi(gun)"
                  :title="gelecekTarihMi(gun) ? 'Gelecek tarih için yoklama alınamaz' : ''"
                >
                  <option value="">- Seç -</option>
                  <option value="GELDI">Geldi</option>
                  <option value="GELMEDI">Gelmedi</option>
                  <option value="HASTA">Hasta</option>
                  <option value="IZINLI">İzinli</option>
                  <option value="GEC">Geç</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
    
    <div v-else class="uyari-mesaj">Bu ay için iş günü bulunamadı.</div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }
.filtre-paneli { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.filtre-grup { display: flex; align-items: center; gap: 10px; }
.filtre-grup label { font-weight: bold; color: #334155; }
.input-kutu { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; cursor: pointer; }
.select-hafta { min-width: 250px; background-color: #f8fafc; font-weight: bold; color: #1e293b; }

/* Sınıf Bloku ve Başlığı */
.sinif-bloku { margin-bottom: 35px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 8px; }
.sinif-basligi { background-color: #1e293b; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; font-size: 1.1rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
.sinif-mevcudu { background-color: #3b82f6; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; }

.etut-table { width: 100%; border-collapse: collapse; background: white; border-radius: 0 0 8px 8px; overflow: hidden; table-layout: fixed; }
.etut-table th, .etut-table td { padding: 10px; text-align: center; border: 1px solid #e2e8f0; border-top: none; vertical-align: middle; }
.etut-table th:nth-child(2), .etut-table td:nth-child(2) { text-align: left; }
.etut-table th { background-color: #f8fafc; color: #334155; border-top: 1px solid #e2e8f0; }
.etut-table tr:hover { background-color: #f1f5f9; }

.gun-baslik { font-size: 1rem; font-weight: bold; }
.kucuk-tarih { font-size: 0.85rem; color: #64748b; font-weight: normal; }

.uyari-mesaj { text-align: center; padding: 20px; background: white; border-radius: 8px; color: #64748b; font-weight: bold; }
.toast { margin-left: auto; background: #dcfce7; color: #166534; padding: 8px 15px; border-radius: 6px; font-weight: bold; }

.durum-select { width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1; font-weight: bold; cursor: pointer; outline: none; appearance: none; text-align: center; transition: 0.2s; }
.durum-select:disabled { opacity: 0.4; cursor: not-allowed; background-color: #f1f5f9; border-style: dashed; }
.durum-select.bos { background-color: #f8fafc; color: #94a3b8; }
.durum-select.geldi { background-color: #dcfce7; color: #166534; border-color: #86efac; }
.durum-select.gelmedi { background-color: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
.durum-select.hasta { background-color: #fef9c3; color: #854d0e; border-color: #fde047; }
.durum-select.izinli { background-color: #e0e7ff; color: #3730a3; border-color: #a5b4fc; }
.durum-select.gec { background-color: #ffedd5; color: #9a3412; border-color: #fdba74; }
</style>