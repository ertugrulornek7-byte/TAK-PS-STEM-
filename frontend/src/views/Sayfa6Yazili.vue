<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios' // GÜVENLİ API EKLENDİ

const etutStore = useEtutStore()
const authStore = useAuthStore()
const islemDurumu = ref('')

const donemler = [
  { id: '1D1Y', ad: '1. Dönem 1. Yazılı' },
  { id: '1D2Y', ad: '1. Dönem 2. Yazılı' },
  { id: '2D1Y', ad: '2. Dönem 1. Yazılı' },
  { id: '2D2Y', ad: '2. Dönem 2. Yazılı' }
]
const seciliDonem = ref('1D1Y')

const branslar = ['MATEMATİK', 'FEN', 'SOSYAL', 'İNGİLİZCE', 'TÜRKÇE']
const seciliBrans = ref('MATEMATİK')

const tumNotlar = ref({}) 
const sutunSayisi = ref(1) 
const oncekiNotlar = ref({})

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

watch([seciliDonem, seciliBrans], async ([yeniDonem, yeniBrans], [eskiDonem, eskiBrans]) => {
  if (yeniDonem !== eskiDonem) {
    await verileriCek()
  } else {
    bransAyarlariniUygula()
  }
})

let hamAyarlar = []
const verileriCek = async () => {
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) return

  try {
    const res = await api.get(`/pre-exams/${kurumId}/${seciliDonem.value}`)
    
    tumNotlar.value = {}
    etutStore.gosterilenTalebeler.forEach(t => {
      branslar.forEach(b => {
        tumNotlar.value[`${t.id}-${b}`] = { target: null, practices: [] }
      })
    })

    res.data.results.forEach(kayit => {
      tumNotlar.value[`${kayit.studentId}-${kayit.subject}`] = {
        target: kayit.targetScore,
        practices: JSON.parse(kayit.practiceScores || '[]')
      }
    })

    hamAyarlar = res.data.settings
    bransAyarlariniUygula()

    oncekiNotlar.value = {}
    if (seciliDonem.value === '1D2Y') {
      const resOnceki = await api.get(`/pre-exams/${kurumId}/1D1Y`)
      resOnceki.data.results.forEach(k => { 
        if(k.subject === seciliBrans.value) oncekiNotlar.value[k.studentId] = k.actualScore 
      })
    } 
    else if (seciliDonem.value === '2D1Y') {
      const res1 = await api.get(`/pre-exams/${kurumId}/1D1Y`)
      const res2 = await api.get(`/pre-exams/${kurumId}/1D2Y`)
      
      etutStore.gosterilenTalebeler.forEach(t => {
        const n1 = res1.data.results.find(x => x.studentId === t.id && x.subject === seciliBrans.value)?.actualScore
        const n2 = res2.data.results.find(x => x.studentId === t.id && x.subject === seciliBrans.value)?.actualScore
        let top = 0, say = 0
        if(n1 !== undefined && n1 !== null) { top += n1; say++ }
        if(n2 !== undefined && n2 !== null) { top += n2; say++ }
        oncekiNotlar.value[t.id] = say > 0 ? Math.round(top/say) : null
      })
    } 
    else if (seciliDonem.value === '2D2Y') {
      const resOnceki = await api.get(`/pre-exams/${kurumId}/2D1Y`)
      resOnceki.data.results.forEach(k => { 
        if(k.subject === seciliBrans.value) oncekiNotlar.value[k.studentId] = k.actualScore 
      })
    }

  } catch (error) {
    console.error('Veriler çekilemedi', error)
  }
}

const bransAyarlariniUygula = () => {
  const ayar = hamAyarlar.find(a => a.subject === seciliBrans.value)
  sutunSayisi.value = ayar ? ayar.practiceCount : 1
}

const sutunEkle = async () => {
  sutunSayisi.value++
  await sutunAyariniKaydet()
}

const sutunCikar = async () => {
  if (sutunSayisi.value > 1) {
    sutunSayisi.value--
    etutStore.gosterilenTalebeler.forEach(t => {
      const ogr = tumNotlar.value[`${t.id}-${seciliBrans.value}`]
      if (ogr.practices.length > sutunSayisi.value) {
        ogr.practices = ogr.practices.slice(0, sutunSayisi.value)
        notKaydet(t.id) 
      }
    })
    await sutunAyariniKaydet()
  }
}

