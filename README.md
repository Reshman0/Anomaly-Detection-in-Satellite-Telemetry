# AzSonra — Yer İstasyonu Operatör Konsolu

Uydu telemetrisinde **açıklanabilir anomali tespiti** fikrini tek ekranda
anlatan, ECSS/CCSDS terminolojisine sadık bir yer istasyonu operatör konsolu
demosu. TUSAŞ LIFT UP finali (21 Eylül 2026) için hazırlandı.

> ### SİMÜLE VERİ — KAVRAMSAL GÖSTERİM
>
> Gerçek bir makine öğrenmesi modeli çalışmaz. Gerçek bir uydu bağlantısı
> yoktur. Anomali skorları, açıklanabilirlik çıktıları ve alarmlar önceden
> yazılmış senaryo dosyalarından okunur.
>
> Buna karşılık ekrandaki **her etiket, her alan adı, her servis numarası ve
> her sayı gerçek standartlara dayanır.** Demonun inandırıcılığı buradan gelir.

---

## 1. Proje nedir

Klasik uydu yer segmentinde arıza tespiti **sabit limit kontrolüne** dayanır:
uçuş yazılımı her parametreyi önceden tanımlı bir bandın içinde tutar, bant
aşılınca alarm üretir (ECSS ST[12] on-board monitoring). Bu yaklaşım keskin
sıçramaları yakalar; ancak **bandın içinde kalan yavaş sürüklenmeleri ve
kanallar arası ilişkinin bozulmasını göremez.**

AzSonra'nın tezi şudur: bu iki boşluk, telemetriyi çok değişkenli olarak
modelleyen bir otokodlayıcının rekonstrüksiyon hatasıyla kapatılabilir — ve
sonuç, operatörün güvenebileceği şekilde **açıklanabilir** hale getirilebilir.

Bu depo o tezin **görsel argümanıdır.** Konsolun tamamı tek bir kareyi
kurmak için vardır:

```
ST[12] Sabit limit : NOMİNAL        ← uçuş yazılımı bir şey görmüyor
AI Tespiti         : ALARM          ← model sapmayı çoktan yakaladı
```

Bu kare ekranda göründüğünde projenin gerekçesi anlatılmış olur.

**Bağlam:** ESA-ADB (ESA Anomaly Dataset) ve OPS-SAT üzerinde çalışan AzSonra
ekibinin bildirisine dayanır. Kanal adları (`ch_42`, `ch_75`) ESA-ADB'nin
anonimleştirilmiş adlandırmasından gelir; bu yüzden mühendislik birimi yoktur
(`—`) ve `TEMP_BATTERY_1` gibi uydurma isimler kullanılmaz.

---

## 2. Bu demo ne yapar, ne yapmaz

| Yapar | Yapmaz |
|---|---|
| Gerçek CCSDS 133.0-B bit alanları üretir ve ekranda gösterir | PyTorch/ONNX yüklemez, çıkarım yapmaz |
| MIB limitleriyle **gerçekten** limit kontrolü hesaplar | RF, SLE bağlantısı, çerçeve kodlaması kurmaz |
| SGP4 ile gerçek yörünge yayılımı yapar | Açılışta ağdan hiçbir şey çekmez; TLE ve dokular gömülüdür |
| Senaryoları tohumlu ve tekrarlanabilir oynatır | Playback/geri sarma, çoklu operatör, hesap yönetimi sunmaz |
| Tek dosya, internetsiz çalışır | Backend, veritabanı, WebSocket kullanmaz |
| GÜNCEL temada gerçek NASA GIBS mozaiği gösterir (gömülü) | Mozaiği açılışta çekmez — yalnızca operatör `↻` derse |

Ekranın bir köşesinde `SİMÜLE VERİ — KAVRAMSAL GÖSTERİM` rozeti **sürekli
görünür.** Kaldırmayın.

---

## 3. Hızlı başlangıç

Node 20+ gerekir (geliştirme sırasında Node 22.14 kullanıldı).

Bağımlılıkları kurun:

```bash
npm install
```

