<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios'

const authStore = useAuthStore()
const gorevler = ref([])
const personeller = ref([])
const islemDurumu = ref('')

const aylar = [
  { id: 1, ad: 'Ocak' }, { id: 2, ad: 'Şubat' }, { id: 3, ad: 'Mart' },
  { id: 4, ad: 'Nisan' }, { id: 5, ad: 'Mayıs' }, { id: 6, ad: 'Haziran' },
  { id: 7, ad: 'Temmuz' }, { id: 8, ad: 'Ağustos' }, { id: 9, ad: 'Eylül' },
  { id: 10, ad: 'Ekim' }, { id: 11, ad: 'Kasım' }, { id: 12, ad: 'Aralık' }
]

// FAZ 3: Gelişmiş Görev Formu Modeli
const yeniGorev = ref({
  title: '',
  description: '',
  moduleType: 'GENEL',
  atamaTipi: 'KURUM_TUMU', // KURUM_TUMU, SINIF_BAZLI, ROL_BAZLI
  hedefClassId: '',
  hedefRol: 'PERSONEL',
  month: new Date().getMonth() + 1, 
  week: 1,
  deadline: ''
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

  yetkiliMi.value = authStore.user?.roleLevel !== 'PERSONEL'

  try {
    const resGorev = await api.get(`/tasks/institution/${kurumId}`)
    gorevler.value = resGorev.data

    const resPersonel = await api.get(`/hierarchy/personnel/${kurumId}?t=${new Date().getTime()}`)
    personeller.value = resPersonel.data

  } catch (error) { console.error("Veriler çekilemedi", error) }
}

const gorevOlustur = async () => {
  if (!yeniGorev.value.title) {
    islemDurumu.value = 'Lütfen Görev Başlığını Doldurun!'
    return
  }
  
  islemDurumu.value = 'Gelişmiş Görev Tanımlanıyor...'
  try {
    // 1. Ana Görevi Oluştur
    const resTask = await api.post('/tasks', {
      title: yeniGorev.value.title,
      description: yeniGorev.value.description,
      moduleType: yeniGorev.value.moduleType,
      month: yeniGorev.value.month,
      week: yeniGorev.value.week,
      institutionId: authStore.user?.institutionId,
      deadline: yeniGorev.value.deadline || null
    })

    const createdTaskId = resTask.data.id;

    // 2. Akıllı Atama Motorunu Tetikle
    await api.post('/tasks/assign-smart', {
      taskId: createdTaskId,
      institutionId: authStore.user?.institutionId,
      classId: yeniGorev.value.atamaTipi === 'SINIF_BAZLI' ? yeniGorev.value.hedefClassId : null,
      roleLevel: yeniGorev.value.atamaTipi === 'ROL_BAZLI' ? yeniGorev.value.hedefRol : null
    })

    islemDurumu.value = 'Görev ve Akıllı Atamalar Başarıyla Tamamlandı!'
    yeniGorev.value.title = ''
    yeniGorev.value.description = ''
    
    setTimeout(() => islemDurumu.value = '', 3000)
    await verileriGetir()
  } catch (error) { 
    islemDurumu.value = 'HATA: Görev atanamadı!' 
  }
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
  } else if (yeniGorev.value.moduleType === 'DENEME') {
    yeniGorev.value.title = `Deneme Ücreti / Takip Görevi`;
  }
}

onMounted(() => { verileriGetir() })
</script>

