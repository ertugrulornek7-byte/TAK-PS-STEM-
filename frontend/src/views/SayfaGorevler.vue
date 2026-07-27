<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/authStore'
import axios from 'axios'

const authStore = useAuthStore()
const gorevler = ref([])
const personeller = ref([])
const islemDurumu = ref('')

// Statik ayları kaldırdık, yılın 12 ayını dinamik ekledik
const aylar = [
  { id: 1, ad: 'Ocak' }, { id: 2, ad: 'Şubat' }, { id: 3, ad: 'Mart' },
  { id: 4, ad: 'Nisan' }, { id: 5, ad: 'Mayıs' }, { id: 6, ad: 'Haziran' },
  { id: 7, ad: 'Temmuz' }, { id: 8, ad: 'Ağustos' }, { id: 9, ad: 'Eylül' },
  { id: 10, ad: 'Ekim' }, { id: 11, ad: 'Kasım' }, { id: 12, ad: 'Aralık' }
]

const yeniGorev = ref({
  title: '',
  moduleType: 'YOKLAMA',
  month: new Date().getMonth() + 1, // Şu anki ay varsayılan
  week: 1
})

const yetkiliMi = ref(false)

const dinamikHaftalar = computed(() => {
  const yil = new Date().getFullYear();
  const ayinSonGunu = new Date(yil, yeniGorev.value.month, 0).getDate();
  const haftaSayisi = Math.ceil(ayinSonGunu / 7);
  return Array.from({ length: haftaSayisi }, (_, i) => i + 1);
})

const verileriGetir = async () => {
  const kurumId = authStore.user?.institutionId
  if (!kurumId) return

  yetkiliMi.value = String(authStore.user?.roles).includes('EM')

  try {
    const resGorev = await axios.get(`http://localhost:3000/api/tasks/institution/${kurumId}`)
    gorevler.value = resGorev.data

    const resPersonel = await axios.get(`http://localhost:3000/api/hierarchy/personnel/${kurumId}?t=${new Date().getTime()}`)
    personeller.value = resPersonel.data

  } catch (error) { console.error("Veriler çekilemedi", error) }
}

const gorevOlustur = async () => {
  if (!yeniGorev.value.title) {
    islemDurumu.value = 'Lütfen Görev Başlığını Doldurun!'
    return
  }
  
  islemDurumu.value = 'Görev Atanıyor...'
  try {
    await axios.post('http://localhost:3000/api/tasks/auto-create', {
      title: yeniGorev.value.title,
      moduleType: yeniGorev.value.moduleType,
      month: yeniGorev.value.month,
      week: yeniGorev.value.week,
      institutionId: authStore.user?.institutionId,
      senderId: authStore.user?.id
    })
    
    islemDurumu.value = 'Görev Atandı! Geçmiş veriler taranıyor...'
    
    // YENİ EKLENEN TÜM MODÜLLER İÇİN GEÇMİŞİ TARA
    for (let personel of personeller.value) {
      if (!String(personel.roles).includes('EM')) { 
        await axios.post('http://localhost:3000/api/tasks/calculate-progress', {
          institutionId: authStore.user?.institutionId,
          userId: personel.id,
          month: yeniGorev.value.month,
          week: yeniGorev.value.week,
          moduleType: yeniGorev.value.moduleType
        }).catch(err => console.log("Hoca için hesaplama atlandı."));
      }
    }

    yeniGorev.value.title = ''
    islemDurumu.value = 'Tüm Geçmiş Taraması Bitti ve Sistem Güncellendi!'
    setTimeout(() => islemDurumu.value = '', 2500)
    await verileriGetir()
  } catch (error) { islemDurumu.value = 'HATA: İşlem başarısız!' }
}

const baslikOner = () => {
  const aySecim = aylar.find(a => a.id === yeniGorev.value.month);
  const ayAdi = aySecim ? aySecim.ad : '';
  
  if (yeniGorev.value.moduleType === 'YOKLAMA') {
    yeniGorev.value.title = `${ayAdi} Ayı ${yeniGorev.value.week}. Hafta Yoklama Girişi`;
  } else if (yeniGorev.value.moduleType === 'PERFORMANS') {
    yeniGorev.value.title = `${ayAdi} Ayı ${yeniGorev.value.week}. Hafta Performans Notları`;
  } else if (yeniGorev.value.moduleType === 'KITAP') {
    yeniGorev.value.title = `${ayAdi} Ayı ${yeniGorev.value.week}. Hafta Kitap Okuma Taraması`;
  } else if (yeniGorev.value.moduleType === 'MUFREDAT') {
    yeniGorev.value.title = `${ayAdi} Ayı ${yeniGorev.value.week}. Haftaya Kadar Olan Konular`;
  }
}

onMounted(() => { verileriGetir() })
</script>