Geliştirme sunucusu (http://localhost:5173):

```bash
npm run dev
```

Testler:

```bash
npm test
```

Demo için dağıtım derlemesi:

```bash
npm run build
```

Derlemeyi yerelde denemek:

```bash
npm run preview
```

### Dağıtım çıktısı

`npm run build` **tek bir `dist/index.html` dosyası** üretir (~2,3 MB). Tüm
JavaScript, CSS, MIB, senaryolar, TLE, kıta çizgileri, XAI görselleri ve iki
dünya dokusu (Blue Marble ~280 kB + GIBS günlük mozaik ~595 kB) bu dosyanın
içine gömülüdür.

- İnternetsiz bir dizüstünde `file://` ile doğrudan açılır.
- Basit bir statik sunucuyla da çalışır.
- **Açılışta sıfır ağ isteği.** Doğrulandı: sayfa yüklenirken yalnızca
  `index.html`'in kendisi istenir, başka hiçbir istek çıkmaz. Derlenen dosyada
  `<link>` etiketi yoktur ve NASA adresi yalnızca bir **sabit dizgi** olarak
  geçer — çağrılmaz.
- Ağa çıkan **tek** kod yolu, GÜNCEL temasındaki `↻` ve gün düğmeleridir
  (`−1g · −2g · −3g`, UTC'ye göre dün / evvelsi gün / üç gün önce): operatör
  basmadıkça hiçbir istek oluşmaz, bastığında tek bir GET atılır ve
  başarısız olursa gömülü mozaik ekranda kalır (bkz. §10 madde 6). Gün seçimi
  hem 3B kürede hem 2B haritada aynı düğme satırındadır; gösterilen mozaiğin
  gerçek tarihi lejandda yazar (gömülü sürümün tarihi seçilen günden farklı
  olabilir).
- Fontlar sistem fontlarıdır (Consolas / Segoe UI ve yedekleri); indirilen font
  yoktur.

Demo makinesine götürmek için **sadece `dist/index.html` dosyasını kopyalamak
yeterlidir.** Bir USB bellek yeter; `node_modules` gerekmez.

---

## 4. Ekranda ne var

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ÜST ŞERİT  Görev · UTC · OBT · Hız · SLE RAF · İstasyon · AOS/LOS · TLE  │
├───────────────────────┬──────────────────────────────────────────────────┤
│                       │  TELEMETRİ ŞERİTLERİ                             │
│  KATALOG │ DÜNYA      │  ch_11 ch_12 ch_42 ch_75 ch_58                   │
│  32 Türk │ SGP4       │  ◆ AI_SCORE_SS1 / SS3 / SS5                      │
│  uydusu  │ gerçek zm. ├──────────────────────────────────────────────────┤
│          │            │  paket denetleyici şeridi  ▸ AÇ                  │
│          │            │  INFO · operatör bilgi paneli / BİLDİRİMLER      │
│          │            ├──────────────────────────────────────────────────┤
│                       │  DURUM   ST[12]: NOMİNAL │ AI: ALARM ← KONTRAST  │
├───────────────────────┼───────────────────────────┬──────────────────────┤
│  SENARYO KONSOLU  │ ALARM KUYRUĞU │ GEÇİŞ PLANI + GÖKYÜZÜ │ XAI PANELİ  │
└───────────────────────┴───────────────────────────┴──────────────────────┘
```

**Üst şerit.** Görev adı, UTC ve OBT (aralarında `-0.734 s` sabit ofset — zaman
korelasyonu izlenimi), hız çarpanı, `SLE RAF` durumu (uydu görüş alanındayken
`ACTIVE`, dışındayken `READY`), yer istasyonu, AOS/LOS geri sayımı, anlık
yükselti açısı ve kullanılan TLE'nin yaşı.

**Küre.** `satellite.js` ile gerçek SGP4. **Türkiye'nin yörüngedeki 32
uydusunun tamamı** gerçek zamanlı konumlarıyla çizilir: TÜRKSAT GEO haberleşme
filosu, yer gözlem uyduları (GÖKTÜRK, İMECE, RASAT, BİLSAT), Plan-S Connecta
IoT takımyıldızı ve akademik küçük uydular. Her uydu için hem gövde işareti hem
**yer izdüşümü** (dünya yüzeyindeki anlık konum) gösterilir.

Soldaki katalog listesinden bir uydu seçilir; seçili uydu üst şeritteki AOS/LOS
geri sayımını, yörünge izini, görüş konisini ve görüş vektörünü sürer.
Sürükleyerek döndürülür, tekerlekle yakınlaştırılır. Sağ üstteki `LEO` / `TÜMÜ`
düğmeleri kamerayı alçak yörüngeye ya da GEO kuşağı dahil tüm filoya
çerçeveler. Terminator, bulut katmanı, atmosfer parıltısı **bilerek yoktur.**

**Yer zemini.** Kıtalar dolu şekiller olarak çizilir, ülke kara sınırları
işlenir ve **Türkiye ayrı bir dolgu, en parlak anahat ve `TÜRKİYE` etiketiyle
vurgulanır** — operatör yer istasyonunun hangi ülkede olduğunu tek bakışta
seçebilsin diye. Zemin, uygulama açılırken tarayıcıda üretilir (Natural Earth
verisinden bir canvas dokusu); hazır bir görüntü dosyası yüklenmez, dolayısıyla
çalışma zamanında ağ isteği oluşmaz.

> **İrtifa görsel olarak sıkıştırılmıştır.** GEO 6.6 dünya yarıçapındadır;
> gerçek ölçekte çizilse küre noktaya dönerdi. Alçak yörüngede sapma %2'nin
> altındadır, yukarıda logaritmik olarak sıkışır (GEO halkası ~2 yarıçapa
> iner; kürenin ekranda büyük kalmasını bu sağlar). **Okunan km, derece ve
> zaman değerleri her zaman gerçektir**; sıkıştırma yalnızca çizimdedir ve
> ekranda yazılıdır.

Küre durumsal farkındalık içindir. Telemetri akışı tek bir göreve — `AZS-DEMO`
— aittir ve uydu seçiminden etkilenmez (yönerge §11: ikinci bir uydu misyonu
kapsam dışı).

**Telemetri şeritleri.** Her satırda parametre adı, **ham değer ve mühendislik
değeri yan yana**, limit bandı arka planda gölge olarak. `◆` işaretli satırlar
yer türetilmiş parametrelerdir; on-board ham karşılıkları olmadığı için ham
sütununda `—` görünür.

Bir XAI kanıtı yüklendiğinde, kanıtın **en yüksek katkılı** saydığı kanalların
şeritlerine mor bir dikkat parantezi ve `XAI #n` rozeti düşer: modelin kararına
dayanak yaptığı 60 saniyelik pencere. Açıklanabilirlik böylece XAI panelinde
kalmaz, operatörün zaten baktığı şeride iner.

**INFO · operatör bilgi paneli** (sağ sütunda, telemetri şeritlerinin altında). Panel senaryonun
başladığına değil, konsolun **gerçekten ne tespit ettiğine** göre açılır
(`src/engine/infoStage.ts`): `İZLEME` (hiç tespit yok — görev notları),
`ŞÜPHE` (CUSUM kırılması *veya* AI ≥ 3σ *veya* ST[12] geçişi — tespit
gerçekleri, imza kütüphanesinden eşleşme adayı, geçmiş), `DOĞRULANDI` (AI ≥ 5σ
— olası neden ve ÖNERİ). Öneri notları doğrulamadan önce düşmez; panel
şeritler, alarm kuyruğu ve XAI ile aynı anda aynı şeyi söyler. Panelin
**BİLDİRİMLER** sekmesi doğrulanan her anomalinin önerisini kalıcı olarak
tutar — senaryo bitip konsol nominale dönse de operatörün yapılacaklar listesi
kaybolmaz (`sim.notifications`; sekme başlığında sayaç). Doğrulandığında
anomalinin **hikâyesini** anlatır: *Ne oldu* ve *olası neden* (senaryo verisi,
simüle), *geçmiş* ("bu imza son 30 günde 4 kez, ~70 s, eğilim artıyor"),
**yapısal kırılma** (beyazlatılmış CUSUM ile **hesaplanır**, senaryo
dosyasından okunmaz; nominal model σ/φ açılıştaki 600 s temiz geçmişten bir kez
kestirilip dondurulur ki peş peşe koşulan senaryolar birbirinin referansını
kirletmesin; ilgili şeritte turuncu kesikli işaret ve `TM[5,1]` bildirimi), AI
tespit anı ve
aciliyet rozetli **ÖNERİ** (izle / planlı / acil) ile eylem maddeleri. Altta
zaman damgalı operatör notları senaryo ilerledikçe düşer (örn. "Kalıcı hafıza
EDAC: son 24 saatte 112 düzeltilebilir hata düzeltildi"). Nominalde görev
notları, sıradaki geçiş ve sayaçlar görünür. Panel başlığı senaryonun bu
oturumda kaçıncı kez koştuğunu sayar.

Üç hikâye gerçek fiziksel mekanizmalara dayanır, olaylar simüledir: SAA
geçişinde tekil olay (SEU) ve EDAC sayacı; tutulma çıkışında yıldız izleyici
termal sürüklenmesi; reaksiyon tekerleği sürtünme artışının termal ve yönelim
kanallarını birlikte kaydırması.

**Geçiş planı.** Kahramankazan için SGP4'ten hesaplanan geçiş tahtası. Solda
seçili uydunun sıradaki geçişi için **kutupsal gökyüzü grafiği** (merkez zenit,
dış çember ufuk, kuzey yukarıda; AOS yeşil, LOS kırmızı, geçiş sırasında anlık
konum noktası). Sağda filo genelinde en yakın geçişler: AOS saati, süre, tepe
yükselti ve geri sayım — satıra tıklamak o uyduyu seçer. GEO uydusu seçiliyse
grafik boş kalır ve "sürekli görüş" yazar; bu bir hata değil, GEO'nun
tanımıdır.

**Yörünge elemanları.** Katalog listesinin altında seçili uydunun Kepler
elemanları: `i e Ω ω M n T a hp ha B* epok`. Hepsi doğrudan TLE'den okunur.

**Küre okuma satırı.** Seçili uydu için `ALT LAT LON AZ EL RANGE` yanında
**menzil hızı** (`RR`, km/s — Doppler kaymasının işaretini ve büyüklüğünü
belirleyen nicelik) ve **tek yön ışık gecikmesi** (`OWLT`, ms). İstasyondan o
anda görünen her uyduya ince yeşil bir görüş vektörü çizilir; panel başlığı
görünen uydu sayısını gösterir.

**Kamera takibi.** `TAKİP` düğmesi (ya da `F`) kamerayı seçili uydunun üzerine
kilitler; dünya altında döner. Fareyle müdahale takibi keser.

**Zemin temaları.** Kürenin sağ üstündeki `OPS · SİYASİ · FİZİKİ · GÜNCEL` düğmeleri:

| Tema | Ne gösterir | Kaynak |
|---|---|---|
| **OPS** | Koyu operasyon zemini: dolu kıtalar, kıyı çizgisi, ülke sınırları, Türkiye vurgulu | Natural Earth 110m, canvas'ta üretilir |
| **SİYASİ** | Klasik siyasi harita: her ülke ayrı pastel dolgu, koyu sınırlar, **Türkçe ülke adları** (büyüklüğe göre ölçekli; küçük ülkeler okunmayacağı için atlanır), Türkiye amber | Natural Earth 110m, `NAME_TR` alanı |
| **FİZİKİ** | Gerçek uydu mozaiği: topografya gölgeli, batimetri işlenmiş, bulutsuz; üstüne ince beyaz sınırlar ve Türkiye anahattı | NASA Blue Marble Next Generation (Aralık 2004), kamu malı, 2048×1024 JPEG olarak gömülü (~280 kB) |
| **GÜNCEL** | **Dünün** gerçek günlük mozaiği: gerçek bulut desenleri, gerçek tarih; aynı beyaz sınırlar ve Türkiye anahattı. Alım tarihi lejandda her zaman yazar | NASA EOSDIS GIBS/Worldview · VIIRS SNPP CorrectedReflectance TrueColor, kamu malı, 2048×1024 JPEG gömülü (~595 kB); `npm run imagery` ile tazelenir |

Dört temada da uydular, görüş konisi, yörünge izi ve GEO kuşağı aynı kalır;
yalnızca zemin, kenar halkası ve paralel/meridyen ağının rengi değişir. Dokular
ilk seçimde bir kez üretilir, sonra anında anahtarlanır. Kabartma uydurulmaz —
görüntüler NASA'nın gerçek verisidir.

**GÜNCEL temada iki ayrım önemlidir.** (1) Bu bir **günlük mozaiktir**, anlık
yayın değil: bir günün yörünge şeritlerinden dikilir, bu yüzden arayüzde
hiçbir yerde "canlı" yazmaz — düğmenin yanında **alım tarihi** durur.
(2) Kutup gecesindeki bölgelerde **veri yoktur**: VIIRS görünür bantta çalışır,
aydınlanmayan enlemler siyah kalır. Bu boşluk 2004 dokusuyla **doldurulmaz** —
iki farklı tarihli görüntüyü tek görüntü gibi birleştirmek §0'a aykırı olurdu;
lejand siyah kuşağın kutup gecesi olduğunu yazar.

Ekrandaki `SİMÜLE VERİ` rozeti **telemetri** içindir. GÜNCEL temadaki görüntü
gerçek NASA ölçümüdür; üzerindeki bulutlar da §11'in dışladığı dekoratif bir
bulut katmanı değil, ölçümün kendisidir. Terminatör ve atmosfer efekti hâlâ
hiçbir temada yoktur.

**2B harita.** Kürenin sağ üstündeki `3B | 2B` düğmesi (ya da `M`) dünyayı
eşdikdörtgen (plate carrée) izdüşümde açar (`src/components/MapView2D.tsx`).
Zemin dokuları küreyle paylaşılır (`src/ui/earthTexture.ts`); 2B'ye ilk
geçişte OPS zemini otomatik olarak **FİZİKİ**'ye (NASA Blue Marble — gerçek
renk, topografya gölgeli, batimetri işlenmiş) çevrilir, sonra üç tema
serbestçe seçilir. Çizilenler: tüm filonun yer izdüşümleri (LEO eşkenar
dörtgen, GEO kare; grup rengiyle), seçili uydunun **tam yer izi** (−½/+¾
periyot), istasyonun seçili irtifa için **görüş dairesi**, görünen uydulara
kesikli görüş çizgisi, 30° paralel/meridyen ağı, ekvator ölçek çubuğu.
Sürükle = kaydır, tekerlek = imleç etrafında yakınlaş, çift tık = sıfırla,
uyduya tık = seç, üzerine gel = ad/NORAD/sınıf. Terminator, bulut ve atmosfer
yine yoktur (§11). Kürenin WebGL çizimi 2B açıkken atlanır, sahne canlı kalır.

**Paket denetleyici.** Telemetri şeritleri ile INFO paneli arasındaki ince
şerit son paketin etiketini, APID/sekansını ve oktet dizisini sürekli gösterir;
tıklamak (ya da `P`) tam denetleyici penceresini açar. Böylece hex dökümü
sürekli yer kaplamaz, küre ve INFO paneli ana ekranda geniş durur.
Pencerede üç katmanlı sekme: `CADU · FRAME · PACKET`. Solda bölge lejandı
(renk, ad, özet, oktet aralığı), sağda renkli hex dökümü. Esc ya da dışına
tıklama kapatır. Pencerede `DONDUR` düğmesi hex dökümünü akış
durmadan sabitler; şeritteki `PEC OK/HATA` rozeti son paketin CRC-16-CCITT'sini
yeniden hesaplayarak doğrular. Alarm detayındaki "denetleyici ↗" bağlantısı
aynı pencereyi açar.


- **PACKET** — son üretilen CCSDS 133.0-B Space Packet: mavi birincil başlık,
  amber PUS-C ikincil başlığı, yeşil kullanıcı verisi, kırmızı Packet Error
  Control.
- **FRAME** — aynı paketi taşıyan CCSDS 132.0-B TM Transfer Frame, standart
  RS(255,223) I=5 boyunda (1115 oktet): mavi birincil başlık (`TFVN 0 · SCID
  171 · VCID 0`), yeşil veri alanı (paket + idle paket dolgusu, APID 2047),
  amber **OCF/CLCW** (4 oktet, başlıkta değil sonda) ve gerçekten hesaplanan
  kırmızı FECF (CRC-16-CCITT). Alt bilgi `MCFC · VCFC` sayaçlarını gösterir.
- **CADU** — CCSDS 131.0-B: gerçek ASM (`1ACFFC1D`) + **Reed-Solomon kodblok
  (255,223) I=5** (1275 oktet). Kontrol simgeleri gerçekten hesaplanır
  (`src/engine/reedSolomon.ts`, bkz. sapma 5); hex dökümünde sahte bayt yoktur.

SCID (171) ve çerçeve uzunluğu `apid_table.json` içinde tanımlı demo
tahsisleridir, APID'ler gibi.

**Durum bandı.** Solda ST[12] sabit limit durumu, sağda AI tespiti. İkisi
ayrıştığında sağ taraf morla vurgulanır ve `← KONTRAST` etiketi belirir.

**Senaryo konsolu.** Üç senaryo düğmesi, beş kademeli şiddet kaydırıcısı ve
nominal akışa dönüş.

**Alarm kuyruğu.** Servis etiketi, UTC + OBT damgası, APID, sorumlu parametre,
alt sistem, model adı ve güven skoru. Kartlar iki bağımsız renk ekseni taşır:

- **Kaynak** — sol kenar ve sağdaki etiket: mor `◆ AI TÜRETİLMİŞ`, yeşil/amber/
  kırmızı `▲ ST[12] LİMİT` (uçuş yazılımı).
- **Şiddet** — servis etiketi, dört bölmeli şiddet çubuğu ve kart zemini:
  ESA-ADB 0–3 ↔ `TM[5,1..4]` → yeşil *bilgi* · amber *düşük* · turuncu *orta*
  · kırmızı *yüksek*. Orta ve yüksek kartlar hafif renkli zemin alır.

Panel başlığında şiddet başına canlı sayaçlar ve AI/ST[12] toplamı var; kuyruk
okunmadan "kim söylüyor" ve "ne kadar ciddi" ayrı ayrı seçilir.

**Kuyruk uyduya aittir.** Başlıktaki `SEÇİLİ UYDU` / `TÜM FİLO` sekmeleri
kapsamı değiştirir. Her uydunun kendi alarm kuyruğu ve anomali hafızası vardır;
senaryo her zaman **seçili uyduya** enjekte edilir (senaryo konsolu başlığında
`hedef: <uydu>` yazar). `TÜM FİLO` örneklenmiş bütün uyduları tek listede
birleştirir ve kartlara uydu adı + grup rengi ekler; başka uydunun alarmına
tıklandığında detay penceresi o uydunun tamponundan okur ve başlıkta `○` ile
uykuda olduğunu belirtir. Sol katalogda her satır bir durum noktası taşır:
içi boş = henüz örneklenmedi · sönük dolu = örneklendi, alarm yok · şiddet
renginde dolu + desen = en yüksek şiddet, yanında `onaysız/toplam alarm`.

Karta tıklamak **alarm detay penceresini** açar: UTC/OBT/görev saati, kaynak
(APID, parametre, alt sistem, model, güven, ST[12] geçişi), parametrenin MIB
tanımı (kalibrasyon, limitler, örnekleme) ve anlık değeri, alarm anının
−90/+30 s bağlamını gösteren limit bantlı mini şerit, alarmı taşıyan TM
paketinin hex dökümü ve veri alanları, o anda yüklü XAI kanıtı. `ONAYLA (ACK)`
alarmı operatör kaydı olarak işaretler (kart soluklaşır, `✓ ACK` rozeti);
uyduya hiçbir şey gönderilmez. Esc ya da dışına tıklama kapatır; pencere
açıkken sunucu kısayolları devre dışıdır.

Pencere üç sekmelidir ve başlığında **alarm yaşam döngüsü** şeridi
(`YÜKSELTİLDİ → ONAY → TEMİZLENDİ/BİLGİ`, yaş, prosedür kimliği ve aciliyet)
durur. İçerik `src/engine/alarmInfo.ts` tarafından konsolun kendi verisinden
(MIB, tampon, paket, senaryo hikâyesi) türetilir; hiçbir alan uydurulmaz:

| Sekme | İçerik | Dayanak |
|---|---|---|
| **ÖZET** | zaman, kaynak, MIB tanımı, −90/+30 s bağlam şeridi, taşıyan paket, XAI kanıtı | (önceki sürüm) |
| **STANDART ALANLAR** | `TM[5,x]` olay raporu alanları (event definition ID, şiddet ↔ alt tip, auxiliary data) ya da `TM[12,12]` geçiş raporu alanları (parameter ID, monitoring check ID, previous/current check status `WITHIN LIMITS · BELOW LOW LIMIT · ABOVE HIGH LIMIT`, transition time); **PMON tanımı** (kontrol tipi = limit check, check 1 soft / check 2 hard, repetition number, örnekleme, kalibrasyon); **OOL bilgisi** (ihlal edilen limit, alarm anı değeri, limitten sapma, en kötü değer, limit dışı süre/örneklem, şu anki durum); AI alarmlarında skor parametresi, eşikler ve ST[12] karşılığı | ECSS-E-ST-70-41C §6.5 / §6.12, ECSS-E-ST-70-31C, ECSS-E-ST-70-11C |
| **OPERATÖR EYLEMİ** | prosedür (FOP kimliği, aciliyet `izle / planlı / acil`, eylem, numaralı adımlar — senaryo hikâyesinden ya da genel OOL prosedüründen), operasyonel sonuç (alt sistem, olası etki, uydu güvenliği, komut gerekip gerekmediği), aynı alt sistemin **ilişkili parametreleri** anlık değer ve durumla, ESA-ADB sınıflandırması (nokta / sürüklenme / kolektif) | ECSS-E-ST-70-32C biçimi, ECSS-E-ST-70-11C, ECSS-E-ST-70C, ESA-ADB |

FOP kimlikleri (`FOP-SS1-POINT-01`, `FOP-SS3-OOL-HARD` …) demo tanımıdır ve
öyle etiketlenir; gerçek görevde uçuş operasyon prosedürü kütüphanesinden
gelir. Konsol hiçbir adımda komut göndermez.

**Erişilebilirlik.** Üst şeritteki `ERİŞİLEBİLİRLİK` düğmesi (ya da `A`)
ayar penceresini açar (`src/ui/a11y.ts`, `src/components/AccessibilityPanel.tsx`).
Ayarlar bu tarayıcıda saklanır (`localStorage`, anahtar `azs.a11y.v1`) ve
yalnızca konsolu etkiler; telemetri, limit ve paketler değişmez.

| Ayar | Ne yapar | Dayanak |
|---|---|---|
| Kontrast: standart / **yüksek** | siyah zemin, beyaz metin, doygun durum renkleri (≥ 7:1), kalın kenarlıklar | WCAG 1.4.3 / 1.4.6, ISO 11064 (karanlık kontrol odası) |
| Renk görme: standart / deuteranopi / protanopi / tritanopi / akromatopsi | durum paleti Okabe–Ito güvenli setine geçer (deutan/protan: mavi–sarı–turuncu–macenta; tritan: yeşil–pembe–turuncu–kırmızı; mono: parlaklık merdiveni). Renk hiçbir yerde tek başına anlam taşımaz: `▲ ◆` glifleri, dört bölmeli şiddet çubuğu ve durum sözcükleri her modda kalır | WCAG 1.4.1, ECSS-E-ST-10-11C |
| Arayüz ölçeği %85–%175 | `#root` üzerinde `zoom`; canvas'lar ResizeObserver ile yeniden boyutlanır. `Ctrl +/−/0` | WCAG 1.4.4 |
| Hareketi azalt | kart animasyonu ve küre kamera sönümlemesi kapanır; `prefers-reduced-motion` açılışta okunur | WCAG 2.3.3 |
| Kalın yazı | tüm metin 600, küçük etiketler 700 ağırlık | düşük görme keskinliği |
| Desen kodlaması | alarm kartı zeminine şiddete göre çizgi deseni, AI kaynaklı kartlara noktalı kenar | ECSS-E-ST-10-11C (renk yedeklenir) |
| Odak halkası her zaman | `:focus` da çerçeve alır, yalnızca `:focus-visible` değil | WCAG 2.4.7 |
| Alarmları ekran okuyucuya duyur | görünmez `aria-live="assertive"` bölgesi: kaynak · şiddet · metin · UTC | WCAG 4.1.3 |
| Sesli uyarı | orta/yüksek şiddette WebAudio tonu (yüksekte çift ton); ses dosyası ve ağ isteği yok | ISO 11064-5 |

Pencerenin sağ sütunu **canlı paleti ve ölçülen kontrast oranlarını** (WCAG
göreli parlaklık formülü, `contrastRatio()`) AA/AAA notuyla gösterir; örnek
alarm kartı seçilen modda nasıl görüneceğini önizler. Teknik olarak tüm
renkler CSS değişkenlerinden okunur (`src/index.css` `:root`, Tailwind
`rgb(var(--ops-x) / <alpha-value>)`); canvas ve three.js çizimleri aynı
paleti `COLOR` nesnesinden alır ve palet değişince (`paletteVersion`) bir kez
kurulan malzemeler güncellenir. Her modal `role="dialog"` /
`aria-modal` taşır, alarm kartları `aria-label` ile okunur, sekmeler
`role="tab"` kullanır.

**XAI paneli.** Üç seviyeli sekme (artık → kanal katkısı → Grad-CAM). Öncelik
bildiriden alınmış gerçek PNG'dedir (`src/assets/xai/`). Dosya yoksa panel,
**konsolun kendi telemetri tamponundan o anda hesaplanan** sentetik çizimi
gösterir (simülasyon uyarısı üst şeritteki rozettedir; çizimin üstüne ayrıca
yazılmaz):

Üç seviye **üç farklı soruya, üç farklı nicelikle** cevap verir — aynı grafiğin
üç görünümü değildir:

- *1 · Artık — **ne zaman?*** (zaman ekseni) Hedef kanal ve rekonstrüksiyon
  taban çizgisi; altında **AI skoru eğrisi**, 3σ/5σ eşikleri, skorun eşikleri
  ilk geçtiği anlar (`tespit`, `doğrulama`) ve varsa ST[12] geçiş anı. Köşede
  **öncülük süresi**: AI tespit − ST[12] geçiş. Sürüklenme/kolektifte
  "öncülük ∞ — limit aşılmadı" yazar; demonun ana mesajı rakama bağlanır.
- *2 · Kanal katkısı — **hangi kanal?*** (kanal ekseni) Sıfır çizgisinden
  **işaretli tepe sapma** çubukları (ortalama değil — sıçramada ortalama
  seyreltir, tepe seyreltmez): sağ = taban çizgisinin üstü, sol = altı;
  `tepe +6.4σ ↑` / `tepe −7.7σ ↓` etiketleri, enerji payı yüzdesi, `baskın`
  rozeti.
- *3 · Grad-CAM — **hangi frekans?*** (zaman × frekans) Hedef kanal artığının
  **AC spektrogramı** (pencere ortalaması çıkarılmış; 32 s Hann penceresi,
  1/32 Hz çözünürlük, 0–0.5 Hz) ve altta ayrı bir **DC satırı** (sürekli
  kayma). Senaryo kanıtındaki `band` alanı amber çerçeveyle, son 60 s dikkat
  penceresi mor çerçeveyle, tepe hücre işaretli. Sürüklenme DC satırında
  yoğunlaşır; kolektifteki 0.045 Hz salınım 1/32 Hz çözünürlükte 0.031 Hz
  bin'inde, kanıt bandının içinde okunur; nokta anomalisi tepe/ortalama oranı
  düşük olduğu için "geniş bantlı sıçrama" olarak teşhis edilir.

Sekmeler soruyu taşır (`1 · Artık / ne zaman?`) ve yan sütun seviyeye özel tek
cümlelik cevabı yazar.

Hazır resim yoktur; çizim anomalinin gerçekten ekrandaki şeritlerde olduğu
yerden türer, dolayısıyla şerit ile panel birbirini tutar.

---

## 5. Demoyu sunma

Senaryo düğmesine basıldığında hız otomatik olarak `1×`'e düşer ve senaryo
**90 saniyede** tamamlanır. Üç senaryoyu bu sırayla oynatın — birlikte tek bir
argüman kurarlar.

### 1. Nokta anomalisi · Spectrogram-AE · ~35 s

`ch_11` kanalında kısa bir sıçrama. Sıçrama sert limiti aşar, `limitChecker`
gerçekten hesap yaptığı için `TM[12,12] Check Transition Report` üretilir ve
alarm kuyruğuna **yeşil/kırmızı kenarlı** bir ST[12] kartı düşer.

> **Söylenecek:** "Klasik limit kontrolü bunu zaten yakalıyor. Burada bir
> sorunumuz yok."
>
> **INFO paneli:** SAA geçişi, SEU, kalıcı hafızada 24 saatte 112 düzeltilebilir
> hata → ÖNERİ: sonraki geçişte planlı yeniden başlatma.

Bu senaryonun işlevi, sonraki ikisinde ST[12]'nin sessiz kalmasının bir hata
değil **bulgu** olduğunu kanıtlamaktır.

### 2. Yavaş sürüklenme · TCN-AE · ~72 s — **demonun kritik anı**

`ch_42` kademeli olarak kayar ama limit bandının içinde kalır. Şerit gözle
görülür şekilde sürüklenirken durum bandının solu `NOMİNAL` kalır; sağdaki AI
skoru 3σ'yı, sonra 5σ'yı aşar ve `TM[5,1] → TM[5,3] → TM[5,4]` sırasıyla mor
kartlar düşer. XAI paneli üç seviyeyi sırayla yükler.

> **Söylenecek:** "Uçuş yazılımı hâlâ hiçbir şey görmüyor — çünkü teknik olarak
> haklı, parametre limitin içinde. Model ise sapmayı 30 saniye önce yakaladı ve
> hangi kanaldan geldiğini söylüyor."

Durum bandındaki `NOMİNAL / ALARM` kontrastını gösterin. **Projenin tüm
gerekçesi bu tek karededir.** INFO panelinde yapısal kırılma anı ve "son 30
günde 4 kez, eğilim artıyor" satırını, ardından ÖNERİ'yi gösterin.

### 3. Kolektif sapma · TCN-AE · ~62 s

`ch_42`, `ch_75` ve `ch_58` birbiriyle ilişkili biçimde kayar. Hiçbiri tek
başına limit aşmaz; anomali yalnızca çok değişkenli yapıda görünür. XAI paneli
`ch_75`'i baskın katkı olarak işaretler.

> **Söylenecek:** "Burada tek tek bakınca hiçbir kanal anormal değil. Anormal
> olan aralarındaki ilişki — ve model kaynağı da teşhis ediyor."

### Klavye kısayolları

Sunum sırasında fareye uzanmadan:

| Tuş | Eylem |
|---|---|
| `1` `2` `3` | Nokta anomalisi · Yavaş sürüklenme · Kolektif sapma |
| `N` | Nominal akışa dön |
| `L` / `T` | Küre: alçak yörüngeye yakınlaş / tüm filoyu sığdır |
| `F` | Seçili uyduyu kamerayla takip et (aç/kapat) |
| `0` | Hızı 1×'e al |
| `M` | Dünya: 3B küre ↔ 2B eşdikdörtgen harita |
| `P` | Paket denetleyici penceresini aç/kapat |
| `A` | Erişilebilirlik ayar penceresi |
| `Ctrl +` / `Ctrl −` / `Ctrl 0` | Arayüz ölçeği (tarayıcı yakınlaştırması değil; canvas'lar birlikte ölçeklenir) |
| `Esc` | Açık pencereyi kapat |

### İpuçları

- **Şiddet kaydırıcısı** enjeksiyon büyüklüğünü ölçekler (`×0.7`–`×1.3`).
  Sürüklenme ve kolektif senaryolarda **en yüksek kademede bile** limit
  aşılmaz; bu birim testiyle garanti altındadır.
- Aynı düğmeye tekrar basmak **birebir aynı** anomaliyi üretir. Üretim tohumlu
  ve senaryo başlangıcı örneklem ızgarasına oturtulmuştur.
- `600×` hız çarpanı küre içindir: İMECE'nin ~98 dakikalık yörüngesi ~10
  saniyede tamamlanır, AOS/LOS dinamiği görünür hale gelir. Telemetriyi bu
  hızda izlemeye çalışmayın.
- Uygulama açılırken şeritler **10 dakikalık geçmişle dolu gelir**; boş grafikle
  açılmaz.

---

## 6. Mimari

```
src/
  data/                 saf veri — kod yok
    mib.json            görev veritabanı: parametreler, limitler, kalibrasyon
    apid_table.json     APID tahsis tablosu
    scenario_*.json     nominal / point / drift / collective (+ story ve info adımları)
    mission_notes.json  nominal INFO paneli görev notları
    tle.txt             gömülü TLE kataloğu (32 uydu, 3 satırlık standart biçim)
    satellites.json     uydu meta verisi: işletici, görev türü, grup
    land_110m.json      Natural Earth 110m kıta çizgileri (kamu malı)
    borders_110m.json   Natural Earth 110m ülke kara sınırları (kamu malı)
    turkiye_110m.json   Türkiye anahattı — vurgulanmış çizim için
    countries_110m.json Natural Earth 110m ülke poligonları + Türkçe adlar (siyasi tema)
  assets/earth/
    bmng_2048.jpg       NASA Blue Marble NG, 2048×1024 (fiziki tema), kamu malı
  engine/               saf TypeScript — React'ten bağımsız
    types.ts            ortak tipler
    mib.ts              MIB yükleme, kalibrasyon (raw ↔ mühendislik)
    packetBuilder.ts    CCSDS birincil + PUS-C ikincil başlık + PEC
    missionClock.ts     görev saati, hız çarpanı, zaman biçimleme
    rng.ts              tohumlu rastgelelik (mulberry32 + Box-Muller)
    telemetrySource.ts  nominal seri üretimi + enjeksiyon
    limitChecker.ts     ST[12] sabit limit kontrolü  ← gerçekten hesaplar
    scenarioRunner.ts   senaryo zaman çizelgesi, şiddet ölçeklemesi, hikâye tipi
    changePoint.ts      CUSUM yapısal kırılma tespiti
    robust.ts           medyan / MAD taban çizgisi
    spectral.ts         STFT, bant ayrıştırma (XAI seviye 3)
    orbit.ts            SGP4, AOS/LOS, geçiş tahmini, gökyüzü izi, Kepler elemanları
    simulation.ts       hepsini birleştiren düzenleyici
  components/           arayüz (her panel bir dosya)
  ui/colors.ts          durum renkleri
  assets/xai/           bildiriden alınan gerçek XAI görselleri
  store.ts              zustand — tek `Simulation` örneği + tazeleme sayacı
```

### Veri akışı

```
App (rAF, ~15 Hz)
  └─ store.tick(dt)
       └─ Simulation.advance(dt)
            ├─ MissionClock.advance          gerçek süre × hız çarpanı
            └─ her 1 saniyelik görev adımı için:
                 ├─ TelemetrySource.step()   AR(1) + periyodik + enjeksiyon
                 ├─ halka tamponlarına yaz   (10 dakikalık pencere)
                 ├─ packetBuilder            TM[3,25] · APID başına
                 ├─ LimitChecker.push()      durum değişiminde TM[12,12]
                 └─ ScenarioRunner.due()     zamanı gelen TM[5,x] ve XAI
```

`engine/` katmanı tarayıcı API'si kullanmaz; `npm test` bütün senaryoları React
olmadan uçtan uca koşturur.

### Neden AI skoru ayrı bir kutu değil

`AI_SCORE_SS1/SS3/SS5`, `mib.json` içinde tanımlı, **limitleri olan**,
`derived: true` ve `subsystem: "GND"` olan parametrelerdir. Arayüzde diğer
parametrelerle aynı şeridi ve aynı limit rengi mantığını kullanırlar. Farkları
yalnızca kaynaklarıdır: `◆` işareti, ham değer yerine `—`, mor vurgu.

APID 200 uyduya ait değildir; yer tarafında hesaplanan parametrelerin MIB
içindeki adresleme grubudur. Bu APID için **indirilen bir TM paketi üretilmez**;
AI kaynaklı ST[05] bildirimleri yer segmentinde üretilir ve alarm kartında
`AI TÜRETİLMİŞ` olarak etiketlenir. Bu ayrım alarm kuyruğunun altında da yazılı.

---

## 7. Geliştirme rehberi

Altın kural: **ekrandaki hiçbir sayı bileşenin içinde sabit yazılı değildir.**
Değiştirmek istediğiniz şey neredeyse her zaman `src/data/` altındaki bir JSON
dosyasındadır.

### Yeni telemetri parametresi eklemek

`src/data/mib.json` içindeki `parameters` dizisine bir nesne ekleyin. Şeritler
kalan yüksekliği paylaştığı için düzen kendini ayarlar, ayrıca bir şey yapmanız
gerekmez.

```jsonc
{
  "pid": "ch_31",                     // ESA-ADB kanal adı
  "description": "Alt sistem 5 kanalı 31",
  "subsystem": "SS5",                 // subsystems dizisinde tanımlı olmalı
  "apid": 44,
  "sid": 1,                           // housekeeping structure ID
  "raw_type": "u16",
  "eng_unit": "—",
  "calibration": { "type": "linear", "a": 0.0014, "b": -11.2 },
  "sampling_period_s": 1,             // 1'in katı olmalı
  "limits": { "soft_low": -3.0, "soft_high": 3.0,
              "hard_low": -5.0, "hard_high": 5.0 },
  "derived": false,
  "sim": {                            // ECSS modelinin parçası DEĞİL
    "mean": 0.0, "sd": 0.2, "ar1": 0.9,
    "diurnal_amp": 0.4, "diurnal_period_s": 5894, "phase": 1.1
  }
}
```

`sim` bloğu yalnızca nominal seri üretecini besler:

| Alan | Anlamı |
|---|---|
| `mean` | mühendislik biriminde uzun dönem ortalaması |
| `sd` | duruk standart sapma (AR(1) ölçeklemesi otomatik) |
| `ar1` | otokorelasyon katsayısı, 0–1; yükseldikçe seri yumuşar |
| `diurnal_amp` | yavaş periyodik bileşenin genliği |
| `diurnal_period_s` | periyot; 5894 s = TLE'den türetilen yörünge periyodu |
| `phase` | radyan cinsinden faz — kanalların üst üste binmesini önler |
| `floor` | (isteğe bağlı) alt kırpma; AI skorları için `0.0` |

Kalibrasyon `eng = a × raw + b` şeklindedir. `a` ve `b`'yi, beklenen mühendislik
aralığının `u16` (0–65535) içine düşecek şekilde seçin.

### Limitleri değiştirmek

Aynı dosyada `limits` bloğunu düzenleyin. Dört alan da isteğe bağlıdır;
verilmeyen limit kontrol edilmez (AI skorlarında yalnızca üst limitler var).
Değişiklik hem şerit gölgelerine hem `limitChecker`'a aynı anda yansır.

**Dikkat:** sürüklenme ve kolektif senaryoların bütün anlamı sapmanın limit
bandının içinde kalmasıdır. Limit daraltırsanız `npm test` kırmızıya döner —
bu kasıtlıdır.

### Yeni senaryo yazmak

`src/data/scenario_yeni.json` oluşturun, sonra
`src/engine/scenarioRunner.ts` içindeki `SCENARIOS` dizisine ekleyin.

```jsonc
{
  "id": "yeni",
  "name": "Kısa ad",
  "button": "Ne yaptığını söyleyen düğme metni",   // "Senaryo 1" YAZMAYIN
  "description": "İki cümlelik açıklama.",
  "model": "TCN-AE",
  "duration_s": 90,
  "timeline": [ /* adımlar */ ]
}
```

`t` değerleri saniye cinsinden ve senaryonun başlatıldığı ana göredir.

| Adım tipi | Alanlar | Ne yapar |
|---|---|---|
| `inject_drift` | `pid`, `duration_s`, `magnitude`, `max_abs_eng?` | `duration_s` boyunca 0'dan `magnitude`'a doğrusal rampa, sonra tutar |
| `inject_point` | `pid`, `magnitude`, `width_s` | tek örneklem tepe + iki omuz (Gauss) |
| `inject_collective` | `targets[]`, `duration_s`, `ramp_s`, `oscillation_hz`, `max_abs_eng?` | birden çok kanalda ilişkili kayma + salınım |
| `ai_score` | `pid`, `value` | AI skoru kilometre taşı; aralar doğrusal olarak dolar |
| `event` | `service`, `severity`, `pid`, `text`, `model?`, `confidence?` | ST[05] bildirimi + alarm kartı |
| `show_xai` | `level`, `asset`, `caption`, `model`, `top_channels[]`, `band?` | XAI panelinde ilgili seviyeyi yükler |
| `info` | `kind` (`note`/`stat`/`recommendation`), `title`, `text` | INFO paneline zaman damgalı operatör notu düşürür |

Senaryo kökünde isteğe bağlı `story` bloğu INFO panelinin hikâye alanlarını
besler: `headline`, `summary`, `cause`, `history {count, window,
mean_duration_s, trend}`, `recommendation {urgency: izle|planlı|acil, action,
steps[]}`. Yapısal kırılma buradan **okunmaz**; `src/engine/changePoint.ts`
hedef kanalı (ilk enjeksiyon adımının kanalı) CUSUM ile izler.

Kurallar:

- `severity` 0–3'tür ve `service` ile **tutarlı olmalıdır**:
  `0→[5,1]`, `1→[5,2]`, `2→[5,3]`, `3→[5,4]`. Bir birim testi bunu doğrular.
- `max_abs_eng`, enjeksiyon etkin olduğu sürece mühendislik değerini
  `±max_abs_eng` aralığına kelepçeler. Sapmanın limit içinde kalması gereken
  senaryolarda kullanın.
- `event` ve `show_xai` adımları bir kez tetiklenir. Enjeksiyon adımları ise
  sürekli değerlendirilir, sıralamaları önemsizdir.
- Senaryo bittikten 30 saniye sonra enjeksiyonlar ve AI skorları nominale
  yumuşakça döner, sonra çalıştırıcı kendini kapatır.

Yeni senaryo eklediğinizde `src/engine/limitChecker.test.ts` içine ne bekliyorsanız
onu yazın — sürüklenme sınıfı senaryolar için `serviceCounts.get('12,12') === 0`,
sıçrama sınıfı için `> 0`.

### XAI görsellerini koymak

`src/assets/xai/` klasörüne bildiriden alınmış PNG'leri bırakın. Beklenen dosya
adları [o klasördeki README](src/assets/xai/README.md) içinde listelidir. Farklı
ad kullanacaksanız senaryo dosyalarındaki `show_xai.asset` alanını güncelleyin.

Görseller derleme sırasında tek dosya çıktısına gömülür. PNG yokken panel `src/ui/xaiRender.ts` ile simüle
telemetriden hesaplanan etiketli çizimi gösterir; PNG konulunca o öne geçer.

Panelin görsel alanı yaklaşık 520×170 px'dir; yatay (geniş) görseller en iyi
oturur.

### Dünya mozaiğini güncellemek

GÜNCEL temasının zemini `src/assets/earth/gibs_current.jpg` dosyasıdır ve
pakete gömülü gelir. TLE'lerle aynı idiom: **derleme zamanı** çekilir, çalışma
zamanında açılışta ağ isteği yapılmaz.

```bash
npm run imagery
```

Betik (`scripts/fetch-imagery.mjs`) dünden başlayıp üç güne kadar geri yürür ve
bir günü ancak **dört** koşulu birden sağlarsa kabul eder: `Data-Present: true`,
dosya ≥ 400 kB, ilk baytlar `FF D8 FF`, ve Türkiye kırpması ≥ 5 kB. Neden dördü
birden:

- **Boyut tabanı** aynı günün yarım kalmış mozaiğini eler. Ölçülen: aynı gün
  263 kB (eksik kaplama), bir önceki gün 609 kB (tam).
- **Sihirli bayt** kontrolü, otel/salon wifi'sindeki *captive portal*'ın 200 ile
  döndürdüğü HTML sayfasını yakalar.
- **Türkiye kırpması** günlük üretimdeki *eksik şeridi* yakalar. Bu, boyut
  tabanının **yakalayamadığı** durumdur: ölçülen bir örnekte (2026-03-13)
  Avrupa–Ortadoğu–Afrika'yı kaplayan dev bir boşluk vardı, ama dosya 521 kB ile
  tabanı geçiyordu. Kürede Türkiye'nin üstünde siyah bir kama ile demoya çıkmak
  kabul edilemez. Denetim kod çözücü gerektirmez: aynı günün Türkiye kırpması
  ayrıca istenir ve boş (düz siyah) bir bölge JPEG'de neredeyse hiç yer
  kaplamaz — dolu günler ~28 000 bayt, boşluklu gün 908 bayt.

Hiçbir gün geçerli gelmezse betik sıfırdan farklı çıkar ve **mevcut dosyalara
dokunmaz** — elde çalışan bir görüntü varken onu bozmak, hiç görüntü
olmamasından kötüdür. Betik bilerek `build`e bağlanmamıştır; bağlansaydı
derleme internet ister, CI ve offline hikâyesi çökerdi.

Yanındaki `gibs_current.json` alım tarihini taşır; arayüzdeki "13 Eylül 2026
günlük mozaik" etiketi oradan gelir. Bir birim testi bu dosyanın biçimini ve
katman adını doğrular, yani yarım yazılmış bir çekim CI'da yakalanır.

**Sunumdan önce:** `npm run imagery && npm run build`.

### Uydu kataloğunu güncellemek

TLE'ler `src/data/tle.txt` içinde standart üç satırlık biçimdedir (ad + iki
satır), arka arkaya. Tazelemek için Celestrak'tan yeni kayıtları çekip dosyayı
değiştirin — **derleme zamanı** bir işlemdir, çalışma zamanında ağ isteği
yapılmaz:

```bash
curl -s "https://celestrak.org/NORAD/elements/gp.php?NAME=TURKSAT&FORMAT=tle"
```

Yeni bir uydu eklemek için TLE'sini `tle.txt`'e, meta verisini
`src/data/satellites.json` içindeki `satellites` dizisine ekleyin:

```jsonc
{ "norad": "56178", "name": "İMECE", "group": "obs",
  "operator": "TÜBİTAK UZAY", "mission": "Yer gözlem" }
```

`satellites.json` yalnızca **işletici ve görev türünü** tanımlar. Fırlatma
yılı, yörünge sınıfı (LEO/MEO/GEO), periyot, eğim ve GEO istasyon tutumu
göstergesi **TLE'den hesaplanır** — bu dosyada iddia edilmez (yönerge §0: bir
alanın karşılığını bilmiyorsan ekrana koyma).

İstasyon tutumu göstergesi şöyle türetilir: bir GEO uydusunun eğimi 0.5°'nin
altında ve ortalama hareketi bir yıldız gününe (1.0027379 devir/gün) eşitse
uydu aktif olarak tutuluyordur. TÜRKSAT 1B, 1C ve 2A bu testten geçemez —
eğimleri 9°–14°'ye sürüklenmiştir — ve listede `yörünge tutumu yok` olarak
görünür. Bu bir iddia değil, TLE'nin kendisinden okunan bir sonuçtur.

Katalog kapsamı: Celestrak genel kataloğunda hâlâ yörünge kaydı bulunan Türk
uyduları. Yörüngeden düşmüş küçük uydular (UBAKUSAT, BeEagleSat, HAVELSAT,
Grizu-263A) katalogda bulunmadığı için listede yoktur.

Açılışta seçili gelen uydu `satellites.json` içindeki `default_norad` ile
belirlenir. **Uyarı:** GEO uydusunda AOS/LOS geçişi olmaz — üst şerit bu durumda
`sürekli görünür` yazar. Geçiş dinamiği göstermek istiyorsanız LEO bir uydu
seçin; varsayılan İMECE'dir.

### Dünya zeminini değiştirmek

Zemin dokusu `src/components/GlobeView.tsx` içindeki `buildEarthTexture()`
tarafından açılışta üretilir: 4096×2048 bir canvas'a önce kara dolgusu, sonra
Türkiye dolgusu, sonra ülke sınırları, sonra kıyı çizgisi, en son Türkiye
anahattı çizilir. Renkler aynı dosyadaki `TEX_COLORS` bloğundadır.

Doku koordinatları `toVec` ile tutarlı olacak şekilde türetilmiştir:
`px = (lon + 180) / 360 × genişlik`, standart eşdikdörtgen düzen. Dikkat:
`toVec` doğu boylamını **−Z**'ye düşürür; three.js sağ el sistemidir ve kamera
dışarıdan baktığı için ancak böyle doğu ekranda sağda kalır. +Z alınırsa küre
ayna görüntüsü olur (ilk sürümde bu hata vardı). Kontrol: varsayılan kamerada
Türkiye tuvalin tam ortasındadır ve Ege Denizi Türkiye'nin **solunda** kalır.

Daha yüksek çözünürlüklü Natural Earth verisi (50m) kullanılabilir ama tek
dosya çıktısını ~500 kB büyütür; kürenin ekrandaki boyutunda kazanç sınırlı
kaldığı için 110m'de kalındı.

### Yer istasyonunu değiştirmek

`src/data/mib.json` içindeki `ground_station` bloğundadır: enlem, boylam,
yükseklik ve minimum yükselti açısı. Görüş konisi yarıçapı bu açıdan ve
uydunun anlık irtifasından hesaplanır.

### Görev saati ve pencere ayarları

`src/engine/missionClock.ts`:

| Sabit | Varsayılan | Anlamı |
|---|---|---|
| `SPEED_OPTIONS` | `1, 10, 30, 60, 300, 600` | üst şeritteki hız düğmeleri |
| `PREFILL_S` | `600` | açılışta önceden doldurulan geçmiş (ve şerit penceresi) |
| `BASE_PERIOD_S` | `1` | temel telemetri örnekleme periyodu |

Görev epoğu ve OBT ofseti `mib.json` içindedir (`epoch`, `obt_offset_s`).

### Renkler ve tipografi

Palet **tek yerde** tanımlıdır: `src/ui/a11y.ts` (`BASE`, yüksek kontrast ve
renk görme varyantları). Buradan `src/index.css` `:root` değişkenleri (Tailwind
sınıfları `rgb(var(--ops-x) / <alpha-value>)` ile okur) ve `src/ui/colors.ts`
`COLOR` nesnesi (canvas ve three.js çizimleri) çalışma zamanında beslenir.
`index.css` içindeki varsayılan değerler yalnızca ilk boyama içindir; bir renk
değiştirilecekse `a11y.ts` ve `index.css` `:root` birlikte güncellenir.

| Rol | Renk | Kullanım |
|---|---|---|
| Nominal | soğuk yeşil `#2FBF87` | limit içinde |
| Yumuşak limit | amber `#D9A02B` | yumuşak bant ihlali |
| Orta şiddet | turuncu `#EF7B3A` | yalnızca alarm kuyruğunda, ESA-ADB şiddet 2 |
| Sert limit | kırmızı `#E85A6E` (önce `#E24A5F`; panel zemininde 5.0:1, WCAG AA) | sert bant ihlali, ESA-ADB şiddet 3 |
| **AI tespiti** | mor `#A184F5` | AI kaynaklı alarm, türetilmiş parametre |
| Zemin | `#0E1419` | saf siyah değil — projektörde bantlaşmasın |

Mor ayrımı demonun ana mesajını taşır; başka bir role vermeyin.

Tüm sayısal telemetri tek aralıklı fonttadır ve `font-variant-numeric:
tabular-nums` ile hizalanır. Yeni bir sayı alanı eklerken `num` sınıfını
kullanın, yoksa rakam genişliği oynar.

### Arayüz tazeleme ve başarım

`src/App.tsx` içinde `UI_INTERVAL_MS = 66` (~15 Hz). Sekme arka plana alınırsa
`requestAnimationFrame` durur ve görev saati de durur — bu kasıtlıdır. Geri
dönüldüğünde saatin ileri fırlamaması için tek turda işlenen gerçek süre
`MAX_DT_MS = 500` ile kelepçelenir.

Küre kendi `requestAnimationFrame` döngüsünde çalışır ve store'u doğrudan okur;
React yeniden çizimlerine bağlı değildir.

### Hata ayıklama

Geliştirme derlemesinde tarayıcı konsolundan store'a erişebilirsiniz
(dağıtım derlemesinde bu kanca yoktur):

```js
__azs.getState().sim
```

Faydalı alanlar: `clock.missionT`, `activeScenario`, `scenarioProgress`,
`buffers`, `alarms`, `serviceCounts`, `packetCount`.

Senaryoyu elle adım adım ilerletmek için:

```js
for (let i = 0; i < 130; i++) __azs.getState().tick(1000);
```

---

## 8. Standart eşlemesi

| Ekrandaki şey | Kaynak |
|---|---|
| Space Packet birincil başlığı (3/1/1/11/2/14/16 bit) | CCSDS 133.0-B-2 |
| CUC zaman damgası (4 oktet kaba + 2 oktet ince) | CCSDS 301.0-B |
| PUS-C ikincil başlığı, ST[03] / ST[05] / ST[12] | ECSS-E-ST-70-41C |
| Packet Error Control (CRC-16-CCITT, poly `0x1021`, init `0xFFFF`) | ECSS-E-ST-70-41C |
| MIB parametre tanımı, kalibrasyon eğrisi, limitler | ECSS-E-ST-70-31C |
| SLE RAF durum göstergesi | CCSDS 911.1 |
| Kanal adları (`ch_42`, `ch_75`) | ESA-ADB (anonimleştirilmiş) |
| Önem derecesi 0–3 ↔ `TM[5,1..4]` | ESA-ADB ↔ ECSS eşlemesi |
| Kıta çizgileri, ülke sınırları | Natural Earth 110m, kamu malı |
| Uydu TLE'leri | Celestrak GP (celestrak.org), son yayınlanmış kayıtlar |
| Ülke poligonları ve Türkçe adlar | Natural Earth 110m admin_0, `NAME_TR` |
| Fiziki zemin görüntüsü | NASA Blue Marble Next Generation, Aralık 2004, kamu malı |
| 2B harita izdüşümü | eşdikdörtgen (plate carrée), Natural Earth / NASA BMNG ile aynı doku |
| Alarm detayı: `TM[5,x]` alanları, PMON tanımı, `TM[12,12]` alanları | ECSS-E-ST-70-41C §6.5, §6.12 |
| Alarm detayı: OOL bilgisi, operasyonel sonuç, alarm bağlamı | ECSS-E-ST-70-11C |
| Alarm yaşam döngüsü (raised → ack → cleared), operatör kaydı ≠ TC | ECSS-E-ST-70C |
| Prosedür biçimi (FOP kimliği, aciliyet, adımlar — demo tanımı) | ECSS-E-ST-70-32C |
| Erişilebilirlik: renk yedekleme, okunabilirlik | ECSS-E-ST-10-11C, ISO 9241-171, ISO 11064, WCAG 2.2 AA |

Yalnızca **ST[03], ST[05], ST[12]** kullanılır; başka servis numarası yoktur.

Paket sekans sayacı APID başına ayrı tutulur ve 16383'te sarar. Mesaj tipi
sayacı APID + servis + alt tip üçlüsü başına ayrıdır.

Ücretsiz erişim: CCSDS → `public.ccsds.org`, ECSS → `ecss.nl`

---

## 9. Testler

```bash
npm test
```

94 test, altı dosyada: `src/engine/limitChecker.test.ts` (30), `src/ui/gibs.test.ts` (32), `src/engine/fleet.test.ts` (18), `src/engine/reedSolomon.test.ts` (5), `src/engine/spectral.test.ts` (4), `src/engine/changePoint.test.ts` (5).

| Ne doğrulanıyor | Neden önemli |
|---|---|
| Sürüklenmede `ch_42` **beş şiddet kademesinin hepsinde** NOMİNAL kalır, `AI_SCORE_SS3` sert eşiği aşar | demonun ana iddiası |
| Kolektif sapmada üç kanal da tek tek NOMİNAL kalır | ikinci senaryonun iddiası |
| Nokta anomalisinde `ch_11` sert limiti aşar ve `TM[12,12]` üretilir | limit kontrolünün gerçekten çalıştığı |
| Aynı senaryo aynı seriyi üretir | tekrarlanabilirlik |
| Senaryo **kesirli** bir görev saatinde başlatılsa da aynı sonucu verir | canlı uygulamada düğmeye basma anı ondalıklıdır |
| Birincil başlık bit yerleşimi ve `Packet Data Length = uzunluk − 1` | CCSDS uyumu |
| PEC gerçekten CRC-16-CCITT | ECSS uyumu |
| Sekans sayacı APID başına artar, 16383'te sarar | kabul kriteri |
| Yalnızca ST[03]/ST[05]/ST[12] kullanılır | kabul kriteri |
| Senaryo dosyalarındaki `service` ↔ `severity` tutarlılığı | yanlış `TM[5,x]` etiketini önler |
| Bir uyduya enjekte edilen anomali diğerinin kuyruğuna düşmez | uydu başına hafızanın ana iddiası |
| Her alarm kendi uydusunun NORAD'ıyla damgalanır (ST[12], ST[05], CUSUM) | filo kuyruğunun doğru atfı |
| Uydu değişimi ortak görev saatini geri almaz | tek yer istasyonu, tek UTC |
| Aynı referans model farklı NORAD'da farklı gerçekleme üretir | uydu başına tohumlama |
| Tuzsuz örnek bugünkü tek uydulu akışı birebir üretir | eski eşik testlerinin geçerliliği |
| Uyanış hafızayı korur, canlı durumu sıfırlar | anomali hafızasının tanımı |
| Uyanışın ilk canlı örneği sahte limit alarmı üretmez | `limits.reset()` sırası |
| Görüntüleme yolları uyuyan uyduyu var etmez | tembel yaratma (başarım) |
| GIBS tarih seçimi UTC dünü verir (ay/yıl/artık gün sınırları, yerel saat tuzağı) | yanlış gün istenirse mozaik yarım gelir |
| Anlık görüntü URL'i `BBOX=-90,-180,90,180` ve `EPSG:4326` ile birebir kurulur | enlem-önce sırası kolay ters yazılır |
| Eksik kaplama (263 kB) elenir, tam mozaik (609 kB) kabul edilir | ölçülen iki gerçek vaka sabit olarak |
| Zaman aşımı, HTTP hatası ve eksik başlık doğru ayrışır | salon wifi'sinde asılı kalmamak |
| Gömülü `gibs_current.json` biçimi ve katman adı doğru | yarım yazılmış çekimi CI yakalar |
| Türkiye'nin üstü boş olan gün elenir (908 bayt ↔ 28 000 bayt) | eksik şeritle demoya çıkmamak; boyut tabanı bunu yakalamaz |

---

## 10. Kabul kriterleri

| Kriter | Durum |
|---|---|
| İnternetsiz makinede açılıyor, **açılışta** ağ isteği yok | ✅ tek dosya çıktı, sistem fontları, doğrulandı. Tek istisna operatörün elle bastığı GÜNCEL `↻` düğmesidir; basılmazsa hiçbir istek çıkmaz (§10 madde 6) |
| Parametreler `mib.json`'dan geliyor, bileşende sabit değer yok | ✅ |
| Sekans sayacı APID başına artıyor, 16383'te sarıyor | ✅ birim test |
| Sadece ST[03], ST[05], ST[12] | ✅ birim test |
| Önem derecesi ↔ `TM[5,x]` eşlemesi | ✅ birim test |
| Sürüklenmede limit NOMİNAL, AI alarmda | ✅ birim test, 5 şiddet kademesi |
| Aynı düğmeye basınca aynı anomali | ✅ birim test, kesirli başlangıç dahil |
| XAI görselleri bildiriden alınmış gerçek çıktılar | ⚠️ PNG'ler konulmadı; yerine **simüle veriden hesaplanan, etiketli** çizim (bkz. sapma 4) |
| Ham ve mühendislik değer yan yana | ✅ |
| `SİMÜLE VERİ` rozeti sürekli görünür | ✅ sağ üst köşe |
| 1920×1080'de kaydırma çubuğu yok | ✅ ölçüldü: 1920×1080 tam |
| Senaryo 90 saniyede tamamlanıyor | ✅ 1× hızda (bkz. sapma 1) |

### Belgelenen sapmalar

**1. Senaryo süresi ve hız çarpanı.** Yönerge "90 saniyede tamamlanıyor (600×
hızda)" diyor. 600× hızda 90 saniye 15 görev saatine denk gelir; bir anomali bu
ölçekte izlenemez. Senaryolar 90 **görev saniyesi** uzunluğunda tasarlandı ve
senaryo başlatıldığında hız otomatik olarak 1×'e alınıyor — böylece senaryo
gerçekten 90 saniyede, izlenebilir hızda tamamlanıyor. 600× çarpanı küre
içindir.

