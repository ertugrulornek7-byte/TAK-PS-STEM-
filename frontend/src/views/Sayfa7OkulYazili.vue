<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore' // GÜVENLİK KAPISI EKLENDİ
import axios from 'axios'

const etutStore = useEtutStore()
const authStore = useAuthStore() // GÜVENLİK KAPISI BAŞLATILDI
const islemDurumu = ref('')

const donemler = [
  { id: '1D', ad: '1. Dönem Okul Yazılıları' },
  { id: '2D', ad: '2. Dönem Okul Yazılıları' }
]
const seciliDonem = ref('1D')

const branslar = ['MATEMATİK', 'FEN', 'SOSYAL', 'İNGİLİZCE', 'TÜRKÇE']
const seciliBrans = ref('MATEMATİK')

// Format: { "studentId": { "1Y": { target: 80, actual: 85 }, "2Y": { target: 90, actual: null } } }
const tumNotlar = ref({})

onMounted(async () => {
  if (etutStore.gosterilenTalebeler.length === 0) {
    await etutStore.talebeleriGetir()
  }
  await verileriCek()
})

watch([seciliDonem, seciliBrans], async () => {
  await verileriCek()
})

const verileriCek = async () => {
  const kurumId = authStore.user?.institutionId // HAYALET VERİ ÇÖZÜMÜ
  if (!kurumId) return

  try {
    const res = await axios.get(`http://localhost:3000/api/school-exams/${kurumId}/${seciliDonem.value}`)
    
    tumNotlar.value = {}
    etutStore.gosterilenTalebeler.forEach(t => {
      tumNotlar.value[t.id] = {
        "1Y": { target: null, actual: null },
        "2Y": { target: null, actual: null }
      }
    })

    // Gelen verileri 1.Yazılı ve 2.Yazılı olarak ayrıştırıyoruz
    res.data.forEach(kayit => {
      if (kayit.subject === seciliBrans.value) {
        const yaziliTipi = kayit.term.endsWith('1Y') ? "1Y" : "2Y";
        if (tumNotlar.value[kayit.studentId]) {
          tumNotlar.value[kayit.studentId][yaziliTipi].target = kayit.targetScore;
          tumNotlar.value[kayit.studentId][yaziliTipi].actual = kayit.actualScore;
        }
      }
    })
  } catch (error) {
    console.error('Veriler çekilemedi', error)
  }
}

const notKaydet = async (studentId, yaziliTipi) => {
  const veri = tumNotlar.value[studentId][yaziliTipi]
  const termCode = seciliDonem.value + yaziliTipi // Örn: "1D" + "1Y" = "1D1Y"
  
  const cleanTarget = (veri.target === "" || veri.target === null) ? null : parseInt(veri.target)
  const cleanActual = (veri.actual === "" || veri.actual === null) ? null : parseInt(veri.actual)

  islemDurumu.value = 'Kaydediliyor...'
  try {
    await axios.post('http://localhost:3000/api/school-exams/result', {
      studentId: studentId,
      term: termCode,
      subject: seciliBrans.value,
      targetScore: cleanTarget,
      actualScore: cleanActual
    })
    islemDurumu.value = 'Kaydedildi!'
    setTimeout(() => islemDurumu.value = '', 1000)
  } catch (error) {
    islemDurumu.value = 'Hata!'
  }
}

const ogrenciOrtalama = (studentId) => {
  const n1 = tumNotlar.value[studentId]["1Y"].actual
  const n2 = tumNotlar.value[studentId]["2Y"].actual
  
  let toplam = 0, sayi = 0
  if (n1 !== null && n1 !== "") { toplam += parseInt(n1); sayi++ }
  if (n2 !== null && n2 !== "") { toplam += parseInt(n2); sayi++ }
  
  return sayi > 0 ? Math.round(toplam / sayi) : null
}

// SINIF ANALİZİ HESAPLAMALARI
const sinifOrtalamasiHesapla = (tip, alan) => {
  let toplam = 0, sayi = 0
  etutStore.gosterilenTalebeler.forEach(t => {
    const veri = tumNotlar.value[t.id][tip][alan]
    if (veri !== null && veri !== "") {
      toplam += parseInt(veri); sayi++
    }
  })
  return sayi > 0 ? Math.round(toplam / sayi) : '-'
}

