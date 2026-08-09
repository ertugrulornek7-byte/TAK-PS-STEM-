import { defineStore } from 'pinia';
import api from '../api/axios'; // Yeni kurumsal API İstemcimiz!
import router from '../router'; // Başarılı girişte yönlendirme yapmak için

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user')) || null,
    token: localStorage.getItem('token') || null,
    error: null,
    isLoading: false
  }),
  
  getters: {
    isAuthenticated: (state) => !!state.token,
    isAdmin: (state) => state.user?.roleLevel === 'SISTEM' || state.user?.roles?.includes('ADMIN')
  },

  actions: {
    async login(username, password) {
      this.isLoading = true;
      this.error = null;
      
      try {
        // HATA DÜZELTİLDİ: Artık localhost:3000 yazmıyoruz, merkezi api'yi kullanıyoruz
        const res = await api.post('/auth/login', { username, password });
        
        this.user = res.data.user;
        this.token = res.data.token;
        
        // Biletleri tarayıcının hafızasına (Local Storage) güvenle kaydediyoruz
        localStorage.setItem('user', JSON.stringify(this.user));
        localStorage.setItem('token', this.token);
        
        // Giriş başarılı olunca Dashboard'a (veya Ana Sayfaya) yönlendiriyoruz
        router.push('/');
        return true;
      } catch (err) {
        console.error("Giriş Hatası Detayı:", err);
        // Backend'den gelen asıl hata mesajını (Örn: Şifre hatalı) ekrana basıyoruz
        this.error = err.response?.data?.error || 'Sunucuya bağlanılamadı veya şifre hatalı!';
        return false;
      } finally {
        this.isLoading = false;
      }
    },

    logout() {
      this.user = null;
      this.token = null;
      this.error = null;
      
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      
      // Çıkış yapınca login sayfasına atıyoruz
      router.push('/login');
    }
  }
});