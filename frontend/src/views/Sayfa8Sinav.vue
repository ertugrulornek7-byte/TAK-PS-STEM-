<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios' // GÜVENLİ API

const etutStore = useEtutStore()
const authStore = useAuthStore()
const islemDurumu = ref('')

// Sınav Kontrol Değişkenleri
const sinavTuru = ref('KDU') // 'KDU' veya 'DENEME'
const aktifSinavNo = ref(1) 
const sinavSayisi = ref(1) 

const notlar = ref({})

const dersler = [
  { id: 'turkce', ad: 'Türkçe' },
  { id: 'sosyal', ad: 'Sosyal B.' },
  { id: 'matematik', ad: 'Matematik' },
  { id: 'ingilizce', ad: 'İngilizce' },
  { id: 'fen', ad: 'Fen B.' },
  { id: 'din', ad: 'Din K.' }
]

// ==========================================
// YENİ SİSTEM: SINIF FİLTRELEME VE GRUPLAMA MOTORU
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

const sinifAdiniBul = (classId) => {
  const tumSiniflar = [...ORTAOKUL_SINIFLARI, ...LISE_SINIFLARI]
  const sinif = tumSiniflar.find(s => s.id === classId)
  return sinif ? sinif.name : 'Atanmamış / Bağımsız Talebeler'
}

const isPersonel = computed(() => authStore.user?.roleLevel === 'PERSONEL')
const yetkiliSiniflar = computed(() => authStore.user?.managedClassIds || [])

const aktifSinifFiltresi = ref('')

const izinVerilenTalebeler = computed(() => {
  let talebeler = etutStore.gosterilenTalebeler || []
  if (isPersonel.value) {
    talebeler = talebeler.filter(t => yetkiliSiniflar.value.includes(t.classId))
  }
  return talebeler
})

const benzersizSinifIsimleri = computed(() => {
  const siniflar = new Set()
  izinVerilenTalebeler.value.forEach(t => {
    if (t.classId) siniflar.add(t.classId)
  })
  return Array.from(siniflar).map(id => ({ id, name: sinifAdiniBul(id) }))
})

const gruplanmisTalebeler = computed(() => {
  let talebeler = izinVerilenTalebeler.value
  if (aktifSinifFiltresi.value) {
    talebeler = talebeler.filter(t => t.classId === aktifSinifFiltresi.value)
  }
  const gruplar = {}
  talebeler.forEach(t => {
    const sinifAdi = sinifAdiniBul(t.classId)
    if (!gruplar[sinifAdi]) gruplar[sinifAdi] = []
    gruplar[sinifAdi].push(t)
  })
  return gruplar
})
// ==========================================

onMounted(async () => {
  if (etutStore.gosterilenTalebeler.length === 0) {
    await etutStore.talebeleriGetir()
  }
  await verileriCek()
})

watch([sinavTuru, aktifSinavNo], async () => {
  await verileriCek()
})

watch(sinavTuru, () => {
  aktifSinavNo.value = 1
})

const verileriCek = async () => {
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) return

  try {
    const res = await api.get(`/mock-exams/${kurumId}/${sinavTuru.value}/${aktifSinavNo.value}`)
    
    sinavSayisi.value = res.data.count

    notlar.value = {}
    etutStore.gosterilenTalebeler.forEach(t => {
      notlar.value[t.id] = { turkce: '', sosyal: '', matematik: '', ingilizce: '', fen: '', din: '', score: '' }
    })

    res.data.results.forEach(k => {
      notlar.value[k.studentId] = {
        turkce: k.turkce !== null ? k.turkce : '',
        sosyal: k.sosyal !== null ? k.sosyal : '',
        matematik: k.matematik !== null ? k.matematik : '',
        ingilizce: k.ingilizce !== null ? k.ingilizce : '',
        fen: k.fen !== null ? k.fen : '',
        din: k.din !== null ? k.din : '',
        score: k.score !== null ? k.score : ''
      }
    })
  } catch (error) {
    console.error('Veriler çekilemedi', error)
  }
}

const sinavEkle = async () => {
  sinavSayisi.value++
  aktifSinavNo.value = sinavSayisi.value 
  await sinavAyariniKaydet()
}

