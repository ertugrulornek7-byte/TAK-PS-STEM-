import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

// 1. Merkezi Axios Örneği (Instance) Oluşturuluyor
const api = axios.create({
  // İleride bu kısmı .env dosyasından alacağız (import.meta.env.VITE_API_URL)
  baseURL: 'http://localhost:3000/api', 
  headers: {
    'Content-Type': 'application/json'
  }
});

// 2. REQUEST (İSTEK) INTERCEPTOR: Sunucuya gitmeden ÖNCE çalışır
api.interceptors.request.use((config) => {
  const authStore = useAuthStore();
  
  // Eğer kullanıcının cebinde bilet (Token) varsa, bunu başlığa ekle
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

// 3. RESPONSE (CEVAP) INTERCEPTOR: Sunucudan cevap dönerken çalışır
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  // Eğer sunucu 401 (Yetkisiz/Token Süresi Dolmuş) hatası verirse
  if (error.response && error.response.status === 401) {
    const authStore = useAuthStore();
    
    // Kullanıcının yetkisi bitmiş, onu sistemden atıp giriş sayfasına yönlendiriyoruz
    authStore.logout(); // authStore'daki çıkış yapma fonksiyonun adının logout olduğunu varsayıyoruz
    window.location.href = '/login';
  }
  
  return Promise.reject(error);
});

export default api;