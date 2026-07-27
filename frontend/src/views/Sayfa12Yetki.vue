<script setup>
import { ref, watch, onMounted } from 'vue'
import { useAuthStore } from '../stores/authStore'
import axios from 'axios'

const authStore = useAuthStore()
const siniflar = ref([])
const seviyeler = ref([])
const personeller = ref([])
const yeniSinifAd = ref('')
const yeniSeviyeAd = ref('')
const islemDurumu = ref('')
const yetkiForm = ref({})

const verileriCek = async () => {
  const kurumId = authStore.user?.institutionId
  if (!kurumId) {
    console.log("Kurum ID bekleniyor...");
    return;
  }

  try {
    islemDurumu.value = 'Veriler Yükleniyor...'
    
    // TARAYICI ÖN BELLEĞİNİ (CACHE) KIRAN SİHİRLİ DAMGA:
    const zamanDamgasi = new Date().getTime();
    
    // Sınıfları Çek (Sonuna ?t=zaman ekledik)
    const resGruplar = await axios.get(`http://localhost:3000/api/hierarchy/groups/${kurumId}?t=${zamanDamgasi}`)
    siniflar.value = resGruplar.data.classes || []
    seviyeler.value = resGruplar.data.levels || []

    // Personelleri Çek (Sonuna ?t=zaman ekledik)
    const resPersonel = await axios.get(`http://localhost:3000/api/hierarchy/personnel/${kurumId}?t=${zamanDamgasi}`)
    personeller.value = resPersonel.data || []

    // KONSOLA EKRAN ÇIKTISI VERİYORUZ (Görmek İçin)
    console.log("🔥 TAZE ÇEKİLEN SINIFLAR:", siniflar.value);
    console.log("🔥 TAZE ÇEKİLEN PERSONELLER:", personeller.value);

    yetkiForm.value = {}
    personeller.value.forEach(p => {
      yetkiForm.value[p.id] = {
        classes: p.managedClasses ? p.managedClasses.map(c => c.id) : [],
        levels: p.managedLevels ? p.managedLevels.map(l => l.id) : []
      }
    })
    islemDurumu.value = '' 
  } catch (error) { 
    islemDurumu.value = 'HATA: Veriler alınamadı! Arka plan kapalı veya çöktü.'
    alert("SUNUCU HATASI: Lütfen arka planın çalıştığından emin olun!\nDetay: " + error.message);
  }
}

const sinifEkle = async () => {
  if (!yeniSinifAd.value) return
  try {
    await axios.post('http://localhost:3000/api/hierarchy/class', { name: yeniSinifAd.value, institutionId: authStore.user?.institutionId })
    yeniSinifAd.value = ''
    alert("Sınıf Başarıyla Eklendi!")
    await verileriCek()
  } catch (error) {
    alert("HATA: Sınıf Eklenemedi! " + error.message)
  }
}

const seviyeEkle = async () => {
  if (!yeniSeviyeAd.value) return
  try {
    await axios.post('http://localhost:3000/api/hierarchy/level', { name: yeniSeviyeAd.value, institutionId: authStore.user?.institutionId })
    yeniSeviyeAd.value = ''
    alert("Seviye Başarıyla Eklendi!")
    await verileriCek()
  } catch (error) {
    alert("HATA: Seviye Eklenemedi! " + error.message)
  }
}

const yetkiKaydet = async (userId) => {
  try {
    await axios.post('http://localhost:3000/api/hierarchy/assign-personnel', {
      userId: userId, classIds: yetkiForm.value[userId].classes, levelIds: yetkiForm.value[userId].levels
    })
    alert("Yetkiler Başarıyla Kaydedildi!")
    await verileriCek()
  } catch (error) {
    alert("HATA: Yetki Kaydedilemedi! " + error.message)
  }
}

// 1. Sayfa yüklendiğinde çalıştır
onMounted(() => {
  setTimeout(() => { verileriCek() }, 500)
})

// 2. F5 atılırsa ve ID sonradan gelirse çalıştır
watch(() => authStore.user?.institutionId, (yeniId) => {
  if (yeniId) { verileriCek() }
})
</script>