const sinavCikar = async () => {
  if (sinavSayisi.value > 1) {
    sinavSayisi.value--
    if (aktifSinavNo.value > sinavSayisi.value) aktifSinavNo.value = sinavSayisi.value
    await sinavAyariniKaydet()
  }
}

const sinavAyariniKaydet = async () => {
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) {
    alert("Kurum kimliği bulunamadı, sayfayı yenileyin.")
    return
  }

  try {
    await api.post('/mock-exams/settings', {
      institutionId: kurumId, 
      examType: sinavTuru.value,
      count: sinavSayisi.value
    })
    await verileriCek()
  } catch (error) { alert('Sınav ayarı kaydedilemedi') }
}

const maxNetSorgula = (dersId) => {
  if (sinavTuru.value === 'DENEME' && ['turkce', 'matematik', 'fen'].includes(dersId)) {
    return 20
  }
  return 10
}

const hesaplaPuan = (studentId) => {
  const v = notlar.value[studentId]
  if (!v) return null

  const katsayilar = { turkce: 4, matematik: 4, fen: 4, sosyal: 1, ingilizce: 1, din: 1 }
  
  let ogrenciHamPuan = 0
  let maxHamPuan = 0
  let islemGorduMu = false

  dersler.forEach(d => {
    const maxNet = maxNetSorgula(d.id)
    maxHamPuan += maxNet * katsayilar[d.id]

    if (v[d.id] !== '' && v[d.id] !== null) {
      ogrenciHamPuan += parseFloat(v[d.id]) * katsayilar[d.id]
      islemGorduMu = true
    }
  })

  if (!islemGorduMu) return null

  let hesaplananPuan = (ogrenciHamPuan / maxHamPuan) * 500
  if (hesaplananPuan < 0) hesaplananPuan = 0
  if (hesaplananPuan > 500) hesaplananPuan = 500

  return hesaplananPuan.toFixed(2)
}

const sinavKaydet = async (studentId, dersId) => {
  const ogrenciVeri = notlar.value[studentId]
  
  if (dersId && dersId !== 'score') {
    const max = maxNetSorgula(dersId)
    if (parseFloat(ogrenciVeri[dersId]) > max) {
      alert(`Hata! Bu ders için maksimum ${max} net girilebilir.`)
      ogrenciVeri[dersId] = max
    }
  }

  const otomatikPuan = hesaplaPuan(studentId)
  ogrenciVeri.score = otomatikPuan 

  islemDurumu.value = 'Kaydediliyor...'
  try {
    await api.post('/mock-exams/result', {
      studentId: studentId,
      examType: sinavTuru.value,
      examNumber: aktifSinavNo.value,
      turkce: ogrenciVeri.turkce !== '' ? parseFloat(ogrenciVeri.turkce) : null,
      sosyal: ogrenciVeri.sosyal !== '' ? parseFloat(ogrenciVeri.sosyal) : null,
      matematik: ogrenciVeri.matematik !== '' ? parseFloat(ogrenciVeri.matematik) : null,
      ingilizce: ogrenciVeri.ingilizce !== '' ? parseFloat(ogrenciVeri.ingilizce) : null,
      fen: ogrenciVeri.fen !== '' ? parseFloat(ogrenciVeri.fen) : null,
      din: ogrenciVeri.din !== '' ? parseFloat(ogrenciVeri.din) : null,
      score: otomatikPuan !== null ? parseFloat(otomatikPuan) : null
    })
    islemDurumu.value = 'Kaydedildi!'
    setTimeout(() => islemDurumu.value = '', 1000)
  } catch (error) {
    islemDurumu.value = 'Hata!'
  }
}

const ogrenciToplamNet = (studentId) => {
  const v = notlar.value[studentId]
  if (!v) return 0
  let toplam = 0
  dersler.forEach(d => {
    if (v[d.id] !== '' && v[d.id] !== null) toplam += parseFloat(v[d.id])
  })
  return toplam.toFixed(2) 
}

// 🔥 HER SINIFIN ORTALAMASINI AYRI HESAPLAYAN YENİ FONKSİYONLAR 🔥
const sinifDersOrtalamasi = (ogrenciler, dersId) => {
  let toplam = 0, sayi = 0
  ogrenciler.forEach(t => {
    const val = notlar.value[t.id]?.[dersId]
    if (val !== '' && val !== null && val !== undefined) { 
      toplam += parseFloat(val); sayi++ 
    }
  })
  return sayi > 0 ? (toplam / sayi).toFixed(2) : '-'
}

