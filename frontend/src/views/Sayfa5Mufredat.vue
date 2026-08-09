<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios' // GÜVENLİ API

const etutStore = useEtutStore()
const authStore = useAuthStore()
const islemDurumu = ref('')
const mufredat = ref([])

const gizleTamamlananlar = ref(false)
const acikDersler = ref({})

// --- YENİ AKILLI ZAMAN MOTORU ---
const aylar = [
  { id: 1, ad: 'Ocak' }, { id: 2, ad: 'Şubat' }, { id: 3, ad: 'Mart' },
  { id: 4, ad: 'Nisan' }, { id: 5, ad: 'Mayıs' }, { id: 6, ad: 'Haziran' },
  { id: 7, ad: 'Temmuz' }, { id: 8, ad: 'Ağustos' }, { id: 9, ad: 'Eylül' },
  { id: 10, ad: 'Ekim' }, { id: 11, ad: 'Kasım' }, { id: 12, ad: 'Aralık' }
]

// Öğretmen Filtresi
const filtreAy = ref(new Date().getMonth() + 1)
const filtreHafta = ref(-1) // -1 = Tüm Ay

const dinamikHaftalarFiltre = computed(() => {
  const yil = new Date().getFullYear();
  const ayinSonGunu = new Date(yil, filtreAy.value, 0).getDate();
  const haftaSayisi = Math.ceil(ayinSonGunu / 7);
  return Array.from({ length: haftaSayisi }, (_, i) => i + 1);
})

// Komisyon Formu
const yeniDersAd = ref('')
const komisyonSeciliSinif = ref('GENEL') 
const seciliDersId = ref('')
const yeniKonu = ref({ 
  title: '', 
  hedefAy: new Date().getMonth() + 1, 
  hedefHafta: 1, 
  specialNotes: '' 
})

const dinamikHaftalarKomisyon = computed(() => {
  const yil = new Date().getFullYear();
  const ayinSonGunu = new Date(yil, yeniKonu.value.hedefAy, 0).getDate();
  const haftaSayisi = Math.ceil(ayinSonGunu / 7);
  return Array.from({ length: haftaSayisi }, (_, i) => i + 1);
})

// ==========================================
// YENİ SİSTEM: SINIF FİLTRELEME VE YETKİ MOTORU
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

const tumSiniflar = [...ORTAOKUL_SINIFLARI, ...LISE_SINIFLARI]

const isPersonel = computed(() => authStore.user?.roleLevel === 'PERSONEL')
const yetkiliSiniflar = computed(() => authStore.user?.managedClassIds || [])

const aktifSinifFiltresi = ref('') // Local filtre durumu

// Sadece personelin yetkili olduğu sınıfları (veya Kurum ise tümünü) filtrede göster
const izinVerilenSiniflar = computed(() => {
  if (isPersonel.value) {
    return tumSiniflar.filter(s => yetkiliSiniflar.value.includes(s.id))
  }
  return tumSiniflar
})
// ==========================================

onMounted(async () => {
  await mufredatiCek()
})

const mufredatiCek = async () => {
  const kurumId = authStore.user?.institutionId
  if (!kurumId) return
  const sinifFiltresi = aktifSinifFiltresi.value || 'GENEL'

  try {
    const res = await api.get(`/curriculum/${kurumId}/${sinifFiltresi}`)
    mufredat.value = res.data
    res.data.forEach(d => {
      if (acikDersler.value[d.id] === undefined) acikDersler.value[d.id] = false
    })
  } catch (error) { console.error('Müfredat çekilemedi', error) }
}

watch(aktifSinifFiltresi, async () => { await mufredatiCek() })
watch(filtreAy, () => { filtreHafta.value = -1 })

const filtrelenmisKonular = (ders) => {
  return ders.topics.filter(konu => {
    if (gizleTamamlananlar.value && konuDurumuBul(konu) === 'ISLENDI') return false;
    
    if (konu.startDate) {
      const konuTarihi = new Date(konu.startDate);
      const konuAyi = konuTarihi.getMonth() + 1;
      
      if (konuAyi !== filtreAy.value) return false;
      
      if (filtreHafta.value !== -1) {
        if (!konu.weekLabel.includes(`${filtreHafta.value}. Hafta`)) return false;
      }
    }
    return true;
  })
}

const dersEkle = async () => {
  if (!yeniDersAd.value) return
  const kurumId = authStore.user?.institutionId
  try {
    await api.post('/curriculum/subject', { 
      name: yeniDersAd.value, 
      institutionId: kurumId, 
      classId: komisyonSeciliSinif.value 
    })
    yeniDersAd.value = ''
    await mufredatiCek()
  } catch (error) { alert('Hata') }
}