<template>
  <div class="sayfa-container">
    <h2>Sayfa 12 - Hiyerarşi ve Yetki Yönetimi</h2>
    
    <button @click="verileriCek" class="zorla-buton">🚀 VERİLERİ ÇEK / YENİLE</button>

    <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('HATA')}">{{ islemDurumu }}</div>

    <div class="grup-panelleri">
      <div class="kutu-panel">
        <h3>🏫 Sınıf Yönetimi</h3>
        <div class="form-grup">
          <input type="text" v-model="yeniSinifAd" placeholder="Örn: 6. Sınıf" class="input-text" @keyup.enter="sinifEkle" />
          <button @click="sinifEkle" class="btn-ekle mavi">+ Ekle</button>
        </div>
        <div class="etiket-listesi">
          <span v-for="sinif in siniflar" :key="sinif.id" class="etiket mavi-etiket">{{ sinif.name }}</span>
        </div>
      </div>

      <div class="kutu-panel">
        <h3>📈 Seviye Yönetimi</h3>
        <div class="form-grup">
          <input type="text" v-model="yeniSeviyeAd" placeholder="Örn: Seviye 1" class="input-text" @keyup.enter="seviyeEkle" />
          <button @click="seviyeEkle" class="btn-ekle sari">+ Ekle</button>
        </div>
        <div class="etiket-listesi">
          <span v-for="seviye in seviyeler" :key="seviye.id" class="etiket sari-etiket">{{ seviye.name }}</span>
        </div>
      </div>
    </div>

    <div class="yetki-paneli">
      <h3>👨‍🏫 Personel Görevlendirme Matrisi</h3>
      <table class="etut-table" v-if="personeller.length > 0">
        <thead>
          <tr>
            <th style="width: 200px;">Personel Adı</th>
            <th>Sorumlu Olduğu Sınıflar</th>
            <th style="width: 120px; text-align: center;">İşlem</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="personel in personeller" :key="personel.id">
            <td><strong>{{ personel.fullName }}</strong> <br><small style="color: gray;">{{ personel.roles.join(', ') }}</small></td>
            <td>
              <div class="checkbox-grid" v-if="yetkiForm[personel.id]">
                <label v-for="sinif in siniflar" :key="sinif.id" class="check-kutu">
                  <input type="checkbox" :value="sinif.id" v-model="yetkiForm[personel.id].classes">
                  {{ sinif.name }}
                </label>
              </div>
            </td>
            <td style="text-align: center;">
              <button @click="yetkiKaydet(personel.id)" class="btn-kaydet">💾 Kaydet</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="uyari-mesaj">Kurumunuza kayıtlı personel bulunamadı veya yükleniyor...</div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }
.zorla-buton { width: 100%; padding: 15px; background: #0f172a; color: white; font-weight: bold; font-size: 1.1rem; border: none; border-radius: 8px; margin-bottom: 20px; cursor: pointer; }
.zorla-buton:hover { background: #1e293b; }
.grup-panelleri { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
.kutu-panel { flex: 1; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 300px; }
.kutu-panel h3 { margin-top: 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
.form-grup { display: flex; gap: 10px; margin-bottom: 15px; }
.input-text { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; flex: 1; font-size: 1rem; }
.btn-ekle { padding: 0 20px; border: none; border-radius: 6px; font-weight: bold; color: white; cursor: pointer; }
.btn-ekle.mavi { background-color: #3b82f6; }
.btn-ekle.sari { background-color: #f59e0b; }
.etiket-listesi { display: flex; flex-wrap: wrap; gap: 8px; }
.etiket { padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
.mavi-etiket { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.sari-etiket { background: #fefce8; color: #b45309; border: 1px solid #fde047; }
.yetki-paneli { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.etut-table { width: 100%; border-collapse: collapse; }
.etut-table th, .etut-table td { padding: 15px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
.etut-table th { background-color: #f8fafc; color: #334155; font-size: 0.9rem; text-transform: uppercase; }
.checkbox-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.check-kutu { display: flex; align-items: center; gap: 5px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #cbd5e1; cursor: pointer; font-weight: 500; }
.btn-kaydet { padding: 10px 15px; background-color: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; }
.toast { margin-bottom: 20px; background: #dcfce7; color: #166534; padding: 12px 20px; border-radius: 6px; font-weight: bold; text-align: center; }
.toast.hata { background: #fee2e2; color: #b91c1c; }
.uyari-mesaj { background: #fffbeb; color: #b45309; padding: 20px; border-radius: 6px; text-align: center; font-weight: bold; }
</style>