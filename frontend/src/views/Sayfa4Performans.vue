<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore' // GÜVENLİK KAPISI EKLENDİ
import axios from 'axios'

const etutStore = useEtutStore()
const authStore = useAuthStore() // GÜVENLİK KAPISI BAŞLATILDI
const islemDurumu = ref('')

const seciliAyDegeri = ref(new Date().toISOString().slice(0, 7))
const haftalar = ref([])
const seciliHaftaIndeks = ref(0)

const notlar = ref({}) 
const iptalDersler = ref({ 1: false, 2: false, 3: false, 4: false, 5: false })

// SENİN BELİRLEDİĞİ DERS İSİMLERİ (İleride Yönetici Panelinden Değiştirilebilir)
const dersIsimleri = ['MATEMATİK', 'FEN', 'SOSYAL', 'İNGİLİZCE', 'TÜRKÇE']

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

  let d = new Date(y, m, 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1)

  const weeks = []
  let haftaNo = 1
  
  while (d.getMonth() === m || weeks.length === 0) {
    const start = new Date(d)
    const end = new Date(d)
    end.setDate(end.getDate() + 6) 

    const cumartesi = new Date(start)
    cumartesi.setDate(cumartesi.getDate() + 5)

    if (cumartesi.getMonth() === m) {
      weeks.push({
        label: `${m + 1}. Ay / ${haftaNo}. Hafta (${tarihGoster(start)} - ${tarihGoster(end)})`,
        startDate: start.toISOString()
      })
      haftaNo++
    }
    d.setDate(d.getDate() + 7)
  }
  
  haftalar.value = weeks
  seciliHaftaIndeks.value = 0 
  haftalikVerileriCek()
}

const haftalikVerileriCek = async () => {
  if (haftalar.value.length === 0) return
  const hafta = haftalar.value[seciliHaftaIndeks.value]
  const kurumId = authStore.user?.institutionId // HAYALET VERİ ÇÖZÜMÜ

  if (!kurumId) return
  
  try {
    const res = await axios.get(`http://localhost:3000/api/performance/${kurumId}/${hafta.startDate}`)
    notlar.value = {}
    
    iptalDersler.value = { 1: false, 2: false, 3: false, 4: false, 5: false }
    res.data.settings.forEach(ayar => {
      iptalDersler.value[ayar.subjectId] = ayar.isCancelled
    })

    res.data.grades.forEach(notKaydi => {
      notlar.value[`${notKaydi.studentId}-${notKaydi.subjectId}`] = notKaydi.score
    })
  } catch (error) {
    console.error('Veriler çekilemedi', error)
  }
}

watch(seciliHaftaIndeks, () => {
  haftalikVerileriCek()
})

// İCMAL HESAPLAMA (BOŞ ile 0 FARKI DÜZELTİLDİ)
const hesaplaIcmal = (studentId) => {
  let aktifDersSayisi = 0
  let toplamPuan = 0
  let islemGorduMu = false

  for(let i = 1; i <= 5; i++) {
    if (!iptalDersler.value[i]) {
      const val = notlar.value[`${studentId}-${i}`]

      if (val === -1 || val === "-1") {
        islemGorduMu = true;
      } 
      else if (val !== undefined && val !== null && val !== '') {
        aktifDersSayisi++;
        toplamPuan += parseInt(val);
        islemGorduMu = true;
      } 
      else {
        aktifDersSayisi++;
      }
    }
  }

  // YENİ MANTIK: Eğer öğretmenin henüz hiçbir dokunuşu (notu/izni) yoksa, 0 değil "null" (Boş) döndür!
  if (aktifDersSayisi === 0 || !islemGorduMu) return null

  let katsayi = 0
  if (aktifDersSayisi === 5) katsayi = 4
  if (aktifDersSayisi === 4) katsayi = 5
  if (aktifDersSayisi === 3) katsayi = 6.6
  if (aktifDersSayisi === 2) katsayi = 10
  if (aktifDersSayisi === 1) katsayi = 20

  let icmalPuan = Math.round(toplamPuan * katsayi)
  
  if (aktifDersSayisi === 3 && toplamPuan > 0) {
    icmalPuan += 1
  }

  if (icmalPuan > 100) icmalPuan = 100

  return icmalPuan // Tüm derslere izinsiz girmediyse buradan gerçek ve sert bir "0" çıkar.
}