**2. Sürüklenme büyüklüğü.** Yönergedeki örnek `magnitude: 4.5` değeri `ch_42`
yumuşak limitini (±3.0) aşardı ve §6.3'ün "limit NOMİNAL kalmalı" kısıtını
bozardı. §6.3 kısıtı kazandı: taban büyüklük 1.3, enjeksiyona ayrıca
`max_abs_eng` kelepçesi kondu, birim testi tüm şiddet kademelerinde doğruluyor.

**5. Reed-Solomon kodlaması.** Şartname çerçeve kodlamasını ve RS'yi kapsam
dışı bırakır. Ekibin CADU görünümü talebiyle RS(255,223) kodlayıcısı gerçekten
yazıldı: CCSDS alanı (F(x)=x⁸+x⁷+x²+x+1), üreteç g(x)=∏(x−α^{11j}), j=112..143,
interleave 5. Birim testler kodlanan sözcüklerin 32 sendromunun sıfır olduğunu
doğrular. **Sınır:** CCSDS'in Berlekamp dual-basis simge gösterimi uygulanmaz,
geleneksel taban kullanılır; bu yüzden tel üstündeki kontrol baytları standart
kodlayıcının çıktısıyla bit-bit aynı değildir. Lejandda "geleneksel taban",
alt bilgide "dual-basis dönüşümü uygulanmadı" yazar.

