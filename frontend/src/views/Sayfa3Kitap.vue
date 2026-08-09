<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios'

const router = useRouter()
const etutStore = useEtutStore()
const authStore = useAuthStore() 
const kitaplar = ref([])
const yeniKitapAd = ref('')
const yeniKitapSayfa = ref('')
const islemDurumu = ref('')

const seciliKitaplar = ref({})
const girilenSayfalar = ref({})
const aktifOkumalar = ref({})
const bitirilenOkumalar = ref({})

// Zaman Filtresi Değişkenleri
const seciliAyDegeri = ref(new Date().toISOString().slice(0, 7))
const aylikPerformanslar = ref({})

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
  await kitaplariGetir()
  await okumaDurumlariniGetir()
  await bitirilenleriGetir()
  await aylikİstatistikleriGetir()
})

const kitaplariGetir = async () => {
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) return
  try {
    const res = await api.get(`/books/${kurumId}`)
    kitaplar.value = res.data
  } catch (error) {
    console.error('Kitaplar getirilemedi', error)
  }
}

const okumaDurumlariniGetir = async () => {
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) return
  try {
    const res = await api.get(`/book-tracking/${kurumId}`)
    aktifOkumalar.value = {}
    res.data.forEach(kayit => {
      aktifOkumalar.value[kayit.studentId] = kayit
      seciliKitaplar.value[kayit.studentId] = kayit.bookId
    })
  } catch (error) {
    console.error('Durumlar getirilemedi', error)
  }
}

const bitirilenleriGetir = async () => {
  if (!seciliAyDegeri.value) return
  const [yil, ay] = seciliAyDegeri.value.split('-')
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) return
  try {
    const res = await api.get(`/book-tracking/completed/${kurumId}/${yil}/${ay}`)
    bitirilenOkumalar.value = {}
    
    res.data.forEach(kayit => {
      if (!bitirilenOkumalar.value[kayit.studentId]) {
        bitirilenOkumalar.value[kayit.studentId] = []
      }
      const yuzde = Math.round((kayit.readPages / kayit.book.totalPages) * 100);
      if (yuzde === 100) {
        bitirilenOkumalar.value[kayit.studentId].push({ metin: `✔️ ${kayit.book.title}`, tam: true });
      } else {
        bitirilenOkumalar.value[kayit.studentId].push({ metin: `⚠️ ${kayit.book.title} (%${yuzde})`, tam: false });
      }
    })
  } catch (error) {
    console.error('Bitirilenler getirilemedi', error)
  }
}

const aylikİstatistikleriGetir = async () => {
  if (!seciliAyDegeri.value) return
  const [yil, ay] = seciliAyDegeri.value.split('-')
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) return
  try {
    const res = await api.get(`/book-stats/${kurumId}/${yil}/${ay}`)
    aylikPerformanslar.value = {};
    res.data.forEach(kayit => {
      if (!aylikPerformanslar.value[kayit.studentId]) {
        aylikPerformanslar.value[kayit.studentId] = 0;
      }
      aylikPerformanslar.value[kayit.studentId] += kayit.buAyOkunan;
    });
    
    await bitirilenleriGetir(); 
  } catch (error) {
    console.error('Aylık veriler çekilemedi', error)
  }
}

const kurumaKitapEkle = async () => {
  if (!yeniKitapAd.value || !yeniKitapSayfa.value) return
  const kurumId = authStore.user?.institutionId 
  if (!kurumId) {
    alert("Kurum kimliği bulunamadı, lütfen sayfayı yenileyin.");
    return;
  }
  islemDurumu.value = 'Ekleniyor...'
  try {
    await api.post('/books', {
      title: yeniKitapAd.value,
      totalPages: parseInt(yeniKitapSayfa.value),
      institutionId: kurumId
    })
    yeniKitapAd.value = ''
    yeniKitapSayfa.value = ''
    await kitaplariGetir()
    islemDurumu.value = 'Kitap kütüphaneye eklendi!'
    setTimeout(() => { islemDurumu.value = '' }, 2000)
  } catch (error) {
    if (error.response && error.response.data.error) {
      islemDurumu.value = error.response.data.error;
    } else {
      islemDurumu.value = 'Kitap eklenirken hata oluştu.';
    }
    setTimeout(() => { islemDurumu.value = '' }, 3000)
  }
}

