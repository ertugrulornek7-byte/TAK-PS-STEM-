<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios'

const authStore = useAuthStore()

// State: Veriler
const benimGorevlerim = ref([])
const kurumGorevleri = ref([])
const mintikalar = ref([])
const kurumlar = ref([])
const kurumPersonelleri = ref([])
const islemDurumu = ref('')
const seciliSekme = ref('BENIM_GOREVLERIM') 

// Sabit Sınıflar (Filtreleme İçin)
const TUM_SINIFLAR = [
  { id: '4_NEHARI', name: '4. Sınıf Nehari' },
  { id: '5_SINIF', name: '5. Sınıf' },
  { id: '6_SINIF', name: '6. Sınıf' },
  { id: '7_SINIF', name: '7. Sınıf' },
  { id: '8_SINIF', name: '8. Sınıf' },
  { id: '8_NEHARI', name: '8. Sınıf Nehari' },
  { id: 'LISE_1', name: 'Lise 1' },
  { id: 'LISE_2', name: 'Lise 2' },
  { id: 'LISE_3', name: 'Lise 3' }
]

// Gelişmiş Form Modeli
const yeniGorev = ref({
  title: '',
  description: '',
  moduleType: 'GENEL',
  targetDistrictId: '',
  targetInstitutionId: '',
  targetType: 'TUMU', 
  targetRoleId: 'PERSONEL',
  targetUserId: '',
  targetClassId: ''
})

const kanitFormlari = ref({})

// Yetki Kalkanları (Güvenli Hesaplama)
const role = computed(() => authStore.user?.roleLevel || 'PERSONEL')
const isBolge = computed(() => role.value === 'BOLGE')
const isMintika = computed(() => role.value === 'MINTIKA')
const isKurum = computed(() => role.value === 'KURUM')
const yoneticiMi = computed(() => ['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM'].includes(role.value))

// ==========================================
// 1. YÜKLEME VE TETİKLEYİCİLER
// ==========================================
const sayfaYukle = async () => {
  // Try-catch ile sarmalandı, hata olursa sayfanın geri kalanı çökmeyecek!
  try {
    await benimGorevlerimiGetir()
  } catch (e) { console.warn("Benim görevlerim alınırken ufak bir pürüz yaşandı."); }
  
  if (yoneticiMi.value) {
    seciliSekme.value = 'YONETIM'
    
    if (isBolge.value || isMintika.value) {
      await bolgeMintikaVerileriniGetir()
    } else if (isKurum.value) {
      yeniGorev.value.targetInstitutionId = authStore.user?.institutionId
      await kurumaAitVerileriGetir()
    }
  }
}

const bolgeMintikaVerileriniGetir = async () => {
  try {
    const res = await api.get('/hierarchy/institutions') 
    kurumlar.value = res.data || []
    
    const dMap = new Map()
    kurumlar.value.forEach(k => {
      if (k.district && !dMap.has(k.district.id)) {
        dMap.set(k.district.id, k.district)
      }
    })
    mintikalar.value = Array.from(dMap.values())
  } catch (error) { console.error("Hiyerarşi çekilemedi") }
}

const kurumaAitVerileriGetir = async () => {
  if (!yeniGorev.value.targetInstitutionId) return
  try {
    const resG = await api.get(`/tasks/institution/${yeniGorev.value.targetInstitutionId}`)
    kurumGorevleri.value = resG.data || []
  } catch (error) { console.warn("Kurum görevleri çekilemedi") }

  try {
    const resP = await api.get(`/hierarchy/personnel/${yeniGorev.value.targetInstitutionId}`)
    kurumPersonelleri.value = resP.data || []
  } catch (error) { console.warn("Kurum personelleri çekilemedi") }
}

// Filtre Değişim İzleyicileri
watch(() => yeniGorev.value.targetInstitutionId, (newId) => {
  if (newId) kurumaAitVerileriGetir()
})

