<script setup>
import { ref, onMounted, computed } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore' 
import { useRoute, useRouter } from 'vue-router'
import api from '../api/axios' // 🔥 GÜVENLİ API

const etutStore = useEtutStore()
const authStore = useAuthStore() 
const route = useRoute()
const router = useRouter()
const islemDurumu = ref('')

const seciliTalebeId = ref('')
const raporBasligi = ref('2025-2026 EĞİTİM YILI 1. DÖNEM GELİŞİM RAPORU')

const moduller = ref({
  yoklama: true,
  performans: true,
  kitap: true,
  yoy: true,
  yazili: true,
  deneme: true
})

const karneVerisi = ref({
  preExams: [],
  mockExams: [],
  testBooks: []
})

onMounted(async () => {
  if (etutStore.talebler.length === 0) {
    await etutStore.talebeleriGetir()
  }
  
  if (route.params.studentId) {
    seciliTalebeId.value = route.params.studentId
    await karneOlustur()
  }
})

const karneOlustur = async () => {
  if (!seciliTalebeId.value) return

  const kurumId = authStore.user?.institutionId 
  if (!kurumId) {
    alert("Kurum kimliği doğrulanamadı. Lütfen sayfayı yenileyin.");
    return;
  }

  islemDurumu.value = 'Veriler Toplanıyor...'
  try {
    // 🔥 DÜZELTME: Hatalı axios.get() yerine güvenli dinamik api isteği eklendi
    const res = await api.get(`/students/${seciliTalebeId.value}/karne`) 
    karneVerisi.value = res.data
    
    islemDurumu.value = 'Karne Hazır!'
    setTimeout(() => islemDurumu.value = '', 1500)
  } catch (error) {
    islemDurumu.value = 'Hata oluştu!'
  }
}

const seciliTalebeBilgisi = computed(() => {
  return etutStore.talebler.find(t => t.id === seciliTalebeId.value)
})

const geriDon = () => {
  router.push('/') 
}

const pdfIndir = () => {
  window.print()
}

// YARDIMCI HESAPLAMA FONKSİYONLARI
const getYoyNotu = (brans, term, index) => {
  const kayit = karneVerisi.value.preExams.find(x => x.subject === brans && x.term === term)
  if (!kayit) return '-'
  const practices = JSON.parse(kayit.practiceScores || '[]')
  return practices[index] !== null && practices[index] !== undefined ? practices[index] : '-'
}

const getOkulNotu = (brans, term) => {
  const kayit = karneVerisi.value.preExams.find(x => x.subject === brans && x.term === term)
  return kayit && kayit.actualScore !== null ? kayit.actualScore : '-'
}

const kitapDersleri = computed(() => {
  const dersler = {}
  karneVerisi.value.testBooks.forEach(tb => {
    if (!dersler[tb.topic.subject]) dersler[tb.topic.subject] = []
    dersler[tb.topic.subject].push(tb)
  })
  return dersler
})

const lgsNet = (dogru, yanlis) => {
  if (dogru === null || yanlis === null) return '-'
  return (dogru - (yanlis / 3)).toFixed(2)
}

const lgsBasari = (dogru, yanlis, toplam) => {
  if (toplam === 0 || dogru === null || yanlis === null) return '-'
  const net = dogru - (yanlis / 3)
  const yuzde = (net / toplam) * 100
  return yuzde < 0 ? '0%' : `${Math.round(yuzde)}%`
}

const getDeneme = (tip, no) => {
  return karneVerisi.value.mockExams.find(x => x.examType === tip && x.examNumber === no)
}
</script>