const sinifGenelNetOrtalamasi = (ogrenciler) => {
  let toplam = 0, sayi = 0
  ogrenciler.forEach(t => {
    const net = parseFloat(ogrenciToplamNet(t.id))
    if (net > 0) { toplam += net; sayi++ }
  })
  return sayi > 0 ? (toplam / sayi).toFixed(2) : '-'
}
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 8 - KDU ve Deneme Takibi</h2>

    <div class="kontrol-paneli">
      <div class="salter-kutusu">
        <button @click="sinavTuru = 'KDU'" class="btn-salter" :class="{'aktif-kdu': sinavTuru === 'KDU'}">🎯 KDU</button>
        <button @click="sinavTuru = 'DENEME'" class="btn-salter" :class="{'aktif-deneme': sinavTuru === 'DENEME'}">📝 DENEME</button>
      </div>

      <div class="ayirici"></div>

      <div class="sekme-alani">
        <button 
          v-for="i in sinavSayisi" :key="i"
          @click="aktifSinavNo = i"
          class="btn-sekme"
          :class="{'sekme-aktif': aktifSinavNo === i}"
        >
          {{ sinavTuru }} {{ i }}
        </button>
        
        <div class="sekme-ayar-butonlari">
          <button @click="sinavCikar" class="btn-ayar kirmizi" :disabled="sinavSayisi === 1" title="Sınav Çıkar">-</button>
          <button @click="sinavEkle" class="btn-ayar yesil" title="Yeni Sınav Ekle">+</button>
        </div>
      </div>

      <div class="ayirici"></div>

      <!-- YENİ EKLENEN SINIF FİLTRESİ -->
      <div class="filtre-grup">
        <select v-model="aktifSinifFiltresi" class="ay-input" style="background-color: #f0fdf4; border-color: #86efac; font-weight: bold;">
          <option value="">📚 Tüm Sınıfları Göster</option>
          <option v-for="sinif in benzersizSinifIsimleri" :key="sinif.id" :value="sinif.id">
            Sadece {{ sinif.name }}
          </option>
        </select>
      </div>

      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <!-- SINIFLARA GÖRE GRUPLANMIŞ SINAV TABLOLARI -->
    <div v-if="Object.keys(notlar).length > 0">
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
              <th style="width: 180px;">Ad Soyad</th>
              
              <th v-for="ders in dersler" :key="ders.id" class="ders-baslik">
                {{ ders.ad }}
                <div class="max-net-yazisi">(Max {{ maxNetSorgula(ders.id) }})</div>
              </th>

              <th class="icmal-baslik">📈 TOPLAM NET</th>
              <th class="puan-baslik">🏆 PUAN (500)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(talebe) in ogrenciler" :key="talebe.id">
              <td>{{ talebe.orderIndex }}</td>
              <td><strong>{{ talebe.fullName }}</strong></td>
              
              <td v-for="ders in dersler" :key="ders.id" class="net-hucre">
                <input type="number" 
                       step="0.25"
                       v-model="notlar[talebe.id][ders.id]" 
                       @blur="sinavKaydet(talebe.id, ders.id)"
                       class="not-input" 
                       :max="maxNetSorgula(ders.id)"
                       placeholder="-" />
              </td>

              <td class="icmal-hucre">
                <strong>{{ ogrenciToplamNet(talebe.id) }}</strong>
              </td>

              <td class="puan-hucre">
                <div class="puan-kutu" v-if="hesaplaPuan(talebe.id) !== null">
                  {{ hesaplaPuan(talebe.id) }}
                </div>
                <div v-else class="puan-kutu bos-puan">-</div>
              </td>
            </tr>
          </tbody>
          
          <tfoot>
            <tr class="analiz-satiri">
              <td colspan="2" style="text-align: right;"><strong>📊 {{ sinifAdi }} Ortalamaları:</strong></td>
              
              <td v-for="ders in dersler" :key="ders.id" class="net-hucre">
                <strong>{{ sinifDersOrtalamasi(ogrenciler, ders.id) }}</strong>
              </td>
              
              <td class="icmal-hucre" style="color:#1d4ed8;">
                <strong>{{ sinifGenelNetOrtalamasi(ogrenciler) }}</strong>
              </td>
              
              <td class="puan-hucre">
                <strong>{{ sinifDersOrtalamasi(ogrenciler, 'score') }}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }

.kontrol-paneli { display: flex; align-items: center; gap: 15px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex-wrap: wrap; }
.ayirici { width: 2px; height: 35px; background-color: #e2e8f0; margin: 0 5px; }
.ay-input { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; cursor: pointer; }

/* Sınıf Bloku ve Başlığı */
.sinif-bloku { margin-bottom: 35px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 8px; }
.sinif-basligi { background-color: #1e293b; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; font-size: 1.1rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
.sinif-mevcudu { background-color: #3b82f6; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; }

.salter-kutusu { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; border: 1px solid #cbd5e1; }
.btn-salter { padding: 10px 20px; font-weight: bold; border: none; background: transparent; color: #64748b; cursor: pointer; border-radius: 6px; transition: 0.2s; font-size: 1rem; }
.btn-salter:hover { color: #334155; }
.aktif-kdu { background: #8b5cf6; color: white !important; box-shadow: 0 2px 4px rgba(139, 92, 246, 0.3); }
.aktif-deneme { background: #f59e0b; color: white !important; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3); }

.sekme-alani { display: flex; align-items: center; gap: 8px; flex: 1; overflow-x: auto; padding-bottom: 5px; }
.btn-sekme { padding: 10px 15px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: bold; color: #475569; border-radius: 6px 6px 0 0; cursor: pointer; transition: 0.2s; border-bottom: 3px solid transparent; white-space: nowrap; }
.btn-sekme:hover { background: #f1f5f9; }
.sekme-aktif { background: white; color: #0f172a; border-bottom: 3px solid #3b82f6; box-shadow: 0 -2px 4px rgba(0,0,0,0.02); }

.sekme-ayar-butonlari { display: flex; gap: 4px; margin-left: 10px; }
.btn-ayar { width: 30px; height: 30px; border: none; border-radius: 4px; font-weight: bold; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
.btn-ayar.yesil { background: #10b981; } .btn-ayar.yesil:hover { background: #059669; }
.btn-ayar.kirmizi { background: #ef4444; } .btn-ayar.kirmizi:hover { background: #dc2626; }
.btn-ayar:disabled { opacity: 0.5; cursor: not-allowed; }

.etut-table { width: 100%; border-collapse: collapse; background: white; border-radius: 0 0 8px 8px; overflow: hidden; }
.etut-table th, .etut-table td { padding: 12px 8px; text-align: center; border: 1px solid #e2e8f0; vertical-align: middle; border-top: none; }
.etut-table th:nth-child(2), .etut-table td:nth-child(2) { text-align: left; }
.etut-table th { background-color: #f8fafc; color: #334155; font-size: 0.95rem; border-top: 1px solid #e2e8f0; }
.etut-table tr:hover { background-color: #f8fafc; }

.ders-baslik { background-color: #f8fafc; color: #1e293b; }
.max-net-yazisi { font-size: 0.75rem; color: #64748b; font-weight: normal; margin-top: 2px; }

.icmal-baslik { background-color: #eff6ff !important; color: #1d4ed8 !important; }
.puan-baslik { background-color: #fffbeb !important; color: #b45309 !important; }

.net-hucre { background-color: #fff; }
.icmal-hucre { background-color: #eff6ff; font-size: 1.15rem; color: #1d4ed8; }
.puan-hucre { background-color: #fefce8; }

.not-input { width: 65px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-weight: bold; font-size: 1rem; color: #334155; background: #f8fafc; }
.not-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); background: white; }

.puan-kutu { background: #fef08a; color: #b45309; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 1.1rem; border: 1px solid #fde047; display: inline-block; min-width: 65px; }
.bos-puan { background: transparent; border: 1px dashed #cbd5e1; color: #94a3b8; }

.analiz-satiri { background-color: #e2e8f0 !important; font-size: 1.1rem; }
.analiz-satiri td { padding: 15px 10px; border-top: 2px solid #cbd5e1; }

.uyari-mesaj { text-align: center; padding: 20px; background: white; border-radius: 8px; color: #64748b; font-weight: bold; }
.toast { margin-left: auto; background: #dcfce7; color: #166534; padding: 8px 15px; border-radius: 6px; font-weight: bold; }
</style>