const sinifGenelOrtalama = computed(() => {
  let toplam = 0, sayi = 0
  etutStore.gosterilenTalebeler.forEach(t => {
    const ort = ogrenciOrtalama(t.id)
    if (ort !== null) { toplam += ort; sayi++ }
  })
  return sayi > 0 ? Math.round(toplam / sayi) : '-'
})
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 7 - Okul Yazılı Neticeleri</h2>

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
            class="btn-brans" :class="{'aktif': seciliBrans === brans}">
            {{ brans }}
          </button>
        </div>
      </div>
      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <table class="etut-table" v-if="Object.keys(tumNotlar).length > 0">
      <thead>
        <tr>
          <th style="width: 50px;" rowspan="2">Sıra</th>
          <th style="width: 200px;" rowspan="2">Ad Soyad</th>
          <th colspan="2" class="yazili1-baslik">1. YAZILI</th>
          <th colspan="2" class="yazili2-baslik">2. YAZILI</th>
          <th rowspan="2" class="sonuc-baslik">📊 1 ve 2. Yazılı Ort.</th>
        </tr>
        <tr>
          <th class="hedef-alt">🎯 Hedef</th>
          <th class="netice-alt">📝 Netice</th>
          <th class="hedef-alt">🎯 Hedef</th>
          <th class="netice-alt">📝 Netice</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(talebe, index) in etutStore.gosterilenTalebeler" :key="talebe.id">
          <td>{{ talebe.orderIndex }}</td>
          <td><strong>{{ talebe.fullName }}</strong></td>
          
          <td class="hedef-hucre">
            <input type="number" v-model="tumNotlar[talebe.id]['1Y'].target" @blur="notKaydet(talebe.id, '1Y')" class="not-input hedef-input" placeholder="Hedef" />
          </td>
          <td class="netice-hucre">
            <input type="number" v-model="tumNotlar[talebe.id]['1Y'].actual" @blur="notKaydet(talebe.id, '1Y')" class="not-input netice-input" placeholder="Not" />
          </td>

          <td class="hedef-hucre">
            <input type="number" v-model="tumNotlar[talebe.id]['2Y'].target" @blur="notKaydet(talebe.id, '2Y')" class="not-input hedef-input" placeholder="Hedef" />
          </td>
          <td class="netice-hucre">
            <input type="number" v-model="tumNotlar[talebe.id]['2Y'].actual" @blur="notKaydet(talebe.id, '2Y')" class="not-input netice-input" placeholder="Not" />
          </td>

          <td class="hesap-hucre">
            <strong>{{ ogrenciOrtalama(talebe.id) !== null ? ogrenciOrtalama(talebe.id) : '-' }}</strong>
          </td>
        </tr>
      </tbody>
      
      <tfoot>
        <tr class="analiz-satiri">
          <td colspan="2" style="text-align: right;"><strong>📈 Sınıf Ortalamaları:</strong></td>
          <td class="hedef-hucre" style="text-align: center;"><strong>{{ sinifOrtalamasiHesapla('1Y', 'target') }}</strong></td>
          <td class="netice-hucre" style="text-align: center;"><strong>{{ sinifOrtalamasiHesapla('1Y', 'actual') }}</strong></td>
          <td class="hedef-hucre" style="text-align: center;"><strong>{{ sinifOrtalamasiHesapla('2Y', 'target') }}</strong></td>
          <td class="netice-hucre" style="text-align: center;"><strong>{{ sinifOrtalamasiHesapla('2Y', 'actual') }}</strong></td>
          <td class="hesap-hucre" style="text-align: center; color:#1d4ed8;"><strong>{{ sinifGenelOrtalama }}</strong></td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }

.filtre-paneli { display: flex; align-items: center; gap: 20px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.filtre-grup { display: flex; align-items: center; gap: 10px; }
.filtre-grup label { font-weight: bold; color: #334155; }
.input-kutu { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; cursor: pointer; }
.select-kalin { font-weight: bold; color: #1e293b; background-color: #f8fafc; }
.ayirici { width: 2px; height: 30px; background-color: #e2e8f0; margin: 0 5px; }

.brans-butonlari { display: flex; gap: 8px; }
.btn-brans { padding: 8px 15px; border: 1px solid #cbd5e1; background: white; border-radius: 6px; font-weight: bold; color: #64748b; cursor: pointer; transition: 0.2s; }
.btn-brans:hover { background: #f1f5f9; }
.btn-brans.aktif { background: #3b82f6; color: white; border-color: #2563eb; }

.etut-table { width: 100%; border-collapse: collapse; box-shadow: 0 1px 3px rgba(0,0,0,0.1); background: white; border-radius: 8px; overflow: hidden; }
.etut-table th, .etut-table td { padding: 10px; text-align: center; border: 1px solid #e2e8f0; vertical-align: middle; }
.etut-table th:nth-child(2), .etut-table td:nth-child(2) { text-align: left; }
.etut-table th { font-size: 0.95rem; }
.etut-table tr:hover { background-color: #f8fafc; }

.yazili1-baslik { background-color: #f8fafc; color: #334155; border-bottom: 2px solid #cbd5e1; }
.yazili2-baslik { background-color: #f1f5f9; color: #1e293b; border-bottom: 2px solid #94a3b8; }
.hedef-alt { background-color: #fffbeb !important; color: #b45309 !important; }
.netice-alt { background-color: #f0fdf4 !important; color: #166534 !important; }

.hedef-hucre { background-color: #fefce8; }
.netice-hucre { background-color: #f8fafc; }
.sonuc-baslik { background-color: #eff6ff !important; color: #1d4ed8 !important; }

.not-input { width: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-weight: bold; font-size: 1rem; color: #334155; }
.not-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
.hedef-input { border-color: #fcd34d; background: #fffbeb; }
.netice-input { border-color: #86efac; background: #f0fdf4; }

.hesap-hucre { font-size: 1.1rem; }
.analiz-satiri { background-color: #e2e8f0 !important; font-size: 1.1rem; }
.analiz-satiri td { padding: 15px 10px; border-top: 2px solid #cbd5e1; }

.toast { margin-left: auto; background: #dcfce7; color: #166534; padding: 8px 15px; border-radius: 6px; font-weight: bold; }
</style>