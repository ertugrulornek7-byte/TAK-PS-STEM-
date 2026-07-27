<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore' // GÜVENLİK KAPISI EKLENDİ
import axios from 'axios'

const router = useRouter()
const etutStore = useEtutStore()
const authStore = useAuthStore() // GÜVENLİK KAPISI BAŞLATILDI

const bulutKitaplar = ref([
  { id: 1, title: 'Riyazüs Salihin', yazar: 'İmam Nevevi', totalPages: 850, kategori: 'Hadis' },
  { id: 2, title: 'Büyük İslam İlmihali', yazar: 'Ömer Nasuhi Bilmen', totalPages: 640, kategori: 'Fıkıh' },
  { id: 3, title: 'Safahat', yazar: 'Mehmet Akif Ersoy', totalPages: 520, kategori: 'Şiir/Tarih' },
])

const kütüphaneyeKopyala = async (kitap) => {
  const kurumId = authStore.user?.institutionId // HAYALET VERİ ÇÖZÜMÜ
  if (!kurumId) {
    alert("Kurum kimliği bulunamadı, lütfen sayfayı yenileyin veya tekrar giriş yapın.")
    return
  }

  try {
    await axios.post('http://localhost:3000/api/books', {
      title: kitap.title,
      totalPages: kitap.totalPages,
      institutionId: kurumId // GÜVENLİ MÜHÜR BASILDI
    })
    
    alert(`✔️ "${kitap.title}" başarıyla kurum kütüphanenize eklendi!`)
    router.push('/kitap') 
  } catch (error) {
    // Bulut sayfasında da aynı kitap varsa uyarı verip eklemeyi durduracak
    if (error.response && error.response.data.error) {
      alert(`❌ İşlem İptal Edildi: ${error.response.data.error}`);
    } else {
      alert('❌ Kitap eklenirken bir hata oluştu.');
    }
  }
}
</script>

<template>
  <div class="sayfa-container">
    <div class="header-row">
      <h2>☁️ Sayfa 3.1 - Bulut Kütüphane (Önerilen Kitaplar)</h2>
      <p class="aciklama">Merkez tarafından tavsiye edilen bu kitapları tek tıkla kendi kurum kütüphanenize ekleyebilirsiniz.</p>
    </div>

    <div class="grid-container">
      <div v-for="kitap in bulutKitaplar" :key="kitap.id" class="kitap-kart">
        <div class="kitap-detay">
          <h3>{{ kitap.title }}</h3>
          <p><strong>Yazar:</strong> {{ kitap.yazar }}</p>
          <p><strong>Kategori:</strong> {{ kitap.kategori }}</p>
          <p><strong>Sayfa:</strong> {{ kitap.totalPages }}</p>
        </div>
        <button @click="kütüphaneyeKopyala(kitap)" class="btn-bulut">⬇️ Kurumuma Ekle</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }
.header-row { margin-bottom: 20px; }
.aciklama { color: #64748b; font-size: 0.95rem; }
.grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
.kitap-kart { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between; }
.kitap-detay h3 { margin: 0 0 10px 0; color: #1e293b; font-size: 1.1rem; }
.kitap-detay p { margin: 5px 0; color: #475569; font-size: 0.9rem; }
.btn-bulut { margin-top: 15px; padding: 10px; background-color: #8b5cf6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; }
.btn-bulut:hover { background-color: #7c3aed; }
</style>