// ==========================================
// 2. VERİ ÇEKME
// ==========================================
const benimGorevlerimiGetir = async () => {
  const res = await api.get('/tasks/my-tasks')
  benimGorevlerim.value = res.data || []
  
  benimGorevlerim.value.forEach(assignment => {
    if (!kanitFormlari.value[assignment.id]) {
      kanitFormlari.value[assignment.id] = { description: '', photoUrl: '' }
    }
  })
}

// ==========================================
// 3. GÖREV ATAMA (KADEMELİ)
// ==========================================
const gorevOlustur = async () => {
  // Kurum mesulü ise kendi kurum ID'sini otomatik zorla
  if (isKurum.value) {
    yeniGorev.value.targetInstitutionId = authStore.user?.institutionId
  }

  if (!yeniGorev.value.title) {
    islemDurumu.value = 'Lütfen görev başlığını doldurun!'
    setTimeout(() => islemDurumu.value = '', 3000)
    return
  }
  
  islemDurumu.value = 'Görev hedeflere dağıtılıyor...'
  try {
    const res = await api.post('/tasks/assign-smart', yeniGorev.value)
    
    islemDurumu.value = `Görev başarıyla atandı! (${res.data.userCount} kişiye iletildi)`
    yeniGorev.value.title = ''
    yeniGorev.value.description = ''
    
    setTimeout(() => islemDurumu.value = '', 4000)
    if (yeniGorev.value.targetInstitutionId) await kurumaAitVerileriGetir()
  } catch (error) {
    islemDurumu.value = 'HATA: Görev atanamadı!'
  }
}

// ==========================================
// 4. KANIT YÜKLEME
// ==========================================
const kanitGonder = async (assignmentId) => {
  const form = kanitFormlari.value[assignmentId]
  if (!form.description) {
    alert("Lütfen yapılan işlemle ilgili bir açıklama yazınız.")
    return
  }

  try {
    await api.post(`/tasks/proof/${assignmentId}`, {
      description: form.description,
      photoUrl: form.photoUrl
    })
    
    alert("Kanıt başarıyla gönderildi ve onaya sunuldu!")
    await benimGorevlerimiGetir()
  } catch (error) {
    alert("Hata oluştu!")
  }
}

onMounted(() => {
  if (authStore.user) sayfaYukle()
})

watch(() => authStore.user, (newVal) => {
  if (newVal) sayfaYukle()
})
</script>

