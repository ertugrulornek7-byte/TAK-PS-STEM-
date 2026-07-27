<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/authStore'
import axios from 'axios'
import * as XLSX from 'xlsx'

const authStore = useAuthStore()
const aktifSekme = ref('sema')
const organizasyon = ref([])
const personeller = ref([])
const islemDurumu = ref('')

// YETKİ KONTROLLERİ
const userRoles = computed(() => authStore.user?.roles || [])
const isAdmin = computed(() => userRoles.value.includes('ADMIN'))
const isBolgeEM = computed(() => userRoles.value.includes('BOLGE_EM'))
const isMintikaEM = computed(() => userRoles.value.includes('MINTIKA_EM'))

// Form Modelleri (Birimler İçin)
const yeniBolgeAd = ref('')
const yeniMintika = ref({ name: '', regionId: '' })
const yeniKurum = ref({ name: '', districtId: '' })

// Personel Yönetimi Modelleri
const yeniPersonel = ref({ fullName: '', username: '', email: '', institutionId: '' })
const olusturulanSifre = ref('')
const excelSonuclar = ref([])
const seciliPersonel = ref(null)

// Verileri Backend'den Çek
const verileriCek = async () => {
  const uId = authStore.user?.id
  if (!uId) return
  try {
    const [orgRes, userRes] = await Promise.all([
      axios.get(`http://localhost:3000/api/admin/organization?userId=${uId}`),
      axios.get(`http://localhost:3000/api/admin/users?userId=${uId}`)
    ])
    organizasyon.value = orgRes.data
    personeller.value = userRes.data
  } catch (error) { console.error("Veriler çekilemedi.") }
}

onMounted(() => { verileriCek() })

// ==========================================
// 1. BİRİM YÖNETİMİ
// ==========================================
const bolgeEkle = async () => {
  if (!yeniBolgeAd.value) return
  await axios.post('http://localhost:3000/api/admin/region', { name: yeniBolgeAd.value })
  yeniBolgeAd.value = ''; verileriCek()
}

const mintikaEkle = async () => {
  if (!yeniMintika.value.name || !yeniMintika.value.regionId) return
  await axios.post('http://localhost:3000/api/admin/district', yeniMintika.value)
  yeniMintika.value = { name: '', regionId: '' }; verileriCek()
}

const kurumEkle = async () => {
  if (!yeniKurum.value.name || !yeniKurum.value.districtId) return
  await axios.post('http://localhost:3000/api/admin/institution', yeniKurum.value)
  yeniKurum.value = { name: '', districtId: '' }; verileriCek()
}

const birimSil = async (type, id) => {
  if (!confirm('Bu birimi silmek istediğinize emin misiniz?')) return
  try {
    await axios.delete(`http://localhost:3000/api/admin/unit/${type}/${id}`)
    verileriCek()
  } catch (err) { alert('Silinemedi! Lütfen önce içindeki personelleri veya alt kurumları temizleyin.') }
}

const tumMintikalar = () => {
  let list = []
  organizasyon.value.forEach(r => { list = list.concat(r.districts) })
  return list
}

// ==========================================
// 2. KURUMSAL PERSONEL YÖNETİMİ
// ==========================================

const tekliPersonelEkle = async () => {
  if(!yeniPersonel.value.fullName || !yeniPersonel.value.username) return alert('Ad Soyad ve Kullanıcı Adı zorunludur!')
  try {
    const res = await axios.post('http://localhost:3000/api/admin/create-user', yeniPersonel.value)
    olusturulanSifre.value = res.data.rawPassword
    yeniPersonel.value = { fullName: '', username: '', email: '', institutionId: '' }
    verileriCek()
  } catch (err) { alert(err.response?.data?.error || 'Kayıt sırasında hata oluştu!') }
}