const sutunAyariniKaydet = async () => {
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) {
    alert("Kurum kimliği bulunamadı, sayfayı yenileyin.")
    return
  }

  try {
    await api.post('/pre-exams/settings', {
      institutionId: kurumId, 
      term: seciliDonem.value,
      subject: seciliBrans.value,
      practiceCount: sutunSayisi.value
    })
    
    const ayarIdx = hamAyarlar.findIndex(a => a.subject === seciliBrans.value)
    if (ayarIdx !== -1) {
      hamAyarlar[ayarIdx].practiceCount = sutunSayisi.value
    } else {
      hamAyarlar.push({ subject: seciliBrans.value, practiceCount: sutunSayisi.value })
    }
  } catch (error) { console.error('Sütun ayarı kaydedilemedi') }
}

const notKaydet = async (studentId) => {
  const veri = tumNotlar.value[`${studentId}-${seciliBrans.value}`]
  
  const cleanTarget = (veri.target === "" || veri.target === null) ? null : parseInt(veri.target)
  const cleanPractices = []
  for (let i = 0; i < sutunSayisi.value; i++) {
    cleanPractices[i] = (veri.practices[i] === "" || veri.practices[i] === null || veri.practices[i] === undefined) 
                        ? null 
                        : parseInt(veri.practices[i])
  }

  islemDurumu.value = 'Kaydediliyor...'
  try {
    await api.post('/pre-exams/result', {
      studentId: studentId,
      term: seciliDonem.value,
      subject: seciliBrans.value,
      targetScore: cleanTarget,
      practiceScores: cleanPractices
    })
    islemDurumu.value = 'Kaydedildi!'
    setTimeout(() => islemDurumu.value = '', 1000)
  } catch (error) {
    islemDurumu.value = 'Hata!'
  }
}

const oncekiYaziliBilgisi = (studentId) => {
  if (seciliDonem.value === '1D1Y') return null;
  
  const val = oncekiNotlar.value[studentId];
  const puan = (val !== undefined && val !== null) ? val : '-';

  if (seciliDonem.value === '1D2Y') return `1. Yazılı: ${puan}`;
  if (seciliDonem.value === '2D1Y') return `1. Dönem Ort: ${puan}`;
  if (seciliDonem.value === '2D2Y') return `1. Yazılı: ${puan}`;
  return null;
}

const ogrenciOrtalama = (studentId) => {
  const veri = tumNotlar.value[`${studentId}-${seciliBrans.value}`]
  if (!veri) return null
  
  let toplam = 0, sayi = 0
  for (let i = 0; i < sutunSayisi.value; i++) {
    if (veri.practices[i] !== null && veri.practices[i] !== undefined && veri.practices[i] !== "") {
      toplam += parseInt(veri.practices[i])
      sayi++
    }
  }
  return sayi > 0 ? Math.round(toplam / sayi) : null
}

const ogrenciFark = (studentId) => {
  const ort = ogrenciOrtalama(studentId)
  const veri = tumNotlar.value[`${studentId}-${seciliBrans.value}`]
  if (ort === null || !veri || veri.target === null || veri.target === "") return null
  return ort - parseInt(veri.target) 
}

// 🔥 HER SINIFIN ORTALAMASINI AYRI HESAPLAYAN YENİ FONKSİYONLAR 🔥
const sinifHedefOrtalamasi = (ogrenciler) => {
  let toplam = 0, sayi = 0
  ogrenciler.forEach(t => {
    const veri = tumNotlar.value[`${t.id}-${seciliBrans.value}`]
    if (veri && veri.target !== null && veri.target !== "") {
      toplam += parseInt(veri.target); sayi++
    }
  })
  return sayi > 0 ? Math.round(toplam / sayi) : '-'
}

const sinifYoyOrtalamasi = (ogrenciler, index) => {
  let toplam = 0, sayi = 0
  ogrenciler.forEach(t => {
    const veri = tumNotlar.value[`${t.id}-${seciliBrans.value}`]
    if (veri && veri.practices[index] !== null && veri.practices[index] !== undefined && veri.practices[index] !== "") {
      toplam += parseInt(veri.practices[index]); sayi++
    }
  })
  return sayi > 0 ? Math.round(toplam / sayi) : '-'
}

const sinifGenelOrtalama = (ogrenciler) => {
  let toplam = 0, sayi = 0
  ogrenciler.forEach(t => {
    const ort = ogrenciOrtalama(t.id)
    if (ort !== null) { toplam += ort; sayi++ }
  })
  return sayi > 0 ? Math.round(toplam / sayi) : '-'
}