<template>
  <div class="sayfa-container">
    
    <div class="sekme-alani" v-if="yoneticiMi">
      <button :class="{'aktif': seciliSekme === 'YONETIM'}" @click="seciliSekme = 'YONETIM'">🏢 Yönetim ve Görev Atama</button>
      <button :class="{'aktif': seciliSekme === 'BENIM_GOREVLERIM'}" @click="seciliSekme = 'BENIM_GOREVLERIM'">📋 Bana Atanan Görevler</button>
    </div>
    
    <div v-else class="baslik-alani">
      <h2>📋 Bana Atanan Görevler</h2>
      <p style="color: #64748b;">Merkez veya kurum mesulü tarafından size atanan görevleri buradan tamamlayabilirsiniz.</p>
    </div>

    <!-- 1. YÖNETİM SEKMESİ -->
    <div v-if="seciliSekme === 'YONETIM' && yoneticiMi">
      
      <!-- KADEMELİ KAPSAM SEÇİMİ (Sadece Bölge ve Mıntıka İçin) -->
      <div class="kutu-panel eylem-paneli" style="border-top-color: #f59e0b;" v-if="isBolge || isMintika">
        <h3>🌍 Atama Kapsamını Seçin</h3>
        <div class="form-grid">
          
          <div class="form-eleman" v-if="isBolge">
            <label>1. Aşama: Mıntıka (İsteğe Bağlı)</label>
            <select v-model="yeniGorev.targetDistrictId" class="input-text">
              <option value="">Tüm Bölgem</option>
              <option v-for="m in mintikalar" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>

          <div class="form-eleman" v-if="isBolge || isMintika">
            <label>2. Aşama: Kurum (İsteğe Bağlı)</label>
            <select v-model="yeniGorev.targetInstitutionId" class="input-text">
              <option value="">{{ isMintika ? 'Tüm Mıntıkam' : 'Tüm Seçili Alan' }}</option>
              <option v-for="k in kurumlar.filter(x => !yeniGorev.targetDistrictId || x.districtId === yeniGorev.targetDistrictId)" :key="k.id" :value="k.id">
                {{ k.name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- KİTLE FİLTRESİ VE GÖREV DETAYI (Tüm Yöneticiler Görür) -->
      <div class="kutu-panel eylem-paneli">
        <h3>🎯 Hedef Kitle ve Görev Detayı</h3>
        <div class="form-grid">
          
          <div class="form-eleman">
            <label>Hedef Kitle / Filtre</label>
            <select v-model="yeniGorev.targetType" class="input-text">
              <option value="TUMU">Kapsamdaki Herkes</option>
              <option value="ROL_BAZLI">Belirli Bir Rol Sınıfı</option>
              <option value="SINIF_BAZLI">Belirli Bir Sınıfın Hocaları</option>
              <option value="TEK_PERSONEL" v-if="isKurum || yeniGorev.targetInstitutionId">Spesifik Bir Personel</option>
            </select>
          </div>

          <div class="form-eleman" v-if="yeniGorev.targetType === 'ROL_BAZLI'">
            <label>Hedef Rol</label>
            <select v-model="yeniGorev.targetRoleId" class="input-text">
              <option value="PERSONEL">Standart Personeller</option>
              <option value="KURUM">Kurum Eğitim Mesulleri</option>
            </select>
          </div>

          <div class="form-eleman" v-if="yeniGorev.targetType === 'SINIF_BAZLI'">
            <label>Hangi Sınıftan Sorumlular?</label>
            <select v-model="yeniGorev.targetClassId" class="input-text">
              <option value="" disabled>Sınıf Seç...</option>
              <option v-for="s in TUM_SINIFLAR" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>

          <div class="form-eleman" v-if="yeniGorev.targetType === 'TEK_PERSONEL'">
            <label>Personel Seçin</label>
            <select v-model="yeniGorev.targetUserId" class="input-text">
              <option value="" disabled>Personel Seç...</option>
              <option v-for="p in kurumPersonelleri" :key="p.id" :value="p.id">{{ p.fullName }}</option>
            </select>
          </div>

          <div class="form-eleman tam-genislik" style="border-top: 1px dashed #cbd5e1; margin-top: 10px; padding-top: 15px;">
            <label>Görev Başlığı</label>
            <input type="text" v-model="yeniGorev.title" placeholder="Örn: 8. Sınıflar Deneme Analizi" class="input-text" />
          </div>
          
          <div class="form-eleman tam-genislik">
            <label>Detaylı Açıklama</label>
            <textarea v-model="yeniGorev.description" placeholder="Personelin yapması gerekenleri yazın..." class="input-text" rows="2"></textarea>
          </div>
          
          <div class="form-eleman tam-genislik">
            <button @click="gorevOlustur" class="btn-ata">🚀 Görevi Hedef Kitleye Dağıt</button>
          </div>
        </div>
        <div v-if="islemDurumu" class="toast" :class="{'hata': islemDurumu.includes('HATA')}">{{ islemDurumu }}</div>
      </div>

      <!-- Sadece Tek Bir Kurum Seçildiğinde O Kurumun Görevlerini Gösterir -->
      <div class="kutu-panel rapor-kutu" v-if="isKurum || yeniGorev.targetInstitutionId">
        <div class="baslik-satiri">
          <h3>📊 Görev Akışı ve Takibi</h3>
          <button @click="kurumaAitVerileriGetir" class="btn-yenile">🔄 Güncelle</button>
        </div>

        <div v-if="kurumGorevleri.length === 0" class="uyari-mesaj">Bu kuruma atanmış özel bir görev bulunmuyor.</div>

        <div v-for="gorev in kurumGorevleri" :key="gorev.id" class="gorev-karti">
          <div class="gorev-ust">
            <div>
              <h4>{{ gorev.title }}</h4>
              <p class="gorev-aciklama">{{ gorev.description }}</p>
            </div>
          </div>
          
          <div class="ilerleme-listesi">
            <div v-if="!gorev.assignments || gorev.assignments.length === 0" class="bilgi-mesaj">
              Bu görev henüz kimseye atanmamış.
            </div>

            <div v-for="atama in gorev.assignments" :key="atama.id" class="personel-satir">
              <div class="personel-isim">
                <strong>👤 {{ atama.user?.fullName || 'Bilinmeyen Personel' }}</strong>
                <span class="durum-rozeti" :class="(atama.status || 'bekliyor').toLowerCase()">
                  {{ atama.status === 'BEKLIYOR' ? '⏳ Yapılmadı' : (atama.status === 'ONAY_BEKLIYOR' ? '🔍 Onay Bekliyor' : '✅ Tamamlandı') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. BENİM GÖREVLERİM SEKMESİ -->
    <div v-if="seciliSekme === 'BENIM_GOREVLERIM'">
      <div v-if="benimGorevlerim.length === 0" class="uyari-mesaj">Şu an için size atanmış bekleyen bir görev bulunmuyor. Harika! 🎉</div>

      <div class="grid-container">
        <div v-for="atama in benimGorevlerim" :key="atama.id" class="benim-gorev-karti" :class="(atama.status || 'bekliyor').toLowerCase()">
          <div class="kart-ust">
            <span class="modul-etiketi-kucuk">{{ atama.task?.moduleType || 'GENEL' }}</span>
          </div>
          
          <h3 class="gorev-baslik">{{ atama.task?.title || 'Başlıksız Görev' }}</h3>
          <p class="gorev-detay">{{ atama.task?.description || 'Açıklama yok.' }}</p>

          <hr class="ayrac">

          <div v-if="atama.status === 'BEKLIYOR' || !atama.status" class="kanit-formu">
            <label>Neler yaptınız? (Açıklama)</label>
            <textarea v-model="kanitFormlari[atama.id].description" placeholder="Görevle ilgili yaptığınız işlemi anlatın..." rows="2" class="input-text-kucuk"></textarea>
            
            <label>Varsa Fotoğraf/Belge Linki</label>
            <input type="text" v-model="kanitFormlari[atama.id].photoUrl" placeholder="https://..." class="input-text-kucuk" />
            
            <button @click="kanitGonder(atama.id)" class="btn-tamamla">✔️ Görevi Tamamla & Bildir</button>
          </div>

          <div v-else class="durum-bilgisi">
            <div v-if="atama.status === 'ONAY_BEKLIYOR'" class="onay-kutusu">⏳ Görev kanıtınız yöneticinize iletildi.</div>
            <div v-if="atama.status === 'TAMAMLANDI'" class="tamam-kutusu">✅ Bu görevi başarıyla tamamladınız!</div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f1f5f9; min-height: 100vh; }
.baslik-alani { margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
.baslik-alani h2 { margin: 0 0 5px 0; color: #1e293b; }

.sekme-alani { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
.sekme-alani button { background: white; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; font-weight: bold; color: #475569; cursor: pointer; transition: 0.2s; }
.sekme-alani button:hover { background: #f8fafc; }
.sekme-alani button.aktif { background: #3b82f6; color: white; border-color: #3b82f6; }

.kutu-panel { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; }
.eylem-paneli { border-top: 5px solid #8b5cf6; }
.form-grid { display: flex; flex-wrap: wrap; gap: 15px; }
.form-eleman { display: flex; flex-direction: column; gap: 5px; min-width: 200px; flex: 1; }
.tam-genislik { min-width: 100%; }
.form-eleman label { font-weight: bold; color: #334155; font-size: 0.9rem; }
.input-text { padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; background: #f8fafc; font-family: inherit; }
.btn-ata { background: #8b5cf6; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: 0.2s; }
.btn-ata:hover { background: #7c3aed; }

.baslik-satiri { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
.btn-yenile { background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.gorev-karti { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px; border-left: 4px solid #3b82f6; }
.gorev-ust { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
.gorev-ust h4 { margin: 0 0 5px 0; color: #0f172a; font-size: 1.1rem; }
.gorev-aciklama { margin: 0; color: #475569; font-size: 0.9rem; }

.ilerleme-listesi { background: white; padding: 15px; border-radius: 6px; border: 1px solid #cbd5e1; }
.personel-satir { padding: 10px 0; border-bottom: 1px dashed #cbd5e1; }
.personel-satir:last-child { border-bottom: none; padding-bottom: 0; }
.personel-isim { display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem; color: #1e293b; margin-bottom: 8px; }
.durum-rozeti { font-size: 0.8rem; font-weight: bold; padding: 4px 10px; border-radius: 12px; }
.durum-rozeti.bekliyor { background: #f1f5f9; color: #64748b; }
.durum-rozeti.onay_bekliyor { background: #fef3c7; color: #d97706; }
.durum-rozeti.tamamlandi { background: #dcfce7; color: #166534; }
.kanit-kutusu { background: #f8fafc; padding: 10px; border-radius: 6px; font-size: 0.85rem; color: #475569; border-left: 3px solid #8b5cf6; margin-top: 5px; }
.link-mavi { color: #2563eb; text-decoration: none; font-weight: bold; }
.link-mavi:hover { text-decoration: underline; }

.grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
.benim-gorev-karti { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; transition: transform 0.2s; border-top: 5px solid #cbd5e1; }
.benim-gorev-karti.bekliyor { border-top-color: #ef4444; }
.benim-gorev-karti.onay_bekliyor { border-top-color: #f59e0b; }
.benim-gorev-karti.tamamlandi { border-top-color: #10b981; }
.benim-gorev-karti:hover { transform: translateY(-3px); box-shadow: 0 10px 15px rgba(0,0,0,0.1); }

.kart-ust { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.modul-etiketi-kucuk { background: #f1f5f9; color: #475569; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
.gorev-baslik { margin: 0 0 10px 0; color: #1e293b; font-size: 1.15rem; }
.gorev-detay { margin: 0; color: #475569; font-size: 0.95rem; line-height: 1.4; flex-grow: 1; }
.ayrac { border: 0; border-top: 1px dashed #cbd5e1; margin: 15px 0; }

.kanit-formu { display: flex; flex-direction: column; gap: 8px; }
.kanit-formu label { font-size: 0.85rem; font-weight: bold; color: #334155; }
.input-text-kucuk { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; font-family: inherit; background: #f8fafc; }
.btn-tamamla { margin-top: 5px; background: #3b82f6; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
.btn-tamamla:hover { background: #2563eb; }

.onay-kutusu { background: #fffbeb; color: #b45309; padding: 12px; border-radius: 6px; font-weight: 500; font-size: 0.9rem; text-align: center; border: 1px solid #fde68a; }
.tamam-kutusu { background: #f0fdf4; color: #15803d; padding: 12px; border-radius: 6px; font-weight: 500; font-size: 0.9rem; text-align: center; border: 1px solid #bbf7d0; }
.kendi-kanitim { margin-top: 10px; font-size: 0.85rem; color: #64748b; padding: 8px; background: #f8fafc; border-radius: 6px; }

.toast { margin-top: 15px; background: #dcfce7; color: #166534; padding: 12px; border-radius: 6px; font-weight: bold; text-align: center; }
.toast.hata { background: #fee2e2; color: #b91c1c; }
.uyari-mesaj { background: #fffbeb; color: #b45309; padding: 15px; border-radius: 6px; text-align: center; font-weight: 500; border: 1px dashed #fcd34d; }
.bilgi-mesaj { color: #94a3b8; font-size: 0.9rem; font-style: italic; text-align: center; }
</style>