const sablonIndir = () => {
  const sablonVeri = [
    { "AD-SOYAD": "Ali Yılmaz", "E-POSTA": "ali@mail.com", "ROL/YETKİ": "STANDART", "MINTIKA": "GEBZE", "KURUM": "ŞEKERPINAR", "ŞİFRE": "1234" },
    { "AD-SOYAD": "Veli Demir", "E-POSTA": "", "ROL/YETKİ": "KURUM", "MINTIKA": "GEBZE", "KURUM": "ÇAYIROVA", "ŞİFRE": "" },
    { "AD-SOYAD": "Ahmet Çelik", "E-POSTA": "", "ROL/YETKİ": "MINTIKA", "MINTIKA": "GEBZE", "KURUM": "", "ŞİFRE": "9876" }
  ];
  
  const ws = XLSX.utils.json_to_sheet(sablonVeri);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Personel_Yukleme_Sablonu");
  XLSX.writeFile(wb, "Personel_Sablonu.xlsx");
}

const excelYukle = (event) => {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
      
      const res = await axios.post('http://localhost:3000/api/admin/bulk-create-users', { users: jsonData })
      excelSonuclar.value = res.data.eklenenler
      verileriCek()
      alert('Toplu yükleme tamamlandı!')
    } catch (err) { 
      alert(err.response?.data?.error || 'Excel yükleme hatası! Lütfen dosya formatını kontrol edin.') 
    }
  }
  reader.readAsArrayBuffer(file)
}

const filtrelenmisKurumlar = computed(() => {
  if (!seciliPersonel.value || !seciliPersonel.value.districtId) return []
  const seciliMintika = tumMintikalar().find(m => m.id === seciliPersonel.value.districtId)
  return seciliMintika ? seciliMintika.institutions : []
})

const duzenleModalAc = (personel) => {
  seciliPersonel.value = { 
    id: personel.id, 
    fullName: personel.fullName, 
    email: personel.email, 
    role: personel.roles[0], 
    districtId: personel.districtId || '',     
    institutionId: personel.institutionId || '', 
    newPassword: '' 
  }
}