const sinifFarkOrtalamasi = (ogrenciler) => {
  let toplam = 0, sayi = 0
  ogrenciler.forEach(t => {
    const fark = ogrenciFark(t.id)
    if (fark !== null) { toplam += fark; sayi++ }
  })
  return sayi > 0 ? Math.round(toplam / sayi) : '-'
}
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 6 - Yazılı Öncesi Yazılı (Y.Ö.Y) Neticeleri</h2>

    <div class="filtre-paneli">
      <div class="filtre-grup">
        <label>📚 Dönem Seçin:</label>
        <select v-model="seciliDonem" class="input-kutu select-kalin">
          <option v-for="donem in donemler" :key="donem.id" :value="donem.id">{{ donem.ad }}</option>
        </select>
      </div>
      <div class="ayirici"></div>
      <div class="filtre-grup">
        <label>🏷️ Branş Seçin:</label>
        <div class="brans-butonlari">
          <button 
            v-for="brans in branslar" :key="brans" 
            @click="seciliBrans = brans"
            class="btn-brans"
            :class="{'aktif': seciliBrans === brans}"
          >
            {{ brans }}
          </button>
        </div>
      </div>
      
      <div class="ayirici"></div>
      <!-- YENİ EKLENEN SINIF FİLTRESİ -->
      <div class="filtre-grup">
        <select v-model="aktifSinifFiltresi" class="input-kutu" style="background-color: #f0fdf4; border-color: #86efac; font-weight: bold;">
          <option value="">Tüm Sınıfları Göster</option>
          <option v-for="sinif in benzersizSinifIsimleri" :key="sinif.id" :value="sinif.id">
            Sadece {{ sinif.name }}
          </option>
        </select>
      </div>

      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <!-- SINIFLARA GÖRE GRUPLANMIŞ Y.Ö.Y TABLOLARI -->
    <div v-if="Object.keys(tumNotlar).length > 0">
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
              <th class="hedef-baslik">🎯 Hedef (Okul)</th>
              
              <th v-for="i in sutunSayisi" :key="i" class="yoy-baslik">
                Y.Ö.Y {{ i }}
                <div class="sutun-kontrolleri" v-if="i === sutunSayisi">
                  <button @click="sutunCikar" class="btn-ufak btn-kirmizi" title="Sütun Çıkar" :disabled="sutunSayisi === 1">-</button>
                  <button @click="sutunEkle" class="btn-ufak btn-yesil" title="Sütun Ekle">+</button>
                </div>
              </th>

              <th class="sonuc-baslik">📊 Ort.</th>
              <th class="sonuc-baslik">⚖️ Fark</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(talebe) in ogrenciler" :key="talebe.id">
              <td>{{ talebe.orderIndex }}</td>
              <td><strong>{{ talebe.fullName }}</strong></td>
              
              <td class="hedef-hucre">
                <div class="hedef-kutu-wrapper">
                  <input type="number" 
                         v-model="tumNotlar[`${talebe.id}-${seciliBrans}`].target" 
                         @blur="notKaydet(talebe.id)"
                         class="not-input hedef-input" placeholder="Hedef" />
                         
                  <span class="dipnot-yazi" v-if="oncekiYaziliBilgisi(talebe.id)">
                    {{ oncekiYaziliBilgisi(talebe.id) }}
                  </span>
                </div>
              </td>

              <td v-for="i in sutunSayisi" :key="i" class="yoy-hucre">
                <input type="number" 
                       v-model="tumNotlar[`${talebe.id}-${seciliBrans}`].practices[i-1]" 
                       @blur="notKaydet(talebe.id)"
                       class="not-input" placeholder="Not" />
              </td>

              <td class="hesap-hucre">
                <strong>{{ ogrenciOrtalama(talebe.id) !== null ? ogrenciOrtalama(talebe.id) : '-' }}</strong>
              </td>
              <td class="hesap-hucre" :class="{
                'fark-arti': ogrenciFark(talebe.id) > 0, 
                'fark-eksi': ogrenciFark(talebe.id) < 0,
                'fark-sifir': ogrenciFark(talebe.id) === 0
              }">
                <strong>
                  {{ ogrenciFark(talebe.id) !== null ? (ogrenciFark(talebe.id) > 0 ? '+' : '') + ogrenciFark(talebe.id) : '-' }}
                </strong>
              </td>
            </tr>
          </tbody>
          
          <tfoot>
            <tr class="analiz-satiri">
              <td colspan="2" style="text-align: right;"><strong>📈 {{ sinifAdi }} Analizi:</strong></td>
              <td class="hedef-hucre" style="text-align: center;"><strong>{{ sinifHedefOrtalamasi(ogrenciler) }}</strong></td>
              
              <td v-for="i in sutunSayisi" :key="i" class="yoy-hucre" style="text-align: center;">
                <strong>{{ sinifYoyOrtalamasi(ogrenciler, i-1) }}</strong>
              </td>
              
              <td class="hesap-hucre" style="text-align: center; color:#1d4ed8;"><strong>{{ sinifGenelOrtalama(ogrenciler) }}</strong></td>
              <td class="hesap-hucre" style="text-align: center;" :class="{
                'fark-arti': sinifFarkOrtalamasi(ogrenciler) > 0, 
                'fark-eksi': sinifFarkOrtalamasi(ogrenciler) < 0
              }">
                <strong>{{ sinifFarkOrtalamasi(ogrenciler) !== '-' ? (sinifFarkOrtalamasi(ogrenciler) > 0 ? '+' : '') + sinifFarkOrtalamasi(ogrenciler) : '-' }}</strong>
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