const okumaKaydet = async (studentId) => {
  const bookId = seciliKitaplar.value[studentId]
  const readPages = girilenSayfalar.value[studentId]

  if (!bookId || !readPages) {
    alert('Lütfen bu talebe için bir kitap seçin ve okuduğu sayfa sayısını girin!')
    return
  }

  try {
    await api.post('/book-tracking', {
      studentId: studentId,
      bookId: bookId,
      readPages: readPages,
      targetMonth: seciliAyDegeri.value 
    })
    
    alert('Başarıyla kaydedildi!')
    girilenSayfalar.value[studentId] = '' 
    await okumaDurumlariniGetir() 
    await bitirilenleriGetir()
    await aylikİstatistikleriGetir()

    try {
      const suAn = new Date();
      const ay = suAn.getMonth() + 1; 
      const hafta = Math.ceil(suAn.getDate() / 7);

      await api.post('/tasks/calculate-progress', {
        institutionId: authStore.user?.institutionId,
        userId: authStore.user?.id,
        month: ay,
        week: hafta,
        moduleType: 'KITAP'
      });
    } catch (error) {
      console.error("Kitap görev yüzdesi güncellenemedi", error);
    }
  } catch (error) {
    if (error.response && error.response.data.error) {
      alert(error.response.data.error)
    } else {
      alert('Kaydedilirken bir hata oluştu.')
    }
  }
}