const konuEkle = async () => {
  if (!seciliDersId.value || !yeniKonu.value.title) return
  islemDurumu.value = 'Ekleniyor...'
  try {
    const ders = mufredat.value.find(d => d.id === seciliDersId.value)
    const sira = ders ? ders.topics.length + 1 : 1

    const yil = new Date().getFullYear();
    const ayIndex = yeniKonu.value.hedefAy - 1;
    const haftaStartGun = ((yeniKonu.value.hedefHafta - 1) * 7) + 1;
    let haftaEndGun = yeniKonu.value.hedefHafta * 7;

    const ayinSonGunu = new Date(yil, ayIndex + 1, 0).getDate();
    if (haftaEndGun > ayinSonGunu) haftaEndGun = ayinSonGunu;

    const calculatedStartDate = new Date(Date.UTC(yil, ayIndex, haftaStartGun, 0, 0, 0));
    const calculatedEndDate = new Date(Date.UTC(yil, ayIndex, haftaEndGun, 23, 59, 59));
    
    const aySecim = aylar.find(a => a.id === yeniKonu.value.hedefAy);
    const autoWeekLabel = `${aySecim.ad} - ${yeniKonu.value.hedefHafta}. Hafta`;

    await api.post('/curriculum/topic', {
      subjectId: seciliDersId.value, 
      title: yeniKonu.value.title, 
      weekLabel: autoWeekLabel, 
      startDate: calculatedStartDate, 
      endDate: calculatedEndDate, 
      specialNotes: yeniKonu.value.specialNotes, 
      orderIndex: sira
    })

    yeniKonu.value = { title: '', hedefAy: new Date().getMonth() + 1, hedefHafta: 1, specialNotes: '' }
    islemDurumu.value = 'Eklendi!'; setTimeout(() => islemDurumu.value = '', 1500)
    await mufredatiCek()
  } catch (error) { islemDurumu.value = 'Hata!' }
}

const durumGuncelle = async (topicId, yeniDurum) => {
  const kurumId = authStore.user?.institutionId
  const sinifId = aktifSinifFiltresi.value || 'GENEL' 

  try {
    await api.post('/curriculum/progress', {
      topicId: topicId, institutionId: kurumId, classId: sinifId, status: yeniDurum
    })
    await mufredatiCek() 

    try {
      const suAn = new Date();
      const ay = suAn.getMonth() + 1; 
      const hafta = Math.ceil(suAn.getDate() / 7);

      await api.post('/tasks/calculate-progress', {
        institutionId: authStore.user?.institutionId,
        userId: authStore.user?.id,
        month: ay,
        week: hafta,
        moduleType: 'MUFREDAT'
      });
      console.log(`🚀 Müfredat motoru tetiklendi! Ay: ${ay}, Hafta: ${hafta}`);
    } catch (error) { console.error("Müfredat görev yüzdesi güncellenemedi", error); }

  } catch (error) { alert('Hata') }
}

const toggleDers = (dersId) => acikDersler.value[dersId] = !acikDersler.value[dersId]
const konuDurumuBul = (topic) => topic.progresses && topic.progresses.length > 0 ? topic.progresses[0].status : 'ISLENMEDI'
const gunAyFormatla = (tarih) => {
  if (!tarih) return ''; const d = new Date(tarih); const aylarKisa = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']; return `${String(d.getDate()).padStart(2, '0')} ${aylarKisa[d.getMonth()]}`
}
</script>