<template>
  <div class="sayfa-container">
    
    <div class="kontrol-paneli no-print">
      <div class="ust-baslik-alani">
        <button @click="geriDon" class="btn-geri">⬅️ Talebe Listesine Dön</button>
        <h2>Sayfa 11 - Gelişim Raporu (Karne)</h2>
      </div>
      
      <div class="ayar-kutulari">
        <div class="ayar-grup">
          <label>👤 Görüntülenen Talebe:</label>
          <select v-model="seciliTalebeId" @change="karneOlustur" class="input-kutu w-genis">
            <option value="" disabled>Seçiniz...</option>
            <option v-for="t in etutStore.talebler" :key="t.id" :value="t.id">{{ t.fullName }}</option>
          </select>
        </div>
        
        <div class="ayar-grup">
          <label>🏷️ Rapor Başlığı (Çıktı İçin):</label>
          <input type="text" v-model="raporBasligi" class="input-kutu w-genis" />
        </div>
      </div>

      <div class="modul-secimleri">
        <strong>👁️ Görünecek Modüller:</strong>
        <label class="check-etiket"><input type="checkbox" v-model="moduller.yoklama"> Yoklama / Performans</label>
        <label class="check-etiket"><input type="checkbox" v-model="moduller.kitap"> Kitap Çözümleri</label>
        <label class="check-etiket"><input type="checkbox" v-model="moduller.yoy"> Y.Ö.Y Neticeleri</label>
        <label class="check-etiket"><input type="checkbox" v-model="moduller.yazili"> Okul Yazılıları</label>
        <label class="check-etiket"><input type="checkbox" v-model="moduller.deneme"> Deneme / KDU</label>
      </div>

      <div class="buton-alani">
        <span v-if="islemDurumu" class="toast">{{ islemDurumu }}</span>
        <button @click="pdfIndir" class="btn-pdf" :disabled="!seciliTalebeId">🖨️ PDF Olarak İndir / Yazdır</button>
      </div>
    </div>

    <div class="karne-kagidi" v-if="seciliTalebeId">
      
      <div class="karne-baslik">
        <h1>{{ raporBasligi }}</h1>
        <div class="talebe-bilgi">
          <span><strong>TALEBE:</strong> {{ seciliTalebeBilgisi?.fullName }}</span>
          <span><strong>TARİH:</strong> {{ new Date().toLocaleDateString('tr-TR') }}</span>
        </div>
      </div>

      <div class="modul-kapsayici" v-if="moduller.yoklama || moduller.performans">
        <div class="modul-baslik mavi">GÜNLÜK ETÜT YOKLAMASI VE PERFORMANS (Özet)</div>
        <table class="karne-tablo">
          <thead>
            <tr class="acik-mavi">
              <th>DÖNEM ÖZETİ</th>
              <th>KATILIM (+)</th>
              <th>DEVAMSIZ (-)</th>
              <th>HASTA (H)</th>
              <th>İZİNLİ (İ)</th>
              <th>DERSHANE İCMAL ORT.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>GENEL DURUM</strong></td>
              <td class="yesil-yazi"><strong>65</strong></td>
              <td class="kirmizi-yazi"><strong>2</strong></td>
              <td>0</td>
              <td>5</td>
              <td class="icmal-puan"><strong>92.5</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

     <div class="modul-kapsayici" v-if="moduller.kitap && Object.keys(kitapDersleri).length > 0">
  <div class="modul-baslik mavi">WORKWIN YAYINLARI KİTAP ÇÖZÜMLERİ</div>
  <div v-for="(konular, ders) in kitapDersleri" :key="ders" class="kitap-ders-kapsayici">
    <div class="alt-baslik sari">{{ ders }}</div>
    <div class="kitap-grid">
      <div v-for="tb in konular" :key="tb.id" class="kitap-kutu">
        <div class="kutu-baslik">{{ tb.topic.title }}</div>
        <table class="mini-tablo">
          <thead>
            <tr class="gri-baslik">
              <th title="Soru Adedi">S.A</th>
              <th title="Doğru">D</th>
              <th title="Yanlış">Y</th>
              <th title="Net">N</th>
              <th title="Başarı">BAŞARI %</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>{{ tb.topic.normalQuestionCount + tb.topic.yeniNesilCount }}</strong></td>
              <td>{{ (tb.normalDogru || 0) + (tb.yeniNesilDogru || 0) }}</td>
              <td>{{ (tb.normalYanlis || 0) + (tb.yeniNesilYanlis || 0) }}</td>
              <td><strong>{{ lgsNet((tb.normalDogru || 0) + (tb.yeniNesilDogru || 0), (tb.normalYanlis || 0) + (tb.yeniNesilYanlis || 0)) }}</strong></td>
              <td class="basari-yazi">{{ lgsBasari((tb.normalDogru || 0) + (tb.yeniNesilDogru || 0), (tb.normalYanlis || 0) + (tb.yeniNesilYanlis || 0), tb.topic.normalQuestionCount + tb.topic.yeniNesilCount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

      <div class="modul-kapsayici" v-if="moduller.yoy">
        <div class="modul-baslik mavi">YAZILI ÖNCESİ YAZILI (Y.Ö.Y) NETİCELERİ</div>
        <table class="karne-tablo yoy-tablo">
          <thead>
            <tr class="acik-mavi">
              <th>BRANŞ</th><th>1. DÖNEM 1. YÖY</th><th>1. DÖNEM 2. YÖY</th><th>2. DÖNEM 1. YÖY</th><th>2. DÖNEM 2. YÖY</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="brans in ['TÜRKÇE', 'MATEMATİK', 'FEN', 'SOSYAL', 'İNGİLİZCE']" :key="brans">
              <td class="brans-isim"><strong>{{ brans }}</strong></td>
              <td>{{ getYoyNotu(brans, '1D1Y', 0) }}</td><td>{{ getYoyNotu(brans, '1D2Y', 0) }}</td>
              <td>{{ getYoyNotu(brans, '2D1Y', 0) }}</td><td>{{ getYoyNotu(brans, '2D2Y', 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modul-kapsayici" v-if="moduller.yazili">
        <div class="modul-baslik mavi">OKUL YAZILI NETİCELERİ</div>
        <table class="karne-tablo yazili-tablo">
          <thead>
            <tr class="acik-mavi">
              <th rowspan="2">BRANŞ</th><th colspan="2">1. DÖNEM</th><th colspan="2">2. DÖNEM</th>
            </tr>
            <tr class="gri-baslik">
              <th>1. YAZILI</th><th>2. YAZILI</th><th>1. YAZILI</th><th>2. YAZILI</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="brans in ['TÜRKÇE', 'MATEMATİK', 'FEN', 'SOSYAL', 'İNGİLİZCE']" :key="brans">
              <td class="brans-isim"><strong>{{ brans }}</strong></td>
              <td class="vurgulu">{{ getOkulNotu(brans, '1D1Y') }}</td><td class="vurgulu">{{ getOkulNotu(brans, '1D2Y') }}</td>
              <td class="vurgulu">{{ getOkulNotu(brans, '2D1Y') }}</td><td class="vurgulu">{{ getOkulNotu(brans, '2D2Y') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modul-kapsayici" v-if="moduller.deneme">
  <div class="modul-baslik mavi">DENEME VE KDU NETİCELERİ</div>
  <div class="sinav-grid">
    <div v-for="sinav in [{t:'DENEME', n:1}, {t:'DENEME', n:2}, {t:'KDU', n:1}, {t:'KDU', n:2}]" :key="sinav.t+sinav.n" class="sinav-kutu">
      <div class="alt-baslik" :class="sinav.t === 'DENEME' ? 'yesil' : 'mor'">{{ sinav.t }} - {{ sinav.n }}</div>
      <table class="mini-tablo">
        <thead>
          <tr class="gri-baslik">
            <th>TÜR</th>
            <th>MAT</th>
            <th>FEN</th>
            <th>SOS</th>
            <th>İNG</th>
            <th>DİN</th>
            <th>PUAN</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="getDeneme(sinav.t, sinav.n)">
            <tr>
              <td>{{ getDeneme(sinav.t, sinav.n).turkce || '-' }}</td>
              <td>{{ getDeneme(sinav.t, sinav.n).matematik || '-' }}</td>
              <td>{{ getDeneme(sinav.t, sinav.n).fen || '-' }}</td>
              <td>{{ getDeneme(sinav.t, sinav.n).sosyal || '-' }}</td>
              <td>{{ getDeneme(sinav.t, sinav.n).ingilizce || '-' }}</td>
              <td>{{ getDeneme(sinav.t, sinav.n).din || '-' }}</td>
              <td class="puan-yazi"><strong>{{ getDeneme(sinav.t, sinav.n).score || '-' }}</strong></td>
            </tr>
          </template>
          <template v-else>
            <tr>
              <td colspan="7" class="bos-yazi">Girmedi</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</div>

    </div>
  </div>
</template>

<style scoped>
/* GENEL AYARLAR */
.sayfa-container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f1f5f9; min-height: 100vh; padding: 20px; }

/* KONTROL PANELİ */
.kontrol-paneli { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; border-top: 5px solid #3b82f6; }
.ust-baslik-alani { display: flex; align-items: center; gap: 20px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
.ust-baslik-alani h2 { margin: 0; color: #1e293b; font-size: 1.5rem; }
.btn-geri { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
.btn-geri:hover { background: #e2e8f0; color: #0f172a; }

.ayar-kutulari { display: flex; gap: 20px; margin-bottom: 15px; flex-wrap: wrap; }
.ayar-grup { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 250px; }
.ayar-grup label { font-weight: bold; color: #475569; font-size: 0.9rem; }
.input-kutu { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; }
.modul-secimleri { display: flex; gap: 15px; background: #f8fafc; padding: 15px; border-radius: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 20px; border: 1px dashed #cbd5e1; }
.check-etiket { cursor: pointer; color: #334155; font-weight: 500; display: flex; align-items: center; gap: 5px; }
.buton-alani { display: flex; justify-content: flex-end; align-items: center; gap: 15px; }
.btn-pdf { background: #ef4444; color: white; border: none; padding: 12px 25px; border-radius: 8px; font-weight: bold; font-size: 1.1rem; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2); }
.btn-pdf:hover:not(:disabled) { background: #dc2626; transform: translateY(-2px); }
.btn-pdf:disabled { opacity: 0.5; cursor: not-allowed; }

/* KARNE KAĞIDI TASARIMI */
.karne-kagidi { background: white; width: 100%; max-width: 1100px; margin: 0 auto; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border-radius: 4px; }
.karne-baslik { text-align: center; border-bottom: 4px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 30px; }
.karne-baslik h1 { color: #1e3a8a; font-size: 1.8rem; margin: 0 0 10px 0; letter-spacing: 1px; }
.talebe-bilgi { display: flex; justify-content: space-between; font-size: 1.2rem; color: #334155; background: #f8fafc; padding: 10px 20px; border-radius: 6px; border: 1px solid #e2e8f0; }

.modul-kapsayici { margin-bottom: 30px; page-break-inside: avoid; }
.modul-baslik { font-size: 1.2rem; font-weight: bold; color: white; padding: 10px 15px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
.modul-baslik.mavi { background-color: #2563eb; }

/* TABLOLAR */
.karne-tablo { width: 100%; border-collapse: collapse; margin-top: 5px; text-align: center; }
.karne-tablo th, .karne-tablo td { border: 1px solid #94a3b8; padding: 10px; }
.acik-mavi { background-color: #dbeafe; color: #1e3a8a; font-weight: bold; }
.gri-baslik { background-color: #f1f5f9; color: #475569; font-size: 0.85rem; font-weight: bold; }
.brans-isim { background-color: #f8fafc; text-align: left; color: #334155; }
.vurgulu { font-weight: bold; font-size: 1.1rem; color: #0f172a; background-color: #fefce8; }
.icmal-puan { background-color: #dcfce7; color: #166534; font-size: 1.2rem; }
.yesil-yazi { color: #166534; }
.kirmizi-yazi { color: #b91c1c; }

/* KİTAP ÇÖZÜMLERİ GRİD */
.kitap-ders-kapsayici { margin-top: 15px; border: 2px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.alt-baslik { text-align: center; font-weight: bold; padding: 8px; font-size: 1.1rem; }
.alt-baslik.sari { background-color: #fef08a; color: #854d0e; border-bottom: 2px solid #fde047; }
.alt-baslik.yesil { background-color: #d1fae5; color: #065f46; border-bottom: 2px solid #a7f3d0; }
.alt-baslik.mor { background-color: #e0e7ff; color: #3730a3; border-bottom: 2px solid #c7d2fe; }

.kitap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; padding: 10px; background: #f8fafc; }
.kitap-kutu { background: white; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
.kutu-baslik { font-size: 0.85rem; font-weight: bold; text-align: center; padding: 6px; background: #e2e8f0; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.mini-tablo { width: 100%; border-collapse: collapse; text-align: center; font-size: 0.9rem; }
.mini-tablo td { border: 1px solid #e2e8f0; padding: 5px; }
.basari-yazi { background-color: #ecfdf5; color: #059669; font-weight: bold; }

/* SINAV GRİD */
.sinav-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 10px; }
.sinav-kutu { border: 2px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
.puan-yazi { background-color: #fffbeb; color: #b45309; font-size: 1.1rem; }
.bos-yazi { color: #94a3b8; font-style: italic; padding: 15px !important; }

/* YAZDIRMA (PRINT) AYARLARI */
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sayfa-container { padding: 0; background: white; }
  .no-print { display: none !important; }
  .karne-kagidi { box-shadow: none; padding: 0; width: 100%; max-width: 100%; margin: 0; border-radius: 0; }
  .modul-kapsayici { break-inside: avoid; margin-bottom: 20px; }
  .sinav-grid { grid-template-columns: 1fr; }
}
</style>