// SINIF ORTALAMASI (0 ALANLARI ACIMADAN HESABA KATAR)
const sinifOrtalamasi = computed(() => {
  let toplamIcmal = 0
  let aktifOgrenciSayisi = 0

  etutStore.gosterilenTalebeler.forEach(t => {
    const icmal = hesaplaIcmal(t.id)
    // YENİ MANTIK: Sadece "null" olmayanları (Yani işlem görenleri) hesaba kat. Sıfır (0) alan da hesaba girsin!
    if (icmal !== null) {
      toplamIcmal += icmal
      aktifOgrenciSayisi++
    }
  })

  if (aktifOgrenciSayisi === 0) return 0
  return Math.round(toplamIcmal / aktifOgrenciSayisi)
})

const notKaydet = async (studentId, subjectId) => {
  const hafta = haftalar.value[seciliHaftaIndeks.value]
  const puan = notlar.value[`${studentId}-${subjectId}`]
  
  if (puan === "" || puan === undefined) return;

  islemDurumu.value = 'Kaydediliyor...'
  try {
    await axios.post('http://localhost:3000/api/performance', {
      studentId,
      weekStartDate: hafta.startDate,
      subjectId,
      score: parseInt(puan) // Veritabanına sayı olarak yolla
    })
    islemDurumu.value = 'Kaydedildi!'
    setTimeout(() => islemDurumu.value = '', 1000)

    // 🔥 İŞTE BİZİM EFSANE MOTOR TETİKLEYİCİSİ BURAYA EKLENDİ! 🔥
    const islemTarihi = new Date(hafta.startDate);
    const ay = islemTarihi.getMonth() + 1;
    const haftaNo = Math.ceil(islemTarihi.getDate() / 7);

    await axios.post('http://localhost:3000/api/tasks/calculate-progress', {
      institutionId: authStore.user?.institutionId,
      userId: authStore.user?.id,
      month: ay,
      week: haftaNo,
      moduleType: 'PERFORMANS'
    }).catch(err => console.log("Motor arka planda çalışırken ufak bir takılma yaşadı.", err));
    
    console.log("🚀 Performans motoru tetiklendi (Not Girildi)!");

  } catch (error) {
    if (error.response && error.response.data.error) alert(error.response.data.error)
    haftalikVerileriCek()
  }
}

const dersIptalEtToggle = async (subjectId) => {
  const hafta = haftalar.value[seciliHaftaIndeks.value]
  const kurumId = authStore.user?.institutionId // HAYALET VERİ ÇÖZÜMÜ

  if (!kurumId) {
    alert("Kurum kimliği bulunamadı, sayfayı yenileyin.")
    return
  }

  iptalDersler.value[subjectId] = !iptalDersler.value[subjectId]
  
  islemDurumu.value = 'Güncelleniyor...'
  try {
    // 1. KENDİ NORMAL KAYDINI YAP (Buradan moduleType'ı sildik)
    await axios.post('http://localhost:3000/api/performance/settings', {
      institutionId: kurumId, // GÜVENLİ MÜHÜR
      weekStartDate: hafta.startDate,
      subjectId,
      isCancelled: iptalDersler.value[subjectId]
    })
    islemDurumu.value = 'Güncellendi!'
    setTimeout(() => islemDurumu.value = '', 1000)
    
    if (iptalDersler.value[subjectId]) {
      haftalikVerileriCek()
    }

    // 2. İŞTE BİZİM EFSANE MOTOR TETİKLEYİCİSİ BURAYA GELECEK!
    const islemTarihi = new Date(hafta.startDate);
    const ay = islemTarihi.getMonth() + 1;
    const haftaNo = Math.ceil(islemTarihi.getDate() / 7);

    await axios.post('http://localhost:3000/api/tasks/calculate-progress', {
      institutionId: authStore.user?.institutionId,
      userId: authStore.user?.id,
      month: ay,
      week: haftaNo,
      moduleType: 'PERFORMANS'
    });
    console.log("🚀 Performans motoru tetiklendi!");

  } catch (error) {
    alert('Hata oluştu')
    iptalDersler.value[subjectId] = !iptalDersler.value[subjectId] 
  }
}

