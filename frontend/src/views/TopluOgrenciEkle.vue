<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/axios' 
import * as XLSX from 'xlsx'

const router = useRouter()
const islemDurumu = ref('')
const excelSonuclar = ref(null)

// 1. Şablon İndirme Fonksiyonu (YENİ SÜTUNLARA GÖRE GÜNCELLENDİ)
const sablonIndir = () => {
  const sablonVeri = [
    { "Talebe Kodu": "1001", "Kurum Kodu": "102", "Kimlik No": "12345678901", "Bölge": "MARMARA", "Mıntıka": "GEBZE", "Kurum": "ŞEKERPINAR", "Adı": "Ali", "Soyadı": "Yılmaz", "Talebe Türü": "Örgün", "Nevi": "Gündüzlü", "Okul Seviyesi": "8. Sınıf" },
    { "Talebe Kodu": "1002", "Kurum Kodu": "103", "Kimlik No": "10987654321", "Bölge": "MARMARA", "Mıntıka": "GEBZE", "Kurum": "ÇAYIROVA", "Adı": "Veli", "Soyadı": "Demir", "Talebe Türü": "Açık", "Nevi": "Yatılı", "Okul Seviyesi": "Lise 1" },
    { "Talebe Kodu": "1003", "Kurum Kodu": "205", "Kimlik No": "99999999999", "Bölge": "İÇ ANADOLU", "Mıntıka": "SAKARYA", "Kurum": "ADAPAZARI", "Adı": "Ahmet", "Soyadı": "Çelik", "Talebe Türü": "Örgün", "Nevi": "Gündüzlü", "Okul Seviyesi": "4 Nehari" }
  ]
  
  const ws = XLSX.utils.json_to_sheet(sablonVeri)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Talebe_Sablonu")
  XLSX.writeFile(wb, "Toplu_Talebe_Yukleme_Sablonu.xlsx")
}

// 🔥 AKILLI SINIF ÇÖZÜMLEYİCİ (Fuzzy Matching) - Korundu ve Güçlendirildi!
const sinifIdCozumle = (gelenSinif) => {
  if (!gelenSinif) return null;
  
  let s = String(gelenSinif).toLowerCase().replace(/[\s._-]/g, '');
  
  if (s.includes('4') && s.includes('nehari')) return '4_NEHARI';
  if (s.includes('5') || s === '5') return '5_SINIF';
  if (s.includes('6') || s === '6') return '6_SINIF';
  if (s.includes('7') || s === '7') return '7_SINIF';
  
  if ((s.includes('8') || s === '8') && !s.includes('nehari')) return '8_SINIF';
  if (s.includes('8') && s.includes('nehari')) return '8_NEHARI';
  
  if (s.includes('lise1') || s === 'l1' || s.includes('9')) return 'LISE_1';
  if (s.includes('lise2') || s === 'l2' || s.includes('10')) return 'LISE_2';
  if (s.includes('lise3') || s === 'l3' || s.includes('11')) return 'LISE_3';

  return null; 
}

// 2. Excel Yükleme ve Backend'e Gönderme
const excelYukle = (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  islemDurumu.value = 'Dosya okunuyor, veriler temizleniyor...'
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const rawJsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
      
      // 🔥 VERİ YIKAMA: Excel'den gelen sütunları (Büyük/Küçük harf toleranslı) Backend'e hazırla
      const temizlenmisData = rawJsonData.map(row => {
        // Kullanıcı başlıkları büyük veya küçük harfle yazmış olabilir, garantiliyoruz:
        const tKodu = row['Talebe Kodu'] || row['TALEBE KODU'] || '';
        const kKodu = row['Kurum Kodu'] || row['KURUM KODU'] || '';
        const adi = row['Adı'] || row['ADI'] || '';
        const soyadi = row['Soyadı'] || row['SOYADI'] || '';
        const bolge = row['Bölge'] || row['BÖLGE'] || '';
        const mintika = row['Mıntıka'] || row['MINTIKA'] || '';
        const kurum = row['Kurum'] || row['KURUM'] || '';
        const seviye = row['Okul Seviyesi'] || row['OKUL SEVİYESİ'] || row['SINIF'] || '';

        return {
          studentCode: String(tKodu).trim(),
          kurumKodu: String(kKodu).trim(),
          kimlikNo: String(row['Kimlik No'] || row['KİMLİK NO'] || '').trim(),
          bolge: String(bolge).trim(),
          mintika: String(mintika).trim(),
          kurum: String(kurum).trim(),
          firstName: String(adi).trim(),
          lastName: String(soyadi).trim(),
          talebeTuru: String(row['Talebe Türü'] || row['TALEBE TÜRÜ'] || '').trim(),
          nevi: String(row['Nevi'] || row['NEVİ'] || '').trim(),
          classId: sinifIdCozumle(seviye), // Akıllı çözümleyici "Okul Seviyesi"ne bakıyor
        }
      }).filter(row => row.studentCode && row.firstName); // Kodu veya adı boş olan satırları çöpe at
      
      if (temizlenmisData.length === 0) {
         islemDurumu.value = 'Hata: Excel dosyasında geçerli bir TALEBE KODU ve ADI bulunamadı.'
         return;
      }

      islemDurumu.value = 'Hiyerarşi kontrol ediliyor ve veriler sunucuya gönderiliyor...'
      
      // 🔥 VERİYİ BACKEND'E YOLLA
      const res = await api.post('/students/bulk', { studentsData: temizlenmisData })
      
      excelSonuclar.value = res.data
      islemDurumu.value = `🎉 Başarılı! ${res.data.eklenenCount} talebe işlendi. (Olmayan kurumlar otomatik oluşturuldu).`
      event.target.value = '' // Input'u temizle
    } catch (err) { 
      islemDurumu.value = 'Sunucuya gönderim sırasında hata oluştu. Lütfen konsolu kontrol edin.'
      console.error(err)
    }
  }
  reader.readAsArrayBuffer(file)
}
</script>

<template>
  <div class="sayfa-container">
    <div class="header-row">
      <h2>📊 Excel ile Toplu Talebe Aktarımı</h2>
      <button class="btn-geri" @click="router.push('/')">Geri Dön</button>
    </div>

    <div class="form-kart">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h4 style="margin: 0; color: #1e293b;">1. Adım: Şablonu İndirin ve Doldurun</h4>
        <button class="btn-yesil" @click="sablonIndir">📥 Şablon İndir</button>
      </div>
      
      <p style="font-size: 0.95rem; color: #64748b; margin-bottom: 20px;">
        İndirdiğiniz Excel dosyasındaki sütun başlıklarını değiştirmeden ilgili alanları doldurun. <br>
        <strong>Zorunlu Alanlar:</strong> Talebe Kodu, Bölge, Mıntıka, Kurum, Adı, Soyadı.<br>
        <small><em>Not: Okul Seviyesi alanı esnektir; '6', '6.sınıf', 'L1' yazsanız da sistem otomatik algılar. Ayrıca sistemde kayıtlı olmayan yeni bir Kurum girerseniz otomatik olarak Hiyerarşiye eklenecektir.</em></small>
      </p>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;">

      <h4 style="margin: 0 0 15px 0; color: #1e293b;">2. Adım: Doldurulan Dosyayı Yükleyin</h4>
      <input type="file" @change="excelYukle" class="input-kutu" accept=".xlsx, .xls" />
      
      <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('Hata') || islemDurumu.includes('hata')}">
        {{ islemDurumu }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; max-width: 800px; margin: 0 auto; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
.header-row h2 { margin: 0; color: #0f172a; }
.form-kart { background: white; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
.input-kutu { width: 100%; padding: 12px; border: 2px dashed #cbd5e1; border-radius: 6px; box-sizing: border-box; cursor: pointer; background: #f8fafc; }
.btn-yesil { padding: 10px 20px; background-color: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
.btn-yesil:hover { background-color: #059669; }
.btn-geri { padding: 10px 20px; background-color: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
.btn-geri:hover { background-color: #475569; }
.toast { margin-top: 20px; padding: 15px; border-radius: 6px; background-color: #dcfce7; color: #166534; font-weight: bold; text-align: center; border: 1px solid #bbf7d0; }
.toast.hata { background-color: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
</style>