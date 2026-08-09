<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const hataMesaji = ref('')
const yukleniyor = ref(false) // İŞTE EKSİK OLAN SATIR BU!

const girisYap = async () => {
  if (!username.value || !password.value) {
    hataMesaji.value = 'Lütfen kullanıcı adı ve şifrenizi girin.'
    return
  }

  hataMesaji.value = ''
  yukleniyor.value = true // Butonu pasif yap ve yazıyı değiştir

  const basarili = await authStore.login(username.value, password.value)

  if (!basarili) {
    hataMesaji.value = authStore.error || 'Giriş başarısız oldu.'
  }
  
  yukleniyor.value = false // İşlem bitince butonu eski haline getir
}
</script>

<template>
  <div class="login-container">
    <div class="login-kutu">
      <div class="logo-alani">
        <h1>🎓 Etüt Takip & Yönetim</h1>
        <p>Kurumsal Eğitim Yönetim Sistemi</p>
      </div>

      <div class="form-alani">
        <div class="input-grup">
          <label>Kullanıcı Adı</label>
          <input type="text" v-model="username" @keyup.enter="girisYap" placeholder="Kullanıcı adınızı girin" />
        </div>
        <div class="alt-link">Hesabınız yok mu? <a @click="router.push('/register')" class="link">Kayıt Olun</a></div>

        <div class="input-grup">
          <label>Şifre</label>
          <input type="password" v-model="password" @keyup.enter="girisYap" placeholder="Şifrenizi girin" />
        </div>

        <div v-if="hataMesaji" class="hata-mesaji">⚠️ {{ hataMesaji }}</div>

        <button @click="girisYap" class="btn-giris" :disabled="yukleniyor">
          {{ yukleniyor ? 'Giriş Yapılıyor...' : 'Sisteme Giriş Yap' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); font-family: 'Segoe UI', sans-serif; position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; }
.login-kutu { background: white; width: 100%; max-width: 400px; padding: 40px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); }
.logo-alani { text-align: center; margin-bottom: 30px; }
.logo-alani h1 { color: #1e293b; font-size: 1.6rem; margin: 0 0 5px 0; }
.logo-alani p { color: #64748b; margin: 0; font-size: 0.95rem; }
.form-alani { display: flex; flex-direction: column; gap: 20px; }
.input-grup { display: flex; flex-direction: column; gap: 5px; }
.input-grup label { font-weight: bold; color: #475569; font-size: 0.9rem; }
.input-grup input { padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; transition: 0.2s; }
.input-grup input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
.btn-giris { background: #2563eb; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; font-size: 1.1rem; cursor: pointer; transition: 0.2s; }
.btn-giris:hover:not(:disabled) { background: #1d4ed8; }
.btn-giris:disabled { opacity: 0.7; cursor: not-allowed; }
.hata-mesaji { background: #fef2f2; color: #b91c1c; padding: 10px; border-radius: 6px; font-size: 0.9rem; text-align: center; border: 1px solid #fecaca; }
</style>