const gelecekTarihMi = computed(() => {
  if (haftalar.value.length === 0) return false
  const haftaStart = new Date(haftalar.value[seciliHaftaIndeks.value].startDate)
  haftaStart.setHours(0,0,0,0)
  return haftaStart > bugunSifirlanmis
})

const tarihGoster = (date) => `${date.getDate()}/${date.getMonth() + 1}`
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 4 - Dershane Performans Notu (İcmal)</h2>

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
      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <table class="etut-table" v-if="haftalar.length > 0">
      <thead>
        <tr>
          <th style="width: 50px;">Sıra</th>
          <th style="width: 200px;">Ad Soyad</th>
          <th v-for="(dersAd, index) in dersIsimleri" :key="index" class="ders-baslik" :class="{'iptal-baslik': iptalDersler[index + 1]}">
            <span class="ders-isim">{{ dersAd }}</span>
            <button @click="dersIptalEtToggle(index + 1)" class="btn-iptal" :class="{'aktif': iptalDersler[index + 1]}" :disabled="gelecekTarihMi">
              {{ iptalDersler[index + 1] ? 'Dersi Aç' : 'Hoca Gelmedi (İptal)' }}
            </button>
          </th>
          <th class="icmal-baslik">📈 İCMAL Puanı</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(talebe, index) in etutStore.gosterilenTalebeler" :key="talebe.id">
          <td>{{ talebe.orderIndex }}</td>
          <td><strong>{{ talebe.fullName }}</strong></td>
          
          <td v-for="i in 5" :key="i" :class="{'iptal-cizgisi': iptalDersler[i]}">
            <select 
              v-model="notlar[`${talebe.id}-${i}`]" 
              @change="notKaydet(talebe.id, i)"
              class="durum-select"
              :class="{
                'puan-girdi': notlar[`${talebe.id}-${i}`] > 0,
                'izinli-durum': notlar[`${talebe.id}-${i}`] == -1,
                'izinsiz-durum': notlar[`${talebe.id}-${i}`] == 0 
              }"
              :disabled="gelecekTarihMi || iptalDersler[i]"
            >
              <option value="" disabled>- Not Seç -</option>
              <option value="-1">🔵 İzinli / Raporlu (Etkilemez)</option>
              <option value="0">🔴 İzinsiz Girmedi (0 Puan)</option>
              <option value="1">1 Puan ⭐</option>
              <option value="2">2 Puan ⭐⭐</option>
              <option value="3">3 Puan ⭐⭐⭐</option>
              <option value="4">4 Puan ⭐⭐⭐⭐</option>
              <option value="5">5 Puan ⭐⭐⭐⭐⭐</option>
            </select>
          </td>

          <td class="icmal-sutun">
            <div class="icmal-kutu" 
                 :class="{
                   'basarili': hesaplaIcmal(talebe.id) >= 80, 
                   'zayif': hesaplaIcmal(talebe.id) !== null && hesaplaIcmal(talebe.id) < 50
                 }">
              {{ hesaplaIcmal(talebe.id) !== null ? hesaplaIcmal(talebe.id) + ' / 100' : 'Girmedi' }}
            </div>
          </td>
        </tr>
      </tbody>
      
      <tfoot>
        <tr class="ortalama-satiri">
          <td colspan="7" style="text-align: right;"><strong>📊 Bu Haftanın Sınıf İcmal Ortalaması (Girmeyenler Hariç):</strong></td>
          <td class="icmal-sutun">
            <div class="icmal-kutu ortalama-kutu">
              {{ sinifOrtalamasi }} / 100
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
    
    <div v-else class="uyari-mesaj">Bu ay için cumartesi hesaplamasına uyan hafta bulunamadı.</div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }
.filtre-paneli { display: flex; align-items: center; gap: 20px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.filtre-grup { display: flex; align-items: center; gap: 10px; }
.filtre-grup label { font-weight: bold; color: #334155; }
.input-kutu { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; cursor: pointer; }
.select-hafta { min-width: 250px; background-color: #f8fafc; font-weight: bold; color: #1e293b; }

.etut-table { width: 100%; border-collapse: collapse; box-shadow: 0 1px 3px rgba(0,0,0,0.1); background: white; border-radius: 8px; overflow: hidden; }
.etut-table th, .etut-table td { padding: 10px; text-align: center; border: 1px solid #e2e8f0; vertical-align: middle; }
.etut-table th:nth-child(2), .etut-table td:nth-child(2) { text-align: left; }
.etut-table th { background-color: #f8fafc; color: #334155; }
.etut-table tr:hover { background-color: #f1f5f9; }

/* DERS BAŞLIKLARI YATAY HALE GETİRİLDİ */
.ders-baslik { text-align: center; min-width: 140px; }
.ders-isim { font-weight: bold; display: block; margin-bottom: 8px; font-size: 1.05rem; letter-spacing: 0.5px; }
.iptal-baslik { background-color: #fee2e2 !important; color: #b91c1c !important; }
.btn-iptal { font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; background: white; cursor: pointer; color: #475569; display: inline-block; width: 100%; }
.btn-iptal.aktif { background: #ef4444; color: white; border-color: #dc2626; font-weight: bold; }
.btn-iptal:disabled { opacity: 0.5; cursor: not-allowed; }

.durum-select { width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1; font-weight: bold; cursor: pointer; outline: none; text-align: center; background-color: #f8fafc; color: #64748b; }
.durum-select.puan-girdi { background-color: #fffbeb; color: #b45309; border-color: #fde68a; }
.durum-select.izinli-durum { background-color: #eff6ff; color: #1d4ed8; border-color: #93c5fd; }
.durum-select.izinsiz-durum { background-color: #fef2f2; color: #b91c1c; border-color: #fca5a5; }
.durum-select:disabled { opacity: 0.5; cursor: not-allowed; }

.iptal-cizgisi { background: repeating-linear-gradient( 45deg, #f8fafc, #f8fafc 10px, #fee2e2 10px, #fee2e2 20px ); pointer-events: none; }

.icmal-baslik { font-size: 1.1rem; color: #1e3a8a !important; background-color: #eff6ff !important; min-width: 120px; }
.icmal-sutun { background-color: #f8fafc; }
.icmal-kutu { background: #e2e8f0; padding: 8px; border-radius: 6px; font-weight: bold; font-size: 1.1rem; color: #334155; }
.icmal-kutu.basarili { background: #dcfce7; color: #166534; }
.icmal-kutu.zayif { background: #fee2e2; color: #b91c1c; }

.ortalama-satiri { background-color: #e0e7ff !important; }
.ortalama-kutu { background: #3730a3; color: white; font-size: 1.2rem; }

.toast { margin-left: auto; background: #dcfce7; color: #166534; padding: 8px 15px; border-radius: 6px; font-weight: bold; }
.uyari-mesaj { background: #fffbeb; color: #b45309; padding: 15px; border-radius: 6px; border: 1px solid #fde68a; font-weight: bold; margin-top: 20px; }
</style>