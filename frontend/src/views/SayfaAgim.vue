<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/authStore'
import axios from 'axios'

const authStore = useAuthStore()

const aramaMetni = ref('')
const aramaSonuclari = ref([])
const gelenIstekler = ref([])
const ekibim = ref([])
const islemDurumu = ref('')

onMounted(() => {
  istekleriGetir()
  if (authStore.user?.institutionId) {
    ekibiGetir()
  }
})

const kullaniciAra = async () => {
  if (aramaMetni.value.length < 3) {
    aramaSonuclari.value = []
    return
  }
  try {
    const res = await axios.get(`http://localhost:3000/api/network/search?q=${aramaMetni.value}`)
    aramaSonuclari.value = res.data.filter(u => u.id !== authStore.user.id)
  } catch (error) {
    console.error('Arama hatası:', error)
  }
}

const davetGonder = async (kisiId, kisiAd) => {
  if (!authStore.user.institutionId) {
    alert("Davet gönderebilmek için önce bir Kurum sahibi olmalısınız.")
    return
  }
  islemDurumu.value = `${kisiAd} adlı kullanıcıya davet gönderiliyor...`
  try {
    await axios.post('http://localhost:3000/api/network/invite', {
      senderId: authStore.user.id,
      receiverId: kisiId,
      targetType: 'INSTITUTION',
      targetId: authStore.user.institutionId
    })
    islemDurumu.value = '✅ Davet başarıyla gönderildi!'
    setTimeout(() => islemDurumu.value = '', 3000)
  } catch (error) {
    alert(error.response?.data?.error || 'Davet gönderilemedi.')
    islemDurumu.value = ''
  }
}

const istekleriGetir = async () => {
  try {
    const res = await axios.get(`http://localhost:3000/api/network/my-requests/${authStore.user.id}`)
    gelenIstekler.value = res.data
  } catch (error) {
    console.error('İstekler çekilemedi:', error)
  }
}

const ekibiGetir = async () => {
  try {
    const res = await axios.get(`http://localhost:3000/api/network/my-team/${authStore.user.institutionId}`)
    ekibim.value = res.data
  } catch (error) {
    console.error('Ekip çekilemedi:', error)
  }
}

const davetKabulEt = async (istek) => {
  islemDurumu.value = 'Davet onaylanıyor, ağa katılıyorsunuz...'
  try {
    await axios.post('http://localhost:3000/api/network/accept', {
      requestId: istek.id,
      receiverId: authStore.user.id,
      targetType: istek.targetType,
      targetId: istek.targetId
    })
    
    // YENİ: Personel daveti kabul ettiğinde yeni kurumunu görmesi için yeniden giriş yapmasını istiyoruz.
    alert('🎉 Tebrikler! Daveti kabul ettiniz. Yeni kurumunuzu görebilmek için lütfen tekrar giriş yapın.')
    authStore.logout() 
  } catch (error) {
    alert('Davet onaylanırken hata oluştu.')
    islemDurumu.value = ''
  }
}

const rolCevir = (roller) => {
  if (!roller || roller.length === 0) return 'Personel'
  const r = roller[0]
  if (r === 'BOLGE_EM') return 'Bölge Eğitim Mesulü'
  if (r === 'MINTIKA_EM') return 'Mıntıka Eğitim Mesulü'
  if (r === 'KURUM_EM') return 'Kurum Eğitim Mesulü'
  return 'Sınıf Hocası / Personel'
}
</script>

<template>
  <div class="sayfa-container">
    <div class="ust-bilgi">
      <h2>🌐 Ağım ve Bağlantı Davetleri</h2>
      <p>Kurumunuza personel davet edin veya ekibinizi yönetin.</p>
    </div>

    <div v-if="islemDurumu" class="toast-mesaj">{{ islemDurumu }}</div>

    <div class="grid-layout">
      <div class="panel">
        <h3>🔍 Sisteme Kayıtlı Kullanıcı Ara</h3>
        <p class="aciklama">Sicil ID veya Kullanıcı Adı ile arama yapın.</p>
        <div class="arama-kutusu">
          <input type="text" v-model="aramaMetni" @input="kullaniciAra" placeholder="Örn: 1234567 veya mustafa.hoca" class="input-arama"/>
        </div>
        <div class="sonuc-listesi">
          <div v-for="kisi in aramaSonuclari" :key="kisi.id" class="kisi-karti">
            <div class="kisi-bilgi">
              <strong>{{ kisi.fullName }}</strong>
              <span class="kisi-rol">{{ rolCevir(kisi.roles) }}</span>
              <span class="kisi-kadi">🆔 Sicil: {{ kisi.personelId }}</span>
            </div>
            <button v-if="authStore.user?.roles?.includes('KURUM_EM')" @click="davetGonder(kisi.id, kisi.fullName)" class="btn-davet">Davet Et 📩</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>📥 Bana Gelen Davetler</h3>
        <p class="aciklama">Size gönderilen ağa katılma istekleri.</p>
        <div v-if="gelenIstekler.length === 0" class="bos-durum">Şu an bekleyen davetiniz bulunmuyor.</div>
        <div class="davet-listesi">
          <div v-for="istek in gelenIstekler" :key="istek.id" class="davet-karti">
            <div class="davet-icon">🔔</div>
            <div class="davet-detay">
              <strong>{{ istek.sender.fullName }}</strong> sizi kurumuna davet ediyor.
              <div class="davet-tarih">{{ new Date(istek.createdAt).toLocaleDateString('tr-TR') }}</div>
            </div>
            <button @click="davetKabulEt(istek)" class="btn-kabul">Kabul Et ✔️</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel alt-panel" v-if="authStore.user?.institutionId">
      <h3>🏢 Kurum Personeli (Ekibim)</h3>
      <div class="ekip-grid" v-if="ekibim.length > 0">
        <div v-for="kisi in ekibim" :key="kisi.id" class="ekip-karti">
          <div class="ekip-avatar">👤</div>
          <div class="ekip-detay">
            <strong>{{ kisi.fullName }}</strong>
            <span class="ekip-rol">{{ rolCevir(kisi.roles) }}</span>
            <span class="ekip-sicil">Sicil: {{ kisi.personelId }}</span>
          </div>
        </div>
      </div>
      <div v-else class="bos-durum">Kurumunuzda henüz personel bulunmuyor.</div>
    </div>

  </div>
</template>

<style scoped>
.sayfa-container { font-family: 'Segoe UI', sans-serif; }
.ust-bilgi { margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
.ust-bilgi h2 { margin: 0 0 5px 0; color: #0f172a; }
.toast-mesaj { background: #dbeafe; color: #1e40af; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; text-align: center; }
.grid-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 25px; }
.panel { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
.panel h3 { margin: 0 0 5px 0; color: #1e293b; }
.aciklama { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
.input-arama { width: 100%; padding: 12px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 1rem; margin-bottom: 15px; }
.kisi-karti { display: flex; justify-content: space-between; align-items: center; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; background: #f8fafc; }
.kisi-bilgi { display: flex; flex-direction: column; gap: 4px; }
.kisi-rol { font-size: 0.75rem; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; display: inline-block; width: fit-content; font-weight: bold; }
.btn-davet { background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.bos-durum { text-align: center; padding: 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-weight: bold; }
.davet-karti { display: flex; gap: 15px; padding: 15px; border: 1px solid #fde047; border-radius: 8px; background: #fefce8; align-items: center; }
.davet-icon { font-size: 2rem; }
.btn-kabul { background: #3b82f6; color: white; border: none; padding: 10px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }

/* EKİP KARTLARI */
.alt-panel { border-top: 4px solid #4f46e5; }
.ekip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-top: 15px; }
.ekip-karti { display: flex; align-items: center; gap: 15px; padding: 15px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; }
.ekip-avatar { font-size: 2rem; background: #f1f5f9; padding: 10px; border-radius: 50%; }
.ekip-detay { display: flex; flex-direction: column; gap: 3px; }
.ekip-rol { font-size: 0.75rem; color: #4f46e5; font-weight: bold; }
.ekip-sicil { font-size: 0.8rem; color: #64748b; }
</style>