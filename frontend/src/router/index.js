import { createRouter, createWebHistory } from 'vue-router'
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

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {path: '/',name: 'dashboard', component: Sayfa0Dashboard},
    { path: '/talebeler', name: 'talebeler', component: Sayfa1Talebeler },
    { path: '/yoklama', name: 'yoklama', component: Sayfa2Yoklama },
    { path: '/kitap', name: 'kitap', component: Sayfa3Kitap },
    {path: '/onerilen-kitaplar' ,  name: 'önerilen kitaplar', component: Sayfa3_1Onerilen },
    { path: '/performans', name: 'performans', component: Sayfa4Performans },
    { path: '/mufredat', name: 'mufredat', component: Sayfa5Mufredat },
    { path: '/yazili', name: 'yazili', component: Sayfa6Yazili },
    { path: '/okul-yazili', name: 'okul-yazili', component: Sayfa7OkulYazili },
    { path: '/sinav', name: 'sinav', component: Sayfa8Sinav },
    { path: '/test-takip', name: 'test-takip', component: Sayfa9TestTakip },
    { path: '/denetim', name: 'denetim', component: Sayfa10Denetim },
    { path: '/karne/:studentId', name: 'karne', component: Sayfa11Karne },
    { path: '/login', name: 'login', component: Login },
    { path: '/gorevler', name: 'gorevler', component: SayfaGorevler },
    { path: '/yetki', name: 'YetkiYonetimi', component: Sayfa12Yetki },
    { path: '/toplu-ogrenci-ekle',name: 'TopluOgrenciEkle', component: () => import('../views/TopluOgrenciEkle.vue')},
    {path: '/admin', name: 'AdminPanel',component: AdminPanel},
  ]
})

// GÜVENLİK DUVARI: Şifresiz girişleri engelle (YENİ VE HATASIZ HALİ)
router.beforeEach((to, from) => {
  const publicPages = ['/login', '/register']
  const authRequired = !publicPages.includes(to.path)
  const loggedIn = localStorage.getItem('token')

  // Eğer sayfa şifre istiyorsa ve kullanıcı giriş yapmadıysa Login'e at!
  if (authRequired && !loggedIn) {
    return '/login' // next() yerine direkt return kullanıyoruz
  }
  return true // Sorun yoksa sayfanın açılmasına izin ver
})
export default router