.filtre-paneli { display: flex; align-items: center; gap: 20px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex-wrap: wrap; }
.filtre-grup { display: flex; align-items: center; gap: 10px; }
.filtre-grup label { font-weight: bold; color: #334155; }
.input-kutu { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; cursor: pointer; }
.select-kalin { font-weight: bold; color: #1e293b; background-color: #f8fafc; }
.ayirici { width: 2px; height: 30px; background-color: #e2e8f0; margin: 0 5px; }

/* Sınıf Bloku ve Başlığı */
.sinif-bloku { margin-bottom: 35px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 8px; }
.sinif-basligi { background-color: #1e293b; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; font-size: 1.1rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
.sinif-mevcudu { background-color: #3b82f6; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; }

.brans-butonlari { display: flex; gap: 8px; }
.btn-brans { padding: 8px 15px; border: 1px solid #cbd5e1; background: white; border-radius: 6px; font-weight: bold; color: #64748b; cursor: pointer; transition: 0.2s; }
.btn-brans:hover { background: #f1f5f9; }
.btn-brans.aktif { background: #3b82f6; color: white; border-color: #2563eb; }

.etut-table { width: 100%; border-collapse: collapse; background: white; border-radius: 0 0 8px 8px; overflow: hidden; }
.etut-table th, .etut-table td { padding: 10px; text-align: center; border: 1px solid #e2e8f0; vertical-align: middle; border-top: none; }
.etut-table th:nth-child(2), .etut-table td:nth-child(2) { text-align: left; }
.etut-table th { background-color: #f8fafc; color: #334155; font-size: 0.95rem; border-top: 1px solid #e2e8f0; }
.etut-table tr:hover { background-color: #f8fafc; }

.hedef-baslik { background-color: #fffbeb !important; color: #b45309 !important; }
.hedef-hucre { background-color: #fefce8; }
.yoy-baslik { background-color: #f0fdf4 !important; color: #166534 !important; position: relative; }
.yoy-hucre { background-color: #f8fafc; }
.sonuc-baslik { background-color: #eff6ff !important; color: #1d4ed8 !important; }

.sutun-kontrolleri { display: flex; justify-content: center; gap: 5px; margin-top: 5px; }
.btn-ufak { width: 24px; height: 24px; border: none; border-radius: 4px; font-weight: bold; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.btn-yesil { background: #10b981; } .btn-yesil:hover { background: #059669; }
.btn-kirmizi { background: #ef4444; } .btn-kirmizi:hover { background: #dc2626; }
.btn-ufak:disabled { opacity: 0.5; cursor: not-allowed; }

.hedef-kutu-wrapper { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.dipnot-yazi { font-size: 0.75rem; color: #b45309; font-weight: bold; font-style: italic; background: #fffbeb; padding: 2px 8px; border-radius: 4px; border: 1px dashed #fcd34d; }

.not-input { width: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-weight: bold; font-size: 1rem; color: #334155; }
.not-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
.hedef-input { border-color: #fcd34d; background: #fffbeb; }

.hesap-hucre { font-size: 1.1rem; }
.fark-arti { color: #166534; background-color: #dcfce7 !important; }
.fark-eksi { color: #b91c1c; background-color: #fee2e2 !important; }
.fark-sifir { color: #475569; }

.analiz-satiri { background-color: #e2e8f0 !important; font-size: 1.1rem; }
.analiz-satiri td { padding: 15px 10px; border-top: 2px solid #cbd5e1; }

.toast { margin-left: auto; background: #dcfce7; color: #166534; padding: 8px 15px; border-radius: 6px; font-weight: bold; }
.uyari-mesaj { text-align: center; padding: 20px; background: white; border-radius: 8px; color: #64748b; font-weight: bold; margin-bottom: 20px; }
</style>