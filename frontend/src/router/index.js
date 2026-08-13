import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/authStore' // 🔥 Pinia Yetki Deposu (Token ve Rolleri buradan alacağız)

// Sayfa İçe Aktarımları (Senin mevcut rotaların)
import Sayfa1Talebeler from '../views/Sayfa1Talebeler.vue'
import Sayfa2Yoklama from '../views/Sayfa2Yoklama.vue'
import Sayfa3Kitap from '../views/Sayfa3Kitap.vue' 
import Sayfa3_1Onerilen from '../views/Sayfa3_1Onerilen.vue' 
import Sayfa4Performans from '../views/Sayfa4Performans.vue'
import Sayfa5Mufredat from '../views/Sayfa5Mufredat.vue'
import Sayfa6Yazili from '../views/Sayfa6Yazili.vue'
import Sayfa7OkulYazili from '../views/Sayfa7OkulYazili.vue'
import Sayfa8Sinav from '../views/Sayfa8Sinav.vue'
import Sayfa9TestTakip from '../views/Sayfa9TestTakip.vue'
import Sayfa10Denetim from '../views/Sayfa10Denetim.vue'
import Sayfa11Karne from '../views/Sayfa11Karne.vue'
import Login from '../views/Login.vue'
import Sayfa0Dashboard from '../views/Sayfa0Dashboard.vue'
import SayfaGorevler from '../views/SayfaGorevler.vue'
import Sayfa12Yetki from '../views/Sayfa12Yetki.vue'
import AdminPanel from '../views/AdminPanel.vue'
import SayfaKullanimAnalizi from '../views/SayfaKullanimAnalizi.vue'

// ==========================================
// ROTA TANIMLAMALARI VE YETKİ (META) ETİKETLERİ
// ==========================================
const routes = [
  // HERKESİN (Giriş Yapan) GÖREBİLECEĞİ SAYFALAR
  { path: '/', name: 'dashboard', component: Sayfa0Dashboard, meta: { requiresAuth: true } },
  { path: '/talebeler', name: 'talebeler', component: Sayfa1Talebeler, meta: { requiresAuth: true } },
  { path: '/yoklama', name: 'yoklama', component: Sayfa2Yoklama, meta: { requiresAuth: true } },
  { path: '/kitap', name: 'kitap', component: Sayfa3Kitap, meta: { requiresAuth: true } },
  { path: '/onerilen-kitaplar', name: 'önerilen kitaplar', component: Sayfa3_1Onerilen, meta: { requiresAuth: true } },
  { path: '/performans', name: 'performans', component: Sayfa4Performans, meta: { requiresAuth: true } },
  { path: '/mufredat', name: 'mufredat', component: Sayfa5Mufredat, meta: { requiresAuth: true } },
  { path: '/yazili', name: 'yazili', component: Sayfa6Yazili, meta: { requiresAuth: true } },
  { path: '/okul-yazili', name: 'okul-yazili', component: Sayfa7OkulYazili, meta: { requiresAuth: true } },
  { path: '/sinav', name: 'sinav', component: Sayfa8Sinav, meta: { requiresAuth: true } },
  { path: '/test-takip', name: 'test-takip', component: Sayfa9TestTakip, meta: { requiresAuth: true } },
  { path: '/denetim', name: 'denetim', component: Sayfa10Denetim, meta: { requiresAuth: true } },
  { path: '/karne/:studentId', name: 'karne', component: Sayfa11Karne, meta: { requiresAuth: true } },
  { path: '/gorevler', name: 'gorevler', component: SayfaGorevler, meta: { requiresAuth: true } },
  { path: '/analiz', name: 'Analiz', component: SayfaKullanimAnalizi, meta: { requiresAuth: true, roles: ['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM'] } },
  
  // SADECE GİRİŞ YAPMAMIŞ (MİSAFİR) KULLANICILAR İÇİN
  { path: '/login', name: 'login', component: Login, meta: { requiresGuest: true } },
  
  // ÖZEL YETKİ GEREKTİREN SAYFALAR (Rol Bazlı Koruma)
  {    path: '/admin',  name: 'AdminPanel',  component: AdminPanel,  meta: { requiresAuth: true, roles: ['SISTEM', 'BOLGE', 'MINTIKA'] }  },
  {   path: '/yetki',  name: 'YetkiYonetimi',  component: Sayfa12Yetki,  meta: { requiresAuth: true, roles: ['SISTEM', 'KURUM'] }  },
  {  path: '/toplu-ogrenci-ekle',  name: 'TopluOgrenciEkle', component: () => import('../views/TopluOgrenciEkle.vue'),  meta: { requiresAuth: true, roles: ['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM'] } },

  // BİLİNMEYEN URL YÖNLENDİRMESİ
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// 🛡️ FRONTEND GÜVENLİK DUVARI (GELİŞMİŞ ROUTE GUARD - YENİ YAPI)
router.beforeEach((to, from) => {
  const authStore = useAuthStore()
  const isAuthenticated = !!authStore.token
  const userRole = authStore.user?.roleLevel

  if (to.meta.requiresAuth && !isAuthenticated) {
    return '/login'
  }
  if (to.meta.requiresGuest && isAuthenticated) {
    return '/'
  }
  if (to.meta.roles && to.meta.roles.length > 0) {
    if (!to.meta.roles.includes(userRole)) {
      alert('Bu sayfayı görüntüleme yetkiniz bulunmamaktadır.')
      return '/' 
    }
  }
})

export default router