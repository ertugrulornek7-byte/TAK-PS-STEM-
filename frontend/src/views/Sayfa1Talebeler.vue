<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore'

const router = useRouter()
const etutStore = useEtutStore()
const authStore = useAuthStore()

const yeniKod = ref('')
const yeniAd = ref('')
const seciliSinif = ref('')
const seciliSeviye = ref('')
const islemDurumu = ref('')

// YETKİ SEVİYELERİ
const userRole = computed(() => authStore.user?.roles[0] || 'PERSONEL')
const isAdmin = computed(() => userRole.value === 'ADMIN')
const isBolgeEM = computed(() => userRole.value === 'BOLGE_EM')
const isMintikaEM = computed(() => userRole.value === 'MINTIKA_EM')
const isKurumEM = computed(() => userRole.value === 'KURUM_EM')
const isUstYonetim = computed(() => isAdmin.value || isBolgeEM.value || isMintikaEM.value)

// GELİŞMİŞ FİLTRELEME MODELLERİ
const aktifKurumFiltresi = ref('')
const aktifSinifFiltresi = ref('')

const kaydet = async () => {
  if (!yeniKod.value || !yeniAd.value) return
  const yeniSira = etutStore.talebler?.length > 0 ? Math.max(...etutStore.talebler.map(t => t.orderIndex)) + 1 : 1
  islemDurumu.value = 'Kaydediliyor...'
  try {
    await etutStore.talebeEkle({ 
      studentCode: yeniKod.value, fullName: yeniAd.value, orderIndex: yeniSira,
      classId: seciliSinif.value || null, levelGroupId: seciliSeviye.value || null
    })
    yeniKod.value = ''; yeniAd.value = ''; seciliSinif.value = ''; seciliSeviye.value = ''
    islemDurumu.value = 'Eklendi!'; setTimeout(() => islemDurumu.value = '', 1500)
  } catch (error) { islemDurumu.value = 'Hata!' }
}

const karneGor = (id) => router.push(`/karne/${id}`)

// AKILLI GRUPLAMA VE FİLTRELEME MOTORU
const gruplanmisTalebeler = computed(() => {
  let talebeler = etutStore.gosterilenTalebeler || []

  // 1. AŞAMA: Filtreleri Uygula
  if (aktifKurumFiltresi.value) {
    talebeler = talebeler.filter(t => t.institutionId === aktifKurumFiltresi.value)
  }
  if (aktifSinifFiltresi.value) {
    talebeler = talebeler.filter(t => t.class?.name === aktifSinifFiltresi.value)
  }

  // 2. AŞAMA: Hiyerarşik Gruplama
  const gruplar = {}

  talebeler.forEach(t => {
    // Kurum ve Sınıf isimlerini güvenli bir şekilde al
    const kurumAdi = t.institution?.name || 'Kendi Kurumunuz'
    const sinifAdi = t.class?.name || 'Atanmamış / Bağımsız Talebeler'
    const sinifMesulu = t.class?.managers?.map(m => m.fullName).join(', ') || 'Mesul Atanmamış'

    // Üst yönetimse önce kuruma, sonra sınıfa göre grupla
    if (isUstYonetim.value) {
      if (!gruplar[kurumAdi]) gruplar[kurumAdi] = {}
      if (!gruplar[kurumAdi][sinifAdi]) gruplar[kurumAdi][sinifAdi] = { mesul: sinifMesulu, ogrenciler: [] }
      gruplar[kurumAdi][sinifAdi].ogrenciler.push(t)
    } 
    // Kurum EM veya Personelse doğrudan sınıfa göre grupla
    else {
      if (!gruplar[sinifAdi]) gruplar[sinifAdi] = { mesul: sinifMesulu, ogrenciler: [] }
      gruplar[sinifAdi].ogrenciler.push(t)
    }
  })

  return gruplar
})