const kitabiYarimBirak = async (studentId) => {
  if (!confirm('Bu kitabı yarım bırakmak istediğinize emin misiniz?')) return;
  try {
    await api.post('/book-tracking/pause', { 
      studentId: studentId,
      targetMonth: seciliAyDegeri.value 
    });
    await okumaDurumlariniGetir();
    await bitirilenleriGetir();
  } catch (error) {
    alert('Hata oluştu!');
  }
}
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 3 - Kitap Okuma Takibi</h2>

    <!-- GELİŞMİŞ FİLTRE PANELİ -->
    <div class="zaman-filtresi">
      <div class="filtre-grup">
        <label for="aySecici">📅 Takip Edilen Ay:</label>
        <input type="month" id="aySecici" v-model="seciliAyDegeri" @change="aylikİstatistikleriGetir" class="ay-input" />
      </div>

      <div class="filtre-grup" style="margin-left: 20px; border-left: 2px solid #e2e8f0; padding-left: 20px;">
        <label>📚 Sınıf Filtresi:</label>
        <select v-model="aktifSinifFiltresi" class="ay-input" style="background-color: #f0fdf4; border-color: #86efac; font-weight: bold;">
          <option value="">Tüm Sınıfları Göster</option>
          <option v-for="sinif in benzersizSinifIsimleri" :key="sinif.id" :value="sinif.id">
            Sadece {{ sinif.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- KÜTÜPHANE PANELİ -->
    <div class="kutuphane-panel">
      <div class="panel-ust-kisim">
        <h3>📚 Kurum Kütüphanesine Kitap Ekle</h3>
        <button @click="router.push('/onerilen-kitaplar')" class="btn-bulut-git">☁️ Buluttan Hazır Kitap Çek</button>
      </div>
      <div class="form-group">
        <input type="text" v-model="yeniKitapAd" placeholder="Kitap Adı" class="input-text" />
        <input type="number" v-model="yeniKitapSayfa" placeholder="Toplam Sayfa" class="input-text" />
        <button @click="kurumaKitapEkle" class="btn-ekle">Kütüphaneye Ekle</button>
      </div>
      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <!-- SINIFLARA GÖRE GRUPLANMIŞ KİTAP TABLOLARI -->
    <div v-if="Object.keys(gruplanmisTalebeler).length > 0">
      <div v-for="(ogrenciler, sinifAdi) in gruplanmisTalebeler" :key="sinifAdi" class="sinif-bloku">
        <div class="sinif-basligi">
          <span>📖 {{ sinifAdi }}</span>
          <span class="sinif-mevcudu">{{ ogrenciler.length }} Talebe</span>
        </div>
        
        <table class="etut-table">
          <thead>
            <tr>
              <th>Sıra</th>
              <th>Ad Soyad</th>
              <th>Kitap Seçimi</th>
              <th>Mevcut Durum & Arşiv</th>
              <th>Bu Ay Performans</th>
              <th>Bugün Okunan</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(talebe) in ogrenciler" :key="talebe.id">
              <td>{{ talebe.orderIndex }}</td>
              <td><strong>{{ talebe.fullName }}</strong></td>
              
              <td>
                <div v-if="aktifOkumalar[talebe.id]" class="aktif-kitap-kutusu">
                  <span class="kitap-isim">📖 {{ aktifOkumalar[talebe.id].book.title }}</span>
                  <button @click="kitabiYarimBirak(talebe.id)" class="btn-uyari" title="Başka kitaba geçmek için bırak">Bırak</button>
                </div>
                <select v-else v-model="seciliKitaplar[talebe.id]" class="select-box">
                  <option value="" disabled>Yeni Kitap Seçin...</option>
                  <option v-for="kitap in kitaplar" :key="kitap.id" :value="kitap.id">
                    {{ kitap.title }} ({{ kitap.totalPages }} syf)
                  </option>
                </select>
              </td>

              <td class="durum-sutun">
                <div v-if="aktifOkumalar[talebe.id]" class="ilerleme-alani">
                  <div class="durum-yazi">
                    <span>{{ aktifOkumalar[talebe.id].readPages }} syf / {{ aktifOkumalar[talebe.id].book.totalPages }} syf</span>
                    <strong>%{{ Math.round((aktifOkumalar[talebe.id].readPages / aktifOkumalar[talebe.id].book.totalPages) * 100) }}</strong>
                  </div>
                  <progress class="ilerleme-cubugu" 
                            :value="aktifOkumalar[talebe.id].readPages" 
                            :max="aktifOkumalar[talebe.id].book.totalPages">
                  </progress>
                </div>
                <span v-else class="pasif-yazi">Henüz kitap başlanmadı</span>

                <div v-if="bitirilenOkumalar[talebe.id] && bitirilenOkumalar[talebe.id].length > 0" class="bitirilenler-listesi">
                  <span class="basari-etiketi">📚 Arşiv:</span>
                  <ul>
                    <li v-for="kitap in bitirilenOkumalar[talebe.id]" :key="kitap.metin" :class="{'yarim-kaldi': !kitap.tam}">
                      {{ kitap.metin }}
                    </li>
                  </ul>
                </div>
              </td>

              <td class="aylik-sutun">
                <div class="aylik-kutu">
                  <span class="aylik-sayi">{{ aylikPerformanslar[talebe.id] || 0 }}</span>
                  <span class="aylik-etiket">Sayfa</span>
                </div>
              </td>

              <td>
                <input type="number" v-model="girilenSayfalar[talebe.id]" placeholder="+ Sayfa" class="input-small" />
              </td>
              <td>
                <button class="btn-kaydet" @click="okumaKaydet(talebe.id)">Kaydet</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div v-else class="uyari-mesaj">Bu kriterlere uygun talebe bulunamadı.</div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }
.zaman-filtresi { background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.filtre-grup { display: flex; align-items: center; gap: 10px; }
.filtre-grup label { font-weight: bold; color: #334155; }
.ay-input { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; cursor: pointer; }

/* Sınıf Bloku ve Başlığı */
.sinif-bloku { margin-bottom: 35px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 8px; }
.sinif-basligi { background-color: #1e293b; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; font-size: 1.1rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
.sinif-mevcudu { background-color: #3b82f6; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; }

.kutuphane-panel { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.panel-ust-kisim { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.panel-ust-kisim h3 { margin: 0; color: #334155; }
.btn-bulut-git { background: #8b5cf6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-bulut-git:hover { background: #7c3aed; }

.form-group { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.input-text { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; flex: 1; }
.input-small { width: 70px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-weight: bold; }
.select-box { padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; min-width: 150px; }
.btn-ekle { padding: 8px 16px; background-color: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-ekle:hover { background-color: #059669; }
.btn-kaydet { padding: 6px 12px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
.btn-kaydet:hover { background-color: #2563eb; }

.etut-table { width: 100%; border-collapse: collapse; background: white; border-radius: 0 0 8px 8px; overflow: hidden; table-layout: fixed;}
.etut-table th, .etut-table td { padding: 12px 15px; text-align: left; border: 1px solid #e2e8f0; border-top: none; vertical-align: middle; }
.etut-table th { background-color: #f8fafc; color: #334155; border-top: 1px solid #e2e8f0; }
.toast { color: #166534; font-weight: bold; font-size: 0.9em; margin-top: 5px; }

.durum-sutun { width: 250px; }
.ilerleme-alani { margin-bottom: 10px; }
.durum-yazi { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; color: #475569; }
.ilerleme-cubugu { width: 100%; height: 10px; border-radius: 5px; overflow: hidden; }
.ilerleme-cubugu::-webkit-progress-bar { background-color: #e2e8f0; }
.ilerleme-cubugu::-webkit-progress-value { background-color: #3b82f6; }
.pasif-yazi { font-size: 0.85rem; color: #94a3b8; font-style: italic; }

.bitirilenler-listesi { margin-top: 8px; font-size: 0.8rem; background-color: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
.basari-etiketi { color: #334155; font-weight: bold; display: block; margin-bottom: 4px; }
.bitirilenler-listesi ul { list-style-type: none; padding: 0; margin: 0; color: #15803d; }
.bitirilenler-listesi li { margin-bottom: 2px; }

.aktif-kitap-kutusu { display: flex; gap: 10px; align-items: center; }
.kitap-isim { font-weight: bold; color: #0f172a; }
.btn-uyari { background: #f59e0b; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: bold; }
.btn-uyari:hover { background: #d97706; }
.yarim-kaldi { color: #b45309 !important; font-style: italic; }

.aylik-kutu { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px; text-align: center; color: #1e3a8a; }
.aylik-sayi { font-size: 1.2rem; font-weight: bold; display: block; }
.aylik-etiket { font-size: 0.75rem; font-weight: bold; opacity: 0.8; text-transform: uppercase; }
.uyari-mesaj { text-align: center; padding: 20px; background: white; border-radius: 8px; color: #64748b; font-weight: bold; }
</style>