<template>
  <div class="sayfa-container">
    
    <div class="global-filtre-paneli">
      <div class="filtre-baslik">
        <span class="ikon">🏫</span>
        <div>
          <h3>Sınıf Seçimi (Müfredat)</h3>
          <p>Hangi sınıfın müfredatını görmek veya işlemek istiyorsunuz?</p>
        </div>
      </div>
      <div class="filtre-secici">
        <select v-model="aktifSinifFiltresi" class="input-text vurgulu-secim">
          <option value="">-- Tüm Sınıfların Ortak Dersleri --</option>
          <option v-for="sinif in izinVerilenSiniflar" :key="sinif.id" :value="sinif.id">{{ sinif.name }} Müfredatı</option>
        </select>
      </div>
    </div>

    <h2>Sayfa 5 - Akıllı Müfredat ve İşleniş Takibi</h2>

    <div class="filtre-paneli">
      <div class="filtre-grup">
        <label>📅 Ay Filtresi:</label>
        <select v-model="filtreAy" class="input-kutu select-hafta">
          <option v-for="ay in aylar" :key="ay.id" :value="ay.id">{{ ay.ad }}</option>
        </select>
      </div>
      <div class="filtre-grup">
        <label>🗓️ Hafta:</label>
        <select v-model="filtreHafta" class="input-kutu select-hafta">
          <option value="-1">Tüm Ayı Göster</option>
          <option v-for="hafta in dinamikHaftalarFiltre" :key="hafta" :value="hafta">{{ hafta }}. Hafta</option>
        </select>
      </div>
      <div class="ayirici"></div>
      <div class="filtre-grup checkbox-grup">
        <input type="checkbox" id="gizleCheck" v-model="gizleTamamlananlar" />
        <label for="gizleCheck" class="etiket-yesil">✔️ İşlenenleri Gizle</label>
      </div>
    </div>

    <div class="komisyon-paneli" v-if="!isPersonel">
      <h3>👑 Komisyon - Akıllı Konu Planlama</h3>
      <p style="color: #64748b; font-size: 0.9rem;">Siz sadece ay ve haftayı seçin, sistem tarihleri otomatik hesaplayacaktır.</p>
      
      <div class="form-satirlari">
        <div class="form-grup ufak">
          <input type="text" v-model="yeniDersAd" placeholder="Yeni Branş Adı (Örn: MATEMATİK)" class="input-text w-buyuk" />
          <select v-model="komisyonSeciliSinif" class="select-kutu">
            <option value="GENEL">Tüm Sınıflar İçin Ortak</option>
            <option v-for="sinif in tumSiniflar" :key="sinif.id" :value="sinif.id">Sadece {{ sinif.name }} İçin</option>
          </select>
          <button @click="dersEkle" class="btn-mavi">Branş Ekle</button>
        </div>
        
        <hr class="cizgi" />

        <div class="form-grup detayli-form">
          <select v-model="seciliDersId" class="select-kutu w-buyuk">
            <option value="" disabled>1. Branş Seçin...</option>
            <option v-for="ders in mufredat" :key="ders.id" :value="ders.id">{{ ders.name }}</option>
          </select>
          <select v-model="yeniKonu.hedefAy" class="select-kutu w-kucuk">
            <option v-for="ay in aylar" :key="ay.id" :value="ay.id">{{ ay.ad }}</option>
          </select>
          <select v-model="yeniKonu.hedefHafta" class="select-kutu w-kucuk">
            <option v-for="hafta in dinamikHaftalarKomisyon" :key="hafta" :value="hafta">{{ hafta }}. Hafta</option>
          </select>
        </div>
        <div class="form-grup detayli-form" style="margin-top: 10px;">
          <input type="text" v-model="yeniKonu.title" placeholder="İşlenecek Konu / Ünite Adı" class="input-text w-buyuk" />
          <input type="text" v-model="yeniKonu.specialNotes" placeholder="Özel Not / Deneme Sınavı (Opsiyonel)" class="input-text w-buyuk" />
          <button @click="konuEkle" class="btn-yesil">Konuyu Planla</button>
        </div>
        <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
      </div>
    </div>

    <div class="ogretmen-paneli">
      <h3>👨‍🏫 Seçili Sınıfın Müfredat İşleyişi</h3>
      <p class="aciklama" v-if="aktifSinifFiltresi">Şu an <strong>seçili sınıfın</strong> işlediği konuları görüyorsunuz.</p>
      <p class="aciklama" style="color: #b91c1c; font-weight: bold;" v-else>Tüm sınıflar için genel ortak müfredatı görüyorsunuz.</p>

      <div v-for="ders in mufredat" :key="ders.id" class="ders-karti">
        <div class="ders-baslik" @click="toggleDers(ders.id)" :class="{'acik': acikDersler[ders.id]}">
          <h4>{{ acikDersler[ders.id] ? '📂' : '📁' }} {{ ders.name }}</h4>
          <span class="konu-sayisi">{{ filtrelenmisKonular(ders).length }} Konu</span>
        </div>

        <div class="ders-icerik" v-if="acikDersler[ders.id]">
          <table class="mufredat-tablo" v-if="filtrelenmisKonular(ders).length > 0">
            <thead>
              <tr>
                <th style="width: 150px;">Hedeflenen Hafta</th>
                <th>İşlenecek Konu & Notlar</th>
                <th style="width: 200px;">Sınıfın Durumu</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="konu in filtrelenmisKonular(ders)" :key="konu.id" :class="{'islenen-satir': konuDurumuBul(konu) === 'ISLENDI'}">
                <td class="zaman-sutunu">
                  <strong>{{ konu.weekLabel || '-' }}</strong><br>
                  <span class="kisa-tarih" v-if="konu.startDate">{{ gunAyFormatla(konu.startDate) }} - {{ gunAyFormatla(konu.endDate) }}</span>
                </td>
                <td class="konu-sutunu">
                  <div class="konu-baslik">{{ konu.title }}</div>
                  <div class="konu-notu" v-if="konu.specialNotes">📌 {{ konu.specialNotes }}</div>
                </td>
                <td>
                  <select :value="konuDurumuBul(konu)" @change="durumGuncelle(konu.id, $event.target.value)" class="durum-select" :class="konuDurumuBul(konu).toLowerCase()" :disabled="!aktifSinifFiltresi">
                    <option value="ISLENMEDI">❌ İşlenmedi</option>
                    <option value="ISLENIYOR">⏳ Devam Ediyor</option>
                    <option value="ISLENDI">✔️ İşlendi</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="uyari-mesaj mini">Bu zaman aralığında işlenecek konu bulunmuyor.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }
.global-filtre-paneli { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #1e293b, #334155); padding: 20px 25px; border-radius: 12px; color: white; margin-bottom: 25px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); flex-wrap: wrap; gap: 15px;}
.filtre-baslik { display: flex; align-items: center; gap: 15px; }
.filtre-baslik .ikon { font-size: 2.5rem; }
.filtre-baslik h3 { margin: 0 0 5px 0; color: #f8fafc; font-size: 1.2rem; }
.filtre-baslik p { margin: 0; color: #94a3b8; font-size: 0.9rem; }
.vurgulu-secim { width: 280px; padding: 12px; font-size: 1.05rem; font-weight: bold; border: 2px solid #3b82f6; background-color: #f8fafc; color: #0f172a; cursor: pointer; border-radius: 8px; }
.filtre-paneli { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.filtre-grup { display: flex; align-items: center; gap: 10px; }
.filtre-grup label { font-weight: bold; color: #334155; }
.input-kutu { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; cursor: pointer; }
.ayirici { width: 2px; height: 30px; background-color: #e2e8f0; margin: 0 10px; }
.checkbox-grup { background: #f0fdf4; padding: 8px 15px; border-radius: 6px; border: 1px solid #bbf7d0; cursor: pointer; }
.etiket-yesil { color: #166534 !important; cursor: pointer; }
.komisyon-paneli { background: #f8fafc; border: 1px dashed #94a3b8; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
.komisyon-paneli h3 { margin-top: 0; color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
.form-grup { display: flex; gap: 10px; align-items: center; }
.detayli-form { display: flex; gap: 10px; width: 100%; flex-wrap: wrap; }
.cizgi { border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0; }
.input-text, .select-kutu { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; }
.w-kucuk { width: 120px; }
.w-buyuk { flex: 1; min-width: 200px; }
.btn-mavi { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.btn-yesil { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.ogretmen-paneli { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.ogretmen-paneli h3 { margin-top: 0; color: #0f172a; }
.aciklama { color: #64748b; margin-bottom: 20px; }
.ders-karti { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px; overflow: hidden; }
.ders-baslik { background: #f8fafc; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s; }
.ders-baslik:hover { background: #f1f5f9; }
.ders-baslik.acik { background: #e0e7ff; border-bottom: 1px solid #c7d2fe; }
.ders-baslik h4 { margin: 0; font-size: 1.1rem; color: #1e293b; }
.konu-sayisi { font-size: 0.85rem; color: #64748b; font-weight: bold; background: white; padding: 4px 10px; border-radius: 20px; border: 1px solid #cbd5e1; }
.mufredat-tablo { width: 100%; border-collapse: collapse; }
.mufredat-tablo th, .mufredat-tablo td { padding: 12px 20px; text-align: left; border-bottom: 1px solid #f1f5f9; }
.mufredat-tablo th { background: #f8fafc; color: #64748b; font-size: 0.85rem; text-transform: uppercase; }
.islenen-satir { background-color: #f0fdf4; }
.zaman-sutunu { color: #334155; }
.kisa-tarih { font-size: 0.8rem; color: #64748b; }
.konu-baslik { font-weight: bold; color: #0f172a; font-size: 1rem; margin-bottom: 4px; }
.konu-notu { font-size: 0.85rem; color: #b45309; background: #fffbeb; display: inline-block; padding: 2px 8px; border-radius: 4px; border: 1px solid #fde68a; }
.durum-select { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: bold; cursor: pointer; outline: none; }
.durum-select.islenmedi { background-color: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
.durum-select.isleniyor { background-color: #fef9c3; color: #854d0e; border-color: #fde047; }
.durum-select.islendi { background-color: #dcfce7; color: #166534; border-color: #86efac; }
.durum-select:disabled { opacity: 0.4; cursor: not-allowed; }
.toast { margin-top: 10px; background: #dcfce7; color: #166534; padding: 10px; border-radius: 6px; font-weight: bold; text-align: center; }
.uyari-mesaj.mini { padding: 15px 20px; color: #64748b; font-style: italic; background: #f8fafc; }
</style>