**4. Sentetik XAI çizimleri.** Şartname yeniden çizilmiş grafik istemez.
Ekibin talebiyle, gerçek PNG konulana kadar panel konsolun kendi telemetrisinden
hesaplanan artık/katkı/ısı haritası çizimlerini gösteriyor. Hazır resim değil,
canlı hesap; simülasyon uyarısı üst şeritteki `SİMÜLE VERİ` rozetiyle
taşınıyor. PNG konulduğu anda öncelik ona geçer. Kanıtların `top_channels` alanı da gerçekten
enjekte edilen kanallarla eşitlendi ki iddia ile hesap çelişmesin.

**6. Uydu başına anomali hafızası ve tek MIB.** Şartname §11 "ikinci bir uydu
misyonu"nu kapsam dışı bırakır. Ekip talebiyle katalogdaki 32 uydunun her biri
artık **kendi alarm kuyruğuna ve anomali hafızasına** sahip; senaryo her zaman
**seçili uyduya** enjekte edilir. Gerçek uyduların uçuş MIB'leri kamuya açık
olmadığı için her uydu, AZS-DEMO referans parametre setinin NORAD ile
tohumlanmış bir **örneğini** koşar: izler uydudan uyduya farklıdır ama hiçbir
gerçek uyduya uydurma SCID veya uydurma parametre adı atanmaz (§0). Ekran bunu
üç yerde açıkça yazar: katalog başlığı (`telemetri: AZS-DEMO referans modeli ·
NORAD tohumlu`), üst şerit (`model AZS-DEMO`) ve alarm detayının STANDART
sekmesindeki `Telemetri kaynağı` satırı.

