import { describe, it, expect, vi } from 'vitest'

// Pinia authStore'u sahte (mock) olarak oluşturuyoruz
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    token: 'sahte-token',
    user: { roleLevel: 'PERSONEL' } // Sadece standart personel yetkisi veriyoruz
  }))
}))

import router from './index'

describe('Vue Router - Güvenlik Duvarı (Route Guard)', () => {
  it('PERSONEL rolündeki biri /admin sayfasına girmeye çalışırsa engellenmelidir', async () => {
    // 🔥 DÜZELTME BURADA: happy-dom'da alert olmadığı için sahte bir tane oluşturuyoruz
    window.alert = vi.fn()

    // /admin rotasına gitmeye çalış
    await router.push('/admin')

    // Sistem yetkisi olmadığı için onu zorla ana sayfaya ('/') atmalı
    expect(router.currentRoute.value.path).toBe('/')
  })
})