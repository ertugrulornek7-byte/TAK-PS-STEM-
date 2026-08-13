<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useAuthStore } from './stores/authStore'

const authStore = useAuthStore()

// 1. Kullanıcının güncel rolünü (roleLevel) alıyoruz
const userRole = computed(() => authStore.user?.roleLevel || 'PERSONEL')

// 2. Rolleri arayüzde Türkçe ve şık göstermek için yardımcı fonksiyon (Yeni sisteme entegre)
const rolCevir = (roleLevel) => {
  if (roleLevel === 'SISTEM') return 'Sistem Yöneticisi'
  if (roleLevel === 'BOLGE') return 'Bölge Eğitim Mesulü'
  if (roleLevel === 'MINTIKA') return 'Mıntıka Eğitim Mesulü'
  if (roleLevel === 'KURUM') return 'Kurum Eğitim Mesulü'
  return 'Sınıf Hocası / Personel'
}

// 3. Menü Görünürlük Kontrolleri (RBAC Kalkanları)
const canSeeTopluOgrenci = computed(() => ['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM'].includes(userRole.value))
const canSeeAdminPanel = computed(() => ['SISTEM', 'BOLGE', 'MINTIKA'].includes(userRole.value))
const canSeeYetkiYonetimi = computed(() => ['SISTEM'].includes(userRole.value))

</script>

<template>
  <div class="app-container" v-if="authStore.token">
    <header class="topbar">
      <div class="logo">🏢 Ana Organizasyon Yönetimi</div>
      <div class="kullanici-alani">
        <div class="kullanici-bilgi">
          <span class="isim">{{ authStore.user?.fullName }}</span>
          <span class="rol">{{ rolCevir(authStore.user?.roleLevel) }}</span>
        </div>
        <button @click="authStore.logout()" class="btn-cikis">Çıkış Yap</button>
      </div>
    </header>

    <div class="main-layout">
      <nav class="sidebar">
        
        <div class="menu-kategori">ANA SİSTEM</div>
        <RouterLink to="/" class="nav-link">📊 Ana Gösterge</RouterLink>
        <RouterLink to="/gorevler" class="nav-link">📋 Görev Takibi</RouterLink>
        
        <!-- YETKİYE GÖRE AÇILAN ÖZEL MENÜLER -->
        <router-link v-if="canSeeTopluOgrenci" to="/toplu-ogrenci-ekle" class="nav-link">
          👥 Toplu Öğrenci Ekle
        </router-link>

        <router-link v-if="canSeeAdminPanel" to="/admin" class="menu-btn ozel-yetki-btn">
          🏢 Admin Paneli
        </router-link>

<router-link to="/analiz" v-if="yoneticiMi" class="menu-link" active-class="aktif">
  📈 Kullanım Analizi
</router-link>

        <router-link v-if="canSeeYetkiYonetimi" to="/yetki" class="menu-btn ozel-yetki-btn">
          ⚙️ Yetki ve Yönetim
        </router-link>

        <div class="menu-kategori" style="margin-top: 20px;">ALT UYGULAMALAR</div>
        <div class="alt-uygulama-kapsayici">
          <div class="uygulama-baslik">📚 Etüt Takip Sistemi</div>
          <RouterLink to="/talebeler" class="nav-link alt-link">1. Talebe Listesi</RouterLink>
          <RouterLink to="/yoklama" class="nav-link alt-link">2. Etüt Yoklama</RouterLink>
          <RouterLink to="/kitap" class="nav-link alt-link">3. Kitap Takibi</RouterLink>
          <RouterLink to="/onerilen-kitaplar" class="nav-link alt-link">Onerilen Kitaplar</RouterLink>
          <RouterLink to="/performans" class="nav-link alt-link">4. Performans</RouterLink>
          <RouterLink to="/mufredat" class="nav-link alt-link">5. Müfredat Takibi</RouterLink>
          <RouterLink to="/yazili" class="nav-link alt-link">6. Y.Ö.Y Neticeleri</RouterLink>
          <RouterLink to="/okul-yazili" class="nav-link alt-link">7. Okul Yazılıları</RouterLink>
          <RouterLink to="/sinav" class="nav-link alt-link">8. KDU ve Deneme</RouterLink>
          <RouterLink to="/test-takip" class="nav-link alt-link">9. Test Takibi</RouterLink>
          <RouterLink to="/denetim" class="nav-link alt-link">10. Denetim Raporları</RouterLink>
        </div>
      </nav>

      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>

  <div v-else>
    <RouterView />
  </div>
</template>

<style scoped>
.app-container { display: flex; flex-direction: column; height: 100vh; background-color: #f1f5f9; }
.topbar { background: #0f172a; color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; }
.logo { font-size: 1.4rem; font-weight: bold; letter-spacing: 0.5px; }
.kullanici-alani { display: flex; align-items: center; gap: 20px; }
.kullanici-bilgi { display: flex; flex-direction: column; text-align: right; }
.isim { font-weight: bold; font-size: 1rem; color: #f8fafc; }
.rol { font-size: 0.8rem; color: #38bdf8; background: #1e293b; padding: 3px 8px; border-radius: 4px; margin-top: 3px; display: inline-block; border: 1px solid #334155; }
.btn-cikis { background: #ef4444; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
.btn-cikis:hover { background: #dc2626; }

.menu-btn { display: flex; align-items: center; gap: 10px;padding: 12px 20px;text-decoration: none; color: #475569;  font-weight: bold;  border-radius: 8px;  transition: all 0.3s ease;  margin-bottom: 5px;}
.menu-btn:hover { background-color: #f1f5f9;  color: #0f172a;}

/* YÖNETİCİ BUTONUNA ÖZEL VURGULU TASARIM */
.ozel-yetki-btn { background-color: #1e293b;  color: #f8fafc !important; border-left: 4px solid #3b82f6;  margin-top: 15px; /* Diğer menülerden biraz ayırmak için */}
.ozel-yetki-btn:hover { background-color: #334155; box-shadow: 0 4px 6px rgba(0,0,0,0.1);}

.main-layout { display: flex; flex: 1; overflow: hidden; }
.sidebar { width: 260px; background-color: #ffffff; padding: 20px 10px; border-right: 1px solid #e2e8f0; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
.menu-kategori { font-size: 0.8rem; font-weight: bold; color: #94a3b8; margin-left: 10px; letter-spacing: 1px; }
.nav-link { display: block; padding: 10px 15px; color: #475569; text-decoration: none; border-radius: 8px; font-weight: bold; transition: all 0.2s ease; margin-bottom: 2px; }
.nav-link:hover { background-color: #f1f5f9; color: #0f172a; padding-left: 18px; }
.router-link-active { background-color: #e0e7ff; color: #4f46e5; border-left: 4px solid #4f46e5; }

.alt-uygulama-kapsayici { border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px; background: #f8fafc; }
.uygulama-baslik { font-size: 0.9rem; font-weight: bold; color: #1e293b; padding: 10px; border-bottom: 1px solid #e2e8f0; margin-bottom: 5px; text-align: center; }
.alt-link { font-size: 0.9rem; padding: 8px 10px; }

.content { flex: 1; padding: 20px; overflow-y: auto; }
</style>