**Yalnızca seçili uydu telemetri üretir.** 32 uydunun tamamını canlı koşturmak
açılışta 32×600 ön-doldurma adımı ve karede 32 kat paket üretimi demekti.
Seçilmemiş uydu uykudadır (kare başına maliyeti sıfır); geri seçildiğinde
*kaldığı yerden değil, güncel görev saatinden* devam eder. Uyanışta alarmlar,
bildirimler, koşu sayaçları ve servis sayaçları **korunur**; tampon, paketler,
XAI kanıtı ve varsa koşan senaryo sıfırlanır. Kısa bir ara (≤ 10 görev saniyesi)
senaryoyu düşürmez — kazara tıklayıp geri dönen operatör anomalisini
kaybetmesin diye. Alarm kuyruğunun `TÜM FİLO` sekmesi ve kataloğun satır
rozetleri, bakılmayan uydudaki anomalinin gözden kaçmasını önler; kuyruk
altbilgisi kaç uydunun örneklendiğini yazar ki boş bir filo kuyruğu "hiçbir
uyduda anomali yok" diye okunmasın.

**7. GÜNCEL zemin teması ve §1.** Yönerge §1 "hiçbir çalışma zamanı ağ
isteği" der. GÜNCEL teması bu kuralı **tek ve denetimli** bir noktada esnetir:
mozaik pakete gömülü geldiği için tema açılışta ağa çıkmaz; ağa çıkan yegâne
kod yolu operatörün bastığı `↻` düğmesidir. Yani "açılışta sıfır ağ isteği"
iddiası harfiyen doğru kalır ve DevTools ile yanlışlanamaz.

Başarısızlık hiçbir şeyi bozmaz: 8 saniyelik zaman aşımı, tek `try/catch`
(CORS, DNS, çevrimdışı, iptal, bozuk JPEG), ve hata hâlinde **pikseller hiç
değişmez** — gömülü mozaik ekranda kalır, lejandda Türkçe sebep görünür
("ağa ulaşılamadı", "zaman aşımı"). `navigator.onLine === false` ise istek hiç
atılmaz.

Görüntü `createImageBitmap` ile çözülür: köken kirletmediği için canvas WebGL'e
güvenle yüklenir. GÜNCEL canvas'ı 2048×1024'tür (kaynak da öyle — 4096'ya
germek var olmayan bilgiyi uydururdu) ve **nesne olarak tekdir**: tazeleme aynı
canvas'ın içine yeniden çizer, böylece hem doku önbelleği hem three.js dokusu
bayatlayamaz.

**3. Kanal adları.** `ch_42` ve `ch_75` yönergede geçtiği gibi bırakıldı.
Konsolun dolu görünmesi için ESA-ADB adlandırma şemasına uygun `ch_11`, `ch_12`,
`ch_58` eklendi. Bildirinizde gerçekten geçen kanallarla değiştirmek isterseniz
tek dokunulacak yer `src/data/mib.json`'dır.

---

## 11. Sorun giderme

**Ekran donmuş görünüyor / saat ilerlemiyor.** Sekme arka planda ya da pencere
gizli. Tarayıcılar bu durumda `requestAnimationFrame`'i durdurur. Pencereyi öne
getirin.

**Senaryo düğmesine bastım, bir şey olmadı.** Senaryo 90 saniyeye yayılır; ilk
AI kilometre taşı 18–30. saniyededir. Durum bandındaki skor değerini izleyin.

**Geliştirme sırasında senaryo yarıda kesiliyor.** Herhangi bir dosyayı
kaydetmek Vite'ın sayfayı yeniden yüklemesine ve simülasyonun sıfırlanmasına yol
açar. Senaryoyu test ederken dosya kaydetmeyin, ya da `dist` derlemesini
kullanın.

**XAI panelinde bildiri görseli yerine çizim görünüyor.** Beklenen PNG
`src/assets/xai/` altında yok; panel simüle veriden hesaplanan çizimi
gösteriyor (yan sütunda dosya yolu yazar). Bildiri görselini koyup yeniden
derleyin.

**1920×1080 dışında bir çözünürlükte açtım, düzen bozuk.** Konsol 1920×1080 için
tasarlandı ve kaydırma yoktur. Daha küçük ekranlarda tarayıcı yakınlaştırmasını
düşürün (`Ctrl` + `-`).

**Küre siyah.** WebGL kapalı ya da GPU hızlandırma yok. Tarayıcıda
`chrome://gpu` ile kontrol edin. Küre olmadan da demo ayakta durur.

---

## 12. Kapsam dışı

Aşağıdakiler bilinçli olarak yapılmadı; her biri demonun ana mesajını sulandırır:

gerçek ML modeli ve çıkarım · backend, veritabanı, WebSocket, kullanıcı hesabı ·
transfer frame kodlaması, Reed-Solomon, RF katmanı · playback/geri sarma modu ·
çoklu operatör, alarm atama, yorum yazma · çalışmayan katman aç/kapa düğmeleri ·
terminator çizgisi, **dekoratif** bulut dokusu, atmosfer efekti · ikinci ekran ·
karanlık/aydınlık tema geçişi · uydu başına **gerçek** MIB (katalogdaki her uydu
AZS-DEMO referans modelinin bir örneğini koşar, bkz. §10 madde 6) · aynı anda
birden fazla uydudan canlı telemetri

---

**Son hatırlatma:** Şüphede kaldığında az yap, doğru yap. Bu demoda eksik bir
özellik affedilir; yanlış bir standart etiketi affedilmez.
