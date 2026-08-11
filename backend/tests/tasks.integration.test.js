import { describe, it, expect } from 'vitest';
const request = require('supertest');
const app = require('../app.js'); // Sadece uygulamayı çağırıyoruz, dinlemeyi (listen) değil

describe('POST /api/tasks/assign-smart - Entegrasyon Testleri', () => {
  
  it('Kullanıcı giriş yapmamışsa (Token yoksa) 401 Unauthorized dönmelidir', async () => {
    // Supertest ile sanki bir frontend'den istek atıyormuş gibi davranıyoruz
    const res = await request(app)
      .post('/api/tasks/assign-smart')
      .send({ title: 'Yetkisiz Test Görevi' });
    
    // Sistem 401 hatası vermeli
    expect(res.status).toBe(401);
  });

});