// Dinamik Sınıf Listesi (Filtre için benzersiz sınıfları çeker)
const benzersizSinifIsimleri = computed(() => {
  const siniflar = new Set()
  if (etutStore.gosterilenTalebeler) {
    etutStore.gosterilenTalebeler.forEach(t => {
      if (t.class?.name) siniflar.add(t.class.name)
    })
  }
  return Array.from(siniflar).sort()
})

onMounted(() => {
  setTimeout(async () => {
    if (!etutStore.talebler || etutStore.talebler.length === 0) { await etutStore.talebeleriGetir() }
    await etutStore.gruplariGetir()
  }, 300)
})
</script>

<template>
  <div class="sayfa-container">
    
    <!-- GELİŞMİŞ HİYERARŞİK FİLTRE PANELİ -->
    <div class="global-filtre-paneli" v-if="userRole !== 'PERSONEL'">
      <div class="filtre-baslik">
        <span class="ikon">🎯</span>
        <div>
          <h3>Stratejik Görünüm Filtresi</h3>
          <p>Seçimleriniz tüm sayfalardaki (Yoklama, Sınav, Kitap) listeleri anında daraltır.</p>
        </div>
      </div>
      <div class="filtre-secici-grup">
        
        <!-- Üst Yönetim Kurum Filtresi -->
        <select v-if="isUstYonetim" v-model="aktifKurumFiltresi" class="input-text vurgulu-secim">
          <option value="">🌍 Tüm Kurumları Göster</option>
          <option v-for="kurum in authStore.bagliKurumlar" :key="kurum.id" :value="kurum.id">
            🏫 {{ kurum.name }}
          </option>
        </select>

        <!-- Sınıf Filtresi -->
        <select v-model="aktifSinifFiltresi" class="input-text vurgulu-secim">
          <option value="">📚 Tüm Sınıfları Göster</option>
          <option v-for="sinifAdi in benzersizSinifIsimleri" :key="sinifAdi" :value="sinifAdi">
            Sadece {{ sinifAdi }}
          </option>
        </select>

      </div>
    </div>

    <div class="header-row">
      <h2>Sayfa 1 - Talebe Listesi ve Sınıf Hiyerarşisi</h2>
    </div>

    <!-- TALEBE EKLEME PANELİ (Üst Yönetim Toplu Excel Sayfasına Gider, Kurum EM Tekli Ekler) -->
    <div class="ekleme-paneli" v-if="isKurumEM || isUstYonetim">
      <h3>👤 Yeni Talebe Kaydı</h3>
      <div class="form-group" v-if="isKurumEM">
        <input type="text" v-model="yeniKod" placeholder="Talebe Kodu" class="input-text kisa" />
        <input type="text" v-model="yeniAd" placeholder="Ad Soyad" class="input-text uzun" />
        
        <select v-model="seciliSinif" class="input-text">
          <option value="">-- Sınıf Seç --</option>
          <option v-for="sinif in etutStore.siniflar" :key="sinif.id" :value="sinif.id">{{ sinif.name }}</option>
        </select>

        <button @click="kaydet" class="btn-ekle">+ Talebe Ekle</button>
      </div>
      <div v-else style="padding: 10px 0;">
        <p style="color: #475569; font-size: 0.95rem; margin-bottom: 15px;">
          Mıntıka ve Bölge mesulleri doğrudan Excel üzerinden kurumlara toplu talebe aktarımı yapabilir.
        </p>
        <button class="btn-mavi" @click="router.push('/toplu-ogrenci-ekle')">📊 Excel ile Toplu Yükleme Ekranına Git</button>
      </div>
      <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('Lütfen')}">{{ islemDurumu }}</div>
    </div>
    
    <div v-if="etutStore.yukleniyor" class="loading">Sistem verileri taranıyor, lütfen bekleyin...</div>
    <div v-else-if="etutStore.hata" class="error">{{ etutStore.hata }}</div>
    
    <!-- AKILLI İÇ İÇE LİSTELEME GÖRÜNÜMÜ -->
    <div v-else class="hiyerarsi-konteyner">
      <div v-if="Object.keys(gruplanmisTalebeler).length === 0" style="text-align: center; color: #64748b; padding: 20px; background: white; border-radius: 8px;">
        Filtrelerinize uygun talebe bulunamadı.
      </div>

      <!-- 1. SENARYO: ÜST YÖNETİM İÇİN (KURUM -> SINIF -> ÖĞRENCİ) -->
      <template v-if="isUstYonetim">
        <details class="kurum-akordeon" v-for="(siniflarDict, kurumAdi) in gruplanmisTalebeler" :key="kurumAdi" open>
          <summary class="kurum-baslik">
            <span>🏫 <strong>{{ kurumAdi }}</strong></span>
            <span class="badge">{{ Object.values(siniflarDict).reduce((acc, curr) => acc + curr.ogrenciler.length, 0) }} Talebe</span>
          </summary>
          
          <div class="kurum-icerik">
            <details class="sinif-akordeon" v-for="(sinifData, sinifAdi) in siniflarDict" :key="sinifAdi" open>
              <summary class="sinif-baslik">
                <span>📚 Sınıf: <strong>{{ sinifAdi }}</strong></span>
                <span class="mesul-etiket">Hoca: {{ sinifData.mesul }}</span>
              </summary>
              <div class="sinif-icerik">
                <table class="etut-table">
                  <thead>
                    <tr><th>Sıra</th><th>Kodu</th><th>Ad Soyad</th><th style="text-align:center;">İşlemler</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(talebe, index) in sinifData.ogrenciler" :key="talebe.id" :class="{'pasif-satir': talebe.status === 'PASIF'}">
                      <td width="50" align="center"><strong>{{ index + 1 }}</strong></td>
                      <td width="150"><strong>{{ talebe.studentCode }}</strong></td>
                      <td>
                        {{ talebe.fullName }}
                        <span v-if="talebe.status === 'PASIF'" class="pasif-rozet">Silinme Bekliyor</span>
                      </td>
                      <td align="center" width="200">
                        <button @click="karneGor(talebe.id)" class="btn-karne">📄 Karne</button>
                        <button v-if="!isKurumEM && talebe.status === 'PASIF'" class="btn-sil" @click="etutStore.talebeSil(talebe.id)">Kalıcı Sil</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </details>
      </template>

      <!-- 2. SENARYO: KURUM EM VE PERSONEL İÇİN (SADECE SINIF -> ÖĞRENCİ) -->
      <template v-else>
        <details class="sinif-akordeon" v-for="(sinifData, sinifAdi) in gruplanmisTalebeler" :key="sinifAdi" open>
          <summary class="sinif-baslik">
            <span>📚 Sınıf: <strong>{{ sinifAdi }}</strong></span>
            <span class="mesul-etiket">Hoca: {{ sinifData.mesul }}</span>
            <span class="badge" style="margin-left: auto;">{{ sinifData.ogrenciler.length }} Talebe</span>
          </summary>
          <div class="sinif-icerik">
            <table class="etut-table">
              <thead>
                <tr><th>Sıra</th><th>Kodu</th><th>Ad Soyad</th><th style="text-align:center;">İşlemler</th></tr>
              </thead>
              <tbody>
                <tr v-for="(talebe, index) in sinifData.ogrenciler" :key="talebe.id" :class="{'pasif-satir': talebe.status === 'PASIF'}">
                  <td width="50" align="center"><strong>{{ index + 1 }}</strong></td>
                  <td width="150"><strong>{{ talebe.studentCode }}</strong></td>
                  <td>
                    {{ talebe.fullName }}
                    <span v-if="talebe.status === 'PASIF'" class="pasif-rozet">Silinme Bekliyor</span>
                  </td>
                  <td align="center" width="200">
                    <button @click="karneGor(talebe.id)" class="btn-karne">📄 Karne</button>
                    <!-- Kurum EM Silerse Pasife Alınır, Personel Silemez -->
                    <button v-if="isKurumEM && talebe.status !== 'PASIF'" class="btn-sil" @click="etutStore.talebeSil(talebe.id)">Sil</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>

    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }

/* Global Filtre */
.global-filtre-paneli { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #1e293b, #334155); padding: 20px 25px; border-radius: 12px; color: white; margin-bottom: 25px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); flex-wrap: wrap; gap: 15px; }
.filtre-baslik { display: flex; align-items: center; gap: 15px; }
.filtre-baslik .ikon { font-size: 2.5rem; }
.filtre-baslik h3 { margin: 0 0 5px 0; color: #f8fafc; font-size: 1.2rem; }
.filtre-baslik p { margin: 0; color: #94a3b8; font-size: 0.9rem; }
.filtre-secici-grup { display: flex; gap: 15px; flex-wrap: wrap; }
.vurgulu-secim { min-width: 200px; padding: 12px; font-size: 1rem; font-weight: bold; border: 2px solid #3b82f6; background-color: #f8fafc; color: #0f172a; cursor: pointer; border-radius: 6px; }

.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.ekleme-paneli { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; border-left: 4px solid #10b981; }
.ekleme-paneli h3 { margin-top: 0; color: #334155; font-size: 1.1rem; }
.form-group { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.input-text { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; background: #f8fafc; }
.input-text:focus { outline: none; border-color: #3b82f6; background: white; }
.kisa { width: 140px; }
.uzun { flex: 1; min-width: 200px; }

/* Butonlar */
.btn-ekle { padding: 10px 20px; background-color: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-mavi { padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-karne { padding: 6px 12px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px; font-weight: bold; }
.btn-sil { padding: 6px 12px; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }

/* Hiyerarşi (Akordeon) Tasarımı */
.hiyerarsi-konteyner { display: flex; flex-direction: column; gap: 15px; }

details > summary { list-style: none; cursor: pointer; }
details > summary::-webkit-details-marker { display: none; }

/* Kurum Akordeon */
.kurum-akordeon { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 10px; }
.kurum-baslik { background: #e2e8f0; padding: 15px 20px; font-size: 1.1rem; color: #1e293b; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; }
.kurum-icerik { padding: 15px; display: flex; flex-direction: column; gap: 15px; }

/* Sınıf Akordeon */
.sinif-akordeon { background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden; margin-bottom: 10px;}
.sinif-baslik { background: #f8fafc; padding: 12px 20px; font-size: 1.05rem; color: #334155; display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #e2e8f0; }
.mesul-etiket { background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; border: 1px solid #fde68a; }
.badge { background: #3b82f6; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }

/* Tablo Tasarımı */
.sinif-icerik { padding: 0; }
.etut-table { width: 100%; border-collapse: collapse; background: white; }
.etut-table th, .etut-table td { padding: 12px 20px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
.etut-table th { background-color: #f1f5f9; color: #475569; font-weight: bold; font-size: 0.85rem; text-transform: uppercase;}
.etut-table tr:hover { background-color: #f8fafc; }

/* Soft Delete (Pasif Durum) Görünümü */
.pasif-satir { opacity: 0.6; background-color: #f8fafc; }
.pasif-satir td { text-decoration: line-through; color: #94a3b8; }
.pasif-rozet { background: #fee2e2; color: #b91c1c; font-size: 0.75rem; padding: 3px 8px; border-radius: 12px; margin-left: 10px; text-decoration: none !important; display: inline-block; font-weight: bold;}

.toast { padding: 10px; border-radius: 6px; background-color: #dcfce7; color: #166534; font-weight: bold; margin-top: 10px; }
.toast.hata { background-color: #fee2e2; color: #b91c1c; }
</style>