<template>
  <div class="sayfa-container">
    <h2>🎯 Akıllı Görev ve Süreç Takibi</h2>

    <div v-if="yetkiliMi" class="kutu-panel eylem-paneli">
      <h3>Yeni Modüler Görev Tanımla</h3>
      <p style="color: #64748b; font-size: 0.9rem;">Sistem, bu görevi oluşturduğu an personellerin o tarih aralığında girdiği GEÇMİŞ verileri otomatik tarayıp ilerlemeye yansıtacaktır.</p>
      
      <div class="form-grid">
        <div class="form-eleman">
          <label>Hedef Modül</label>
          <select v-model="yeniGorev.moduleType" @change="baslikOner" class="input-text">
            <option value="YOKLAMA">Sayfa 2 - Etüt Yoklaması</option>
            <option value="PERFORMANS">Sayfa 4 - Dershane Performans Notu</option>
            <option value="KITAP">Sayfa 9 - Kitap / Okuma Takibi</option>
            <option value="MUFREDAT">Sayfa 5 - Müfredat Takibi</option>
          </select>
        </div>

        <div class="form-eleman">
          <label>İlgili Ay</label>
          <select v-model="yeniGorev.month" @change="baslikOner" class="input-text">
            <option v-for="ay in aylar" :key="ay.id" :value="ay.id">{{ ay.ad }}</option>
          </select>
        </div>

        <div class="form-eleman">
          <label>İlgili Hafta</label>
          <select v-model="yeniGorev.week" @change="baslikOner" class="input-text">
            <option v-for="hafta in dinamikHaftalar" :key="hafta" :value="hafta">{{ hafta }}. Hafta</option>
          </select>
        </div>

        <div class="form-eleman tam-genislik">
          <label>Görev Başlığı</label>
          <div style="display: flex; gap: 10px;">
            <input type="text" v-model="yeniGorev.title" placeholder="Görev Adı..." class="input-text" style="flex: 1;" />
            <button @click="gorevOlustur" class="btn-ata">🚀 Görevi Başlat & Tarat</button>
          </div>
        </div>
      </div>
      <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('Lütfen')}">{{ islemDurumu }}</div>
    </div>

    <div class="kutu-panel rapor-kutu">
      <div class="baslik-satiri">
        <h3>📊 Aktif Görevler ve Personel İlerleme Durumu</h3>
        <button @click="verileriGetir" class="btn-yenile">🔄 Tüm Verileri Güncelle</button>
      </div>

      <div v-if="gorevler.length === 0" class="uyari-mesaj">Henüz atanmış bir görev bulunmuyor.</div>

      <div v-for="gorev in gorevler" :key="gorev.id" class="gorev-karti">
        <div class="gorev-ust">
          <h4>{{ gorev.title }}</h4>
          <span class="modul-etiketi">{{ gorev.moduleType }}</span>
        </div>
        
        <div class="ilerleme-listesi">
          <div v-if="gorev.progressRecords.length === 0" class="bilgi-mesaj">
            Bu göreve henüz hiçbir personel başlamamış veya hocaların talebesi yok.
          </div>

          <div v-for="kayit in gorev.progressRecords" :key="kayit.id" class="personel-satir">
            <div class="personel-isim">
              <strong>{{ kayit.userFullName }}</strong>
              <span class="veri-sayisi">(Hedeflenen: {{ kayit.totalExpected }} | Gerçekleşen: {{ kayit.completedCount }})</span>
            </div>
            <div class="progress-bg">
              <div class="progress-dolu" :style="{ width: kayit.percentage + '%' }" :class="{'tamam': kayit.percentage >= 100}">
                %{{ Math.round(kayit.percentage) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Önceki stillerle birebir aynıdır */
.sayfa-container { padding: 20px; font-family: sans-serif; }
.kutu-panel { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.eylem-paneli { border-left: 4px solid #3b82f6; }
.form-grid { display: flex; flex-wrap: wrap; gap: 15px; }
.form-eleman { display: flex; flex-direction: column; gap: 5px; min-width: 200px; flex: 1; }
.tam-genislik { min-width: 100%; }
.form-eleman label { font-weight: bold; color: #334155; font-size: 0.9rem; }
.input-text { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; background: #f8fafc; }
.btn-ata { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.baslik-satiri { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
.btn-yenile { background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.gorev-karti { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
.gorev-ust { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.gorev-ust h4 { margin: 0; color: #0f172a; font-size: 1.1rem; }
.modul-etiketi { background: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; }
.ilerleme-listesi { background: white; padding: 15px; border-radius: 6px; border: 1px dashed #cbd5e1; }
.personel-satir { margin-bottom: 12px; }
.personel-isim { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px; color: #1e293b; }
.veri-sayisi { color: #64748b; font-size: 0.85rem; }
.progress-bg { background: #e2e8f0; border-radius: 10px; height: 22px; width: 100%; overflow: hidden; }
.progress-dolu { background: #3b82f6; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8rem; font-weight: bold; transition: width 0.5s ease; min-width: 35px; }
.progress-dolu.tamam { background: #10b981; }
.toast { margin-top: 15px; background: #dcfce7; color: #166534; padding: 12px; border-radius: 6px; font-weight: bold; text-align: center; }
.toast.hata { background: #fee2e2; color: #b91c1c; }
.uyari-mesaj { background: #fffbeb; color: #b45309; padding: 15px; border-radius: 6px; text-align: center; }
.bilgi-mesaj { color: #94a3b8; font-size: 0.9rem; font-style: italic; text-align: center; }
</style>