<template>
  <div class="sayfa-container">
    <h2>🚀 Faz 3: Gelişmiş İş Akışı ve Görev Merkezi</h2>

    <div v-if="yetkiliMi" class="kutu-panel eylem-paneli">
      <h3>Yeni Nesil Kriterli Görev Tanımla</h3>
      <p style="color: #64748b; font-size: 0.9rem;">İstediğiniz modüle bağlı veya tamamen bağımsız (Örn: Deneme Parası, Afiş Asma) özel görevler tanımlayabilir, hedef kitleyi filtreleyebilirsiniz.</p>
      
      <div class="form-grid">
        <div class="form-eleman">
          <label>Görev Türü / Modül</label>
          <select v-model="yeniGorev.moduleType" @change="baslikOner" class="input-text">
            <option value="GENEL">Özel / Harici Görev (Deneme Parası, Afiş vb.)</option>
            <option value="YOKLAMA">Sayfa 2 - Etüt Yoklaması</option>
            <option value="PERFORMANS">Sayfa 4 - Performans Notu</option>
            <option value="KITAP">Sayfa 9 - Kitap Takibi</option>
            <option value="DENEME">Deneme Sınavı Takibi</option>
          </select>
        </div>

        <div class="form-eleman">
          <label>Atama Kriteri (Hedef Kitle)</label>
          <select v-model="yeniGorev.atamaTipi" class="input-text">
            <option value="KURUM_TUMU">Kurumdaki Tüm Personel</option>
            <option value="SINIF_BAZLI">Belirli Sınıf Mesulleri</option>
            <option value="ROL_BAZLI">Belirli Rol Seviyesi</option>
          </select>
        </div>

        <!-- Eğer sınıf bazlı seçildiyse -->
        <div class="form-eleman" v-if="yeniGorev.atamaTipi === 'SINIF_BAZLI'">
          <label>Hedef Sınıf Kodu</label>
          <input type="text" v-model="yeniGorev.hedefClassId" placeholder="Örn: 5_SINIF veya 4_NEHARI" class="input-text" />
        </div>

        <!-- Eğer rol bazlı seçildiyse -->
        <div class="form-eleman" v-if="yeniGorev.atamaTipi === 'ROL_BAZLI'">
          <label>Hedef Rol</label>
          <select v-model="yeniGorev.hedefRol" class="input-text">
            <option value="PERSONEL">Standart Personel</option>
            <option value="KURUM">Kurum Mesulü</option>
            <option value="MINTIKA">Mıntıka Mesulü</option>
          </select>
        </div>

        <div class="form-eleman">
          <label>Son Teslim Tarihi (Deadline)</label>
          <input type="date" v-model="yeniGorev.deadline" class="input-text" />
        </div>

        <div class="form-eleman tam-genislik">
          <label>Görev Başlığı</label>
          <input type="text" v-model="yeniGorev.title" placeholder="Görev Başlığı..." class="input-text" />
        </div>

        <div class="form-eleman tam-genislik">
          <label>Detaylı Açıklama / Yapılacaklar</label>
          <textarea v-model="yeniGorev.description" placeholder="Personelin ne yapacağını detaylıca yazın (Fotoğraf yükleme, ücret toplama vb.)..." class="input-text" rows="3"></textarea>
        </div>

        <div class="form-eleman tam-genislik">
          <button @click="gorevOlustur" class="btn-ata">🎯 Gelişmiş Görevi Başlat & Ata</button>
        </div>
      </div>
      
      <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('HATA')}">{{ islemDurumu }}</div>
    </div>

    <div class="kutu-panel rapor-kutu">
      <div class="baslik-satiri">
        <h3>📊 Aktif Kurum Görevleri ve İş Akışı Takibi</h3>
        <button @click="verileriGetir" class="btn-yenile">🔄 Güncelle</button>
      </div>

      <div v-if="gorevler.length === 0" class="uyari-mesaj">Henüz atanmış bir görev bulunmuyor.</div>

      <div v-for="gorev in gorevler" :key="gorev.id" class="gorev-karti">
        <div class="gorev-ust">
          <h4>{{ gorev.title }}</h4>
          <span class="modul-etiketi">{{ gorev.moduleType }}</span>
        </div>
        
        <p style="color: #475569; font-size: 0.9rem; margin-bottom: 10px;" v-if="gorev.description">
          📝 <i>{{ gorev.description }}</i>
        </p>
        
        <div class="ilerleme-listesi">
          <div v-if="!gorev.progressRecords || gorev.progressRecords.length === 0" class="bilgi-mesaj">
            Bu göreve henüz ilerleme kaydı yansımadı veya özel harici görev.
          </div>

          <div v-for="kayit in gorev.progressRecords" :key="kayit.id" class="personel-satir">
            <div class="personel-isim">
              <strong>{{ kayit.userFullName }}</strong>
              <span class="veri-sayisi">(Hedef: {{ kayit.totalExpected }} | Gerçekleşen: {{ kayit.completedCount }})</span>
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
.sayfa-container { padding: 20px; font-family: sans-serif; }
.kutu-panel { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.eylem-paneli { border-left: 4px solid #3b82f6; }
.form-grid { display: flex; flex-wrap: wrap; gap: 15px; }
.form-eleman { display: flex; flex-direction: column; gap: 5px; min-width: 200px; flex: 1; }
.tam-genislik { min-width: 100%; }
.form-eleman label { font-weight: bold; color: #334155; font-size: 0.9rem; }
.input-text { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; background: #f8fafc; box-sizing: border-box; }
.btn-ata { background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; font-size: 1rem; }
.baslik-satiri { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
.btn-yenile { background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.gorev-karti { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
.gorev-ust { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
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