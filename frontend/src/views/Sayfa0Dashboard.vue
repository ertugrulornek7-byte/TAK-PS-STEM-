<script setup>
import { useAuthStore } from '../stores/authStore'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter() // Butonların çalışması için eklendi

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
  <div class="dashboard-container">
    <div class="karsilama-karti">
      <h1>Hoş Geldin, {{ authStore.user?.fullName }} 👋</h1>
      <div class="kimlik-bilgileri">
        <p>Mevcut Makam: <strong>{{ rolCevir(authStore.user?.roles) }}</strong></p>
        <p>Sicil / Personel ID: <strong>{{ authStore.user?.personelId || 'Bekleniyor...' }}</strong></p>
      </div>
      
      <div class="kurum-bilgisi" v-if="authStore.user?.institutionId">
        Sistem Durumu: 🟢 <strong>{{ authStore.user?.institutionName }}</strong> kurumuna resmi olarak bağlısınız.
      </div>
      <div class="kurum-bilgisi uyari" v-else>
        Sistem Durumu: 🟡 Şu an hiçbir kuruma bağlı değilsiniz. Ağım menüsünden üst makamların davetini bekleyin.
      </div>
    </div>

    <div class="modul-grid">
      <div class="modul-karti">
        <h3>🌐 Ağ ve Davet Yönetimi</h3>
        <p>Alt personellerinize davet atın veya üst makamların davetlerini onaylayın.</p>
        <button @click="router.push('/agim')" class="btn-git">Ağıma Git →</button>
      </div>

      <div class="modul-karti">
        <h3>📋 Organizasyon Görevleri</h3>
        <p>Mıntıka veya Bölgeden gelen direktifleri izleyin. Alt personellere görev atayın.</p>
        <button @click="router.push('/gorevler')" class="btn-git">Görevlere Git →</button>
      </div>

      <div class="modul-karti etut-karti">
        <h3>📚 Etüt Takip Sistemi</h3>
        <p>Talebelerinizi kaydedin, yoklamalarını alın, kitap ve deneme takiplerini yapın.</p>
        <button @click="router.push('/talebeler')" class="btn-git">Uygulamayı Aç →</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container { padding: 20px; font-family: sans-serif; }
.karsilama-karti { background: linear-gradient(to right, #1e293b, #334155); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.karsilama-karti h1 { margin: 0 0 15px 0; font-size: 2rem; }
.kimlik-bilgileri { display: flex; gap: 30px; margin-bottom: 15px; background: rgba(0,0,0,0.2); padding: 10px 15px; border-radius: 8px; display: inline-flex; }
.kimlik-bilgileri p { margin: 0; font-size: 0.95rem; color: #cbd5e1; }
.kimlik-bilgileri strong { color: white; font-size: 1.05rem; margin-left: 5px; }

.kurum-bilgisi { padding: 12px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 1rem; border-left: 4px solid #4ade80; }
.kurum-bilgisi.uyari { border-left-color: #facc15; }

.modul-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
.modul-karti { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; display: flex; flex-direction: column; }
.modul-karti h3 { margin-top: 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
.modul-karti p { color: #64748b; flex: 1; line-height: 1.5; }
.etut-karti { border-top: 4px solid #3b82f6; }

.btn-git { background: #f1f5f9; color: #3b82f6; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; margin-top: 15px; }
.btn-git:hover { background: #e0e7ff; color: #4f46e5; }
</style>