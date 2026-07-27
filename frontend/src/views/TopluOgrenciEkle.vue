<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import * as XLSX from 'xlsx'

const router = useRouter()
const islemDurumu = ref('')
const excelSonuclar = ref(null)

// 1. Şablon İndirme Fonksiyonu
const sablonIndir = () => {
  const sablonVeri = [
    { "MINTIKA": "GEBZE", "KURUM": "ŞEKERPINAR", "SINIF": "9. Sınıf", "TALEBE KODU": "1001", "AD SOYAD": "Ali Yılmaz" },
    { "MINTIKA": "GEBZE", "KURUM": "ÇAYIROVA", "SINIF": "10. Sınıf", "TALEBE KODU": "1002", "AD SOYAD": "Veli Demir" },
    { "MINTIKA": "SAKARYA", "KURUM": "ADAPAZARI", "SINIF": "", "TALEBE KODU": "1003", "AD SOYAD": "Ahmet Çelik" }
  ]
  
  const ws = XLSX.utils.json_to_sheet(sablonVeri)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Talebe_Sablonu")
  XLSX.writeFile(wb, "Toplu_Talebe_Yukleme_Sablonu.xlsx")
}

// 2. Excel Yükleme ve Backend'e Gönderme
const excelYukle = (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  islemDurumu.value = 'Dosya okunuyor, lütfen bekleyin...'
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
      
      islemDurumu.value = 'Veriler sunucuya gönderiliyor...'
      
      const res = await axios.post('http://localhost:3000/api/students/bulk', { studentsData: jsonData })
      
      excelSonuclar.value = res.data
      islemDurumu.value = `Başarılı! ${res.data.eklenenCount} talebe sisteme eklendi.`
      event.target.value = '' // Input'u temizle
    } catch (err) { 
      islemDurumu.value = 'Yükleme sırasında hata oluştu. Lütfen sütun isimlerini kontrol edin.'
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
        <strong>Zorunlu Alanlar:</strong> MINTIKA, KURUM, TALEBE KODU, AD SOYAD. (Sınıf alanı boş bırakılırsa "Bilinmiyor" olarak atanır).
      </p>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;">

      <h4 style="margin: 0 0 15px 0; color: #1e293b;">2. Adım: Doldurulan Dosyayı Yükleyin</h4>
      <input type="file" @change="excelYukle" class="input-kutu" accept=".xlsx, .xls" />
      
      <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('hata')}">
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
.btn-yesil { padding: 10px 20px; background-color: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-geri { padding: 10px 20px; background-color: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
.toast { margin-top: 20px; padding: 15px; border-radius: 6px; background-color: #dcfce7; color: #166534; font-weight: bold; text-align: center; }
.toast.hata { background-color: #fee2e2; color: #b91c1c; }
</style>