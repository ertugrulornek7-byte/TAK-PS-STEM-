import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import router from '../router'

export const useAuthStore = defineStore('auth', () => {
  // Sayfa yenilense bile bilgileri yerel hafızadan (localStorage) al
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user')) || null)

  // Sisteme giriş yapıldığında bilgileri kaydet
  const login = (newToken, userData) => {
    token.value = newToken
    user.value = userData
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(userData))
    
    // Bundan sonraki tüm API isteklerine bu güvenlik kartını (Token) otomatik ekle
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
  }

  // Çıkış yapıldığında her şeyi sil ve login ekranına at
  const logout = () => {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete axios.defaults.headers.common['Authorization']
    router.push('/login')
  }

  return { token, user, login, logout }
})