const personelGuncelle = async () => {
  try {
    await axios.put(`http://localhost:3000/api/admin/update-user/${seciliPersonel.value.id}`, {
      ...seciliPersonel.value,
      password: seciliPersonel.value.newPassword
    })
    seciliPersonel.value = null 
    verileriCek()
  } catch (err) { alert('Güncelleme başarısız oldu.') }
}
// Personeli Komple Silme
const personelSil = async (id) => {
  if (!confirm('⚠️ DİKKAT: Bu personeli tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) return
  try {
    await axios.delete(`http://localhost:3000/api/admin/user/${id}`)
    seciliPersonel.value = null // Modalı kapat
    verileriCek() // Tabloyu yenile
    alert('Personel sistemden başarıyla silindi.')
  } catch (err) { 
    alert('Silme işlemi başarısız oldu. Personelin üzerinde aktif görevler olabilir.') 
  }
}
</script>

<template>
  <div class="admin-container">
    <div class="admin-header">
      <span class="ikon">🏛️</span>
      <div>
        <h2>Sistem Yönetim Merkezi (ERP)</h2>
        <p v-if="isAdmin">Sistem Yöneticisi: Tüm teşkilata ve personel atamalarına tam erişim.</p>
        <p v-else-if="isBolgeEM">Bölge Mesulü: Bölgenizdeki kurum ve personellere erişim.</p>
        <p v-else-if="isMintikaEM">Mıntıka Mesulü: Mıntıkanızdaki personel listesine erişim.</p>
      </div>
    </div>

    <div class="sekmeler">
      <button :class="{'aktif': aktifSekme === 'sema'}" @click="aktifSekme = 'sema'">🌳 Organizasyon Şeması</button>
      <button v-if="isAdmin || isBolgeEM" :class="{'aktif': aktifSekme === 'birim'}" @click="aktifSekme = 'birim'">🏢 Birim Yönetimi</button>
      <button :class="{'aktif': aktifSekme === 'personel'}" @click="aktifSekme = 'personel'">👨‍💼 Personel ve İK Yönetimi</button>
    </div>

    <!-- 1. ORGANİZASYON ŞEMASI -->
    <div v-if="aktifSekme === 'sema'" class="panel-icerik">
      <h3>Genel Hiyerarşi Tablosu</h3>
      <div v-for="bolge in organizasyon" :key="bolge.id" class="kutu bolge-kutu">
        <div class="baslik">
          <strong>🌍 BÖLGE: {{ bolge.name }}</strong>
          <span class="mesul">Mesul: {{ bolge.manager?.fullName || 'Atanmadı' }}</span>
        </div>
        <div v-for="mintika in bolge.districts" :key="mintika.id" class="kutu mintika-kutu">
          <div class="baslik">
            <strong>📍 MINTIKA: {{ mintika.name }}</strong>
            <span class="mesul">Mesul: {{ mintika.manager?.fullName || 'Atanmadı' }}</span>
          </div>
          <div class="kurum-grid">
            <div v-for="kurum in mintika.institutions" :key="kurum.id" class="kutu kurum-kutu">
              <strong>🏫 {{ kurum.name }}</strong>
              <div class="mesul">EM: {{ kurum.manager?.fullName || 'Yok' }}</div>
              <div class="personel-listesi">
                <span v-for="p in kurum.users" :key="p.id" class="badge">{{ p.fullName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. BİRİM YÖNETİMİ -->
    <div v-if="aktifSekme === 'birim' && (isAdmin || isBolgeEM)" class="panel-icerik grid-3">
      <div class="form-kart" v-if="isAdmin">
        <h4>🌍 Yeni Bölge Oluştur</h4>
        <input type="text" v-model="yeniBolgeAd" class="input-kutu" placeholder="Bölge Adı (Örn: Marmara)" />
        <button class="btn-mavi" @click="bolgeEkle">Bölge Ekle</button>
        <hr>
        <div v-for="b in organizasyon" :key="b.id" class="liste-item">
          {{ b.name }} <button class="btn-sil" @click="birimSil('region', b.id)">Sil</button>
        </div>
      </div>
      <div class="form-kart">
        <h4>📍 Yeni Mıntıka Oluştur</h4>
        <select v-model="yeniMintika.regionId" class="input-kutu">
          <option value="" disabled>Bağlı Olduğu Bölgeyi Seçin</option>
          <option v-for="b in organizasyon" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <input type="text" v-model="yeniMintika.name" class="input-kutu" placeholder="Mıntıka Adı (Örn: Sakarya)" />
        <button class="btn-yesil" @click="mintikaEkle">Mıntıka Ekle</button>
        <hr>
        <div v-for="m in tumMintikalar()" :key="m.id" class="liste-item">
          {{ m.name }} <button class="btn-sil" @click="birimSil('district', m.id)">Sil</button>
        </div>
      </div>
      <div class="form-kart">
        <h4>🏫 Yeni Kurum Oluştur</h4>
        <select v-model="yeniKurum.districtId" class="input-kutu">
          <option value="" disabled>Bağlı Olduğu Mıntıkası Seçin</option>
          <option v-for="m in tumMintikalar()" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <input type="text" v-model="yeniKurum.name" class="input-kutu" placeholder="Kurum Adı" />
        <button class="btn-mor" @click="kurumEkle">Kurum Ekle</button>
      </div>
    </div>

    <!-- 3. PERSONEL YÖNETİMİ -->
    <div v-if="aktifSekme === 'personel'" class="panel-icerik">
      <div class="grid-2">
        <!-- MANUEL TEKLİ EKLEME -->
        <div class="form-kart">
          <h4>👤 Yeni Personel Ekle (Tekli)</h4>
          <input type="text" v-model="yeniPersonel.fullName" class="input-kutu" placeholder="Ad Soyad (*)" />
          <input type="text" v-model="yeniPersonel.username" class="input-kutu" placeholder="Kullanıcı Adı (*)" />
          <input type="email" v-model="yeniPersonel.email" class="input-kutu" placeholder="E-Posta Adresi" />
          <select v-model="yeniPersonel.institutionId" class="input-kutu">
             <option value="">-- Doğrudan Kuruma Ata (Opsiyonel) --</option>
             <optgroup v-for="m in tumMintikalar()" :key="m.id" :label="m.name + ' Mıntıkası'">
                <option v-for="k in m.institutions" :key="k.id" :value="k.id">{{ k.name }}</option>
             </optgroup>
          </select>
          <button class="btn-mavi" @click="tekliPersonelEkle">Personeli Oluştur</button>
          
          <div v-if="olusturulanSifre" class="toast">
            Geçici Şifre: <strong>{{ olusturulanSifre }}</strong>
          </div>
        </div>

        <!-- EXCEL İLE TOPLU EKLEME -->
        <div class="form-kart">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0;">📊 Excel ile Toplu Yükleme</h4>
            <button class="btn-yesil" style="width: auto; padding: 6px 12px; font-size: 0.85rem;" @click="sablonIndir">
              📥 Şablon İndir
            </button>
          </div>
          
          <p style="font-size: 0.85rem; color: #64748b; margin-top:-5px; margin-bottom: 10px;">
            Sütun Başlıkları: <b>AD-SOYAD</b> | <b>E-POSTA</b> | <b>ROL/YETKİ</b> | <b>MINTIKA</b> | <b>KURUM</b> | <b>ŞİFRE</b>
          </p>
          <input type="file" @change="excelYukle" class="input-kutu" accept=".xlsx, .xls" />
          
          <div v-if="excelSonuclar.length > 0" class="sonuc-listesi">
            <strong>Yüklenenler ve Şifreleri:</strong>
            <div v-for="s in excelSonuclar" :key="s.username" class="liste-item">
              {{ s.fullName }} - K.Adı: {{ s.username }} - Şifre: <strong>{{ s.rawPassword }}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- PERSONEL LİSTESİ VE TRANSFER TABLOSU -->
      <h3 style="margin-top: 30px; padding-bottom:10px; border-bottom: 2px solid #e2e8f0;">🔄 Personel Listesi ve Transfer</h3>
      <div style="overflow-x: auto;">
        <table class="personel-tablosu">
          <thead>
            <tr>
              <th>Sicil No</th>
              <th>Ad Soyad</th>
              <th>Kullanıcı Adı</th>
              <th>Mevcut Kurum</th>
              <th>Rol / Yetki</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in personeller" :key="p.id">
              <td><strong>{{ p.personelId }}</strong></td>
              <td>{{ p.fullName }}</td>
              <td>{{ p.username }}</td>
              <td>{{ p.institution?.name || 'Atanmadı' }} ({{ p.district?.name || '-' }})</td>
              <td><span class="badge">{{ p.roles[0] }}</span></td>
              <td>
                <button class="btn-mor" style="padding: 6px 12px; width: auto;" @click="duzenleModalAc(p)">
                  Düzenle
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- DÜZENLEME VE TRANSFER MODALI (Popup) -->
    <div v-if="seciliPersonel" class="modal-arkaplan">
      <div class="modal-kutu">
        <h3 style="margin-top:0;">👤 Düzenle & Transfer Et</h3>
        <p style="color: #64748b; margin-bottom: 15px;">{{ seciliPersonel.fullName }}</p>
        
        <label class="modal-label">E-Posta:</label>
        <input type="email" v-model="seciliPersonel.email" class="input-kutu" />
        
        <label class="modal-label">Yeni Şifre (Değiştirmek istemiyorsanız boş bırakın):</label>
        <input type="text" v-model="seciliPersonel.newPassword" class="input-kutu" placeholder="Yeni şifre belirle..." />

        <label class="modal-label">Rol / Yetki Seçimi:</label>
        <select v-model="seciliPersonel.role" class="input-kutu">
          <option value="PERSONEL">Standart Personel (Öğretmen)</option>
          <option value="KURUM_EM">Kurum Eğitim Mesulü</option>
          <option v-if="isAdmin || isBolgeEM" value="MINTIKA_EM">Mıntıka Eğitim Mesulü</option>
          <option v-if="isAdmin" value="BOLGE_EM">Bölge Eğitim Mesulü</option>
          <option v-if="isAdmin" value="ADMIN">Sistem Yöneticisi</option>
        </select>

        <label class="modal-label">1. Transfer Edilecek Mıntıka:</label>
        <select v-model="seciliPersonel.districtId" class="input-kutu" @change="seciliPersonel.institutionId = ''">
          <option value="">-- Mıntıka Seçiniz --</option>
          <option v-for="m in tumMintikalar()" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>

        <label class="modal-label">2. Transfer Edilecek Kurum:</label>
        <select v-model="seciliPersonel.institutionId" class="input-kutu" :disabled="!seciliPersonel.districtId">
          <option value="">-- Kurumdan Çıkar (Boşa Al) --</option>
          <option v-for="k in filtrelenmisKurumlar" :key="k.id" :value="k.id">{{ k.name }}</option>
        </select>

        <div style="display:flex; gap:10px; margin-top: 20px;">
          <button class="btn-yesil" @click="personelGuncelle">Kaydet</button>
          <button class="btn-sil" style="width:100%; padding:10px; font-size:1rem;" @click="seciliPersonel = null">İptal</button>
        </div>
        <!-- Modal Alt Butonları -->
        <div style="display:flex; gap:10px; margin-top: 25px;">
          <button class="btn-sil" style="flex: 1; padding: 12px; font-size: 1rem; background-color: #ef4444;" @click="personelSil(seciliPersonel.id)">🗑️ Sil</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-container { padding: 20px; font-family: sans-serif; }
.admin-header { display: flex; align-items: center; gap: 20px; background: #0f172a; padding: 25px; border-radius: 12px; color: white; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.admin-header .ikon { font-size: 3rem; }
.admin-header h2 { margin: 0 0 5px 0; color: #f8fafc; font-size: 1.5rem; }
.admin-header p { margin: 0; color: #94a3b8; }
.sekmeler { display: flex; gap: 10px; margin-bottom: 20px; }
.sekmeler button { flex: 1; padding: 15px; border: none; background: #e2e8f0; color: #475569; font-weight: bold; font-size: 1.1rem; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.sekmeler button.aktif { background: #3b82f6; color: white; box-shadow: 0 4px 6px rgba(59,130,246,0.3); }
.panel-icerik { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.kutu { border-radius: 8px; padding: 15px; margin-bottom: 15px; }
.bolge-kutu { background: #f8fafc; border: 2px solid #cbd5e1; }
.mintika-kutu { background: #fff; border: 1px dashed #94a3b8; margin-left: 20px; margin-top: 15px; }
.kurum-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-top: 15px; }
.kurum-kutu { background: #f0fdf4; border: 1px solid #bbf7d0; }
.baslik { display: flex; justify-content: space-between; align-items: center; font-size: 1.1rem; }
.mesul { font-size: 0.9rem; color: #b45309; background: #fef3c7; padding: 4px 10px; border-radius: 20px; font-weight: bold; }
.personel-listesi { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; }
.badge { background: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; }
.form-kart { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; }
.form-kart h4 { margin-top: 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
.input-kutu { width: 100%; padding: 10px; margin-bottom: 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
.btn-mavi, .btn-yesil, .btn-mor { width: 100%; padding: 10px; border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; }
.btn-mavi { background: #3b82f6; } .btn-yesil { background: #10b981; } .btn-mor { background: #8b5cf6; }
.liste-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; color: #475569; }
.btn-sil { background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.toast { margin-top: 10px; background: #dcfce7; color: #166534; padding: 10px; border-radius: 6px; font-size: 0.95rem; }
.personel-tablosu { width: 100%; border-collapse: collapse; margin-top: 15px; }
.personel-tablosu th, .personel-tablosu td { padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
.personel-tablosu th { background: #f8fafc; color: #475569; font-weight: bold; }
.personel-tablosu tbody tr:hover { background-color: #f1f5f9; }
.sonuc-listesi { margin-top: 15px; max-height: 150px; overflow-y: auto; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; }
.modal-arkaplan { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.7); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-kutu { background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 450px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.modal-label { display: block; font-weight: bold; color: #334155; margin-bottom: 5px; font-size: 0.9rem; }
</style>