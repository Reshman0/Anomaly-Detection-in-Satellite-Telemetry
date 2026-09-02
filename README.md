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
> Buna karşılık ekrandaki **her etiket ve her sayı gerçek bir kaynağa dayanır:**
> kanal tablosu ESA-ADB'nin resmî `channels.csv` dosyasından, paketler gerçek
> CCSDS/PUS yapısından, Dünya modeli WGS84'ten. Demonun inandırıcılığı buradan
> gelir.

**Sahnede sunacaksanız [§5 Demoyu sunma](#5-demoyu-sunma) bölümüne bakın** —
akışın nasıl yönetildiği ve alarm anında neden kendiliğinden durduğu oradadır.

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
ekibinin bildirisine dayanır. Kanal adları ve alt sistem atamaları ESA-ADB'nin
resmî `channels.csv` tablosundan alınmıştır; veri seti anonimleştirilmiş olduğu
için mühendislik birimi yoktur (`—`), alt sistemler işleviyle değil numarasıyla
anılır ve `TEMP_BATTERY_1` gibi uydurma isimler kullanılmaz.

---

## 2. Bu demo ne yapar, ne yapmaz

| Yapar | Yapmaz |
|---|---|
| Gerçek CCSDS 133.0-B paketleri üretir (bit alanları test edilir) | PyTorch/ONNX yüklemez, çıkarım yapmaz |
| MIB limitleriyle **gerçekten** limit kontrolü hesaplar | RF, SLE bağlantısı, çerçeve kodlaması kurmaz |
| SGP4 ile gerçek yörünge yayılımı yapar | Ağdan TLE, doku veya font çekmez |
| Senaryoları tohumlu ve tekrarlanabilir oynatır | Playback/geri sarma, çoklu operatör, hesap yönetimi sunmaz |
| Tek dosya, internetsiz çalışır | Backend, veritabanı, WebSocket kullanmaz |

Konsolun üzerinde bu uyarıyı taşıyan bir rozet yoktur; üst şerit dar ve rozet
orayı sıkıştırıyordu. Uyarı bu README'nin başında durur, sunumu yapan kişinin
sözlü olarak söylemesi beklenir.

---

## 3. Kurulum ve çalıştırma

Bu bölüm **sıfırdan** kurulum içindir; depoyu ilk kez alan biri baştan sona
takip edebilir.

### 3.1 Ön koşullar

| Gereken | Sürüm | Kontrol komutu |
|---|---|---|
| **Node.js** | 20 veya üzeri | `node -v` |
| **npm** | 10 veya üzeri (Node ile gelir) | `npm -v` |
| **Git** | herhangi bir güncel sürüm | `git --version` |
| **Tarayıcı** | WebGL destekli (Chrome, Edge, Firefox) | `chrome://gpu` |

Geliştirme sırasında Node 22.18 ve npm 10.9 kullanıldı.

Node kurulu değilse [nodejs.org](https://nodejs.org) üzerinden LTS sürümünü
kurun. Kurulum sırasında **internet bağlantısı gerekir** — projenin
"internetsiz çalışır" özelliği çalışma zamanı içindir, kurulum için değil.

### 3.2 Depoyu alın

```bash
git clone https://github.com/Reshman0/Anomaly-Detection-in-Satellite-Telemetry.git
```

```bash
cd Anomaly-Detection-in-Satellite-Telemetry
```

Çalışılacak dala geçin (dal adı sizde farklıysa onu yazın):

```bash
git checkout feat/sade-konsol-ve-gercek-xai
```

Hangi dalların olduğunu görmek için:

```bash
git branch -a
```

### 3.3 Bağımlılıkları kurun

```bash
npm install
```

Bu komut `node_modules/` klasörünü oluşturur (birkaç yüz MB) ve birkaç dakika
sürebilir. `node_modules` depoya dahil değildir, her makinede yeniden kurulur.

### 3.4 Kurulumu doğrulayın

Devam etmeden önce testleri çalıştırın:

```bash
npm test
```

**42 testin 42'si geçmelidir.** Geçmiyorsa aşağı inmeyin; §11'deki sorun giderme
adımlarına bakın.

### 3.5 Geliştirme sunucusunu başlatın

```bash
npm run dev
```

Terminalde çıkan adresi tarayıcıda açın — varsayılan olarak
<http://localhost:5173>. Konsol açılır açılmaz **10 dakikalık geçmişle dolu**
gelir; boş grafik görmezsiniz.

Durdurmak için terminalde `Ctrl` + `C`.

### 3.6 Demo için tek dosya derleyin

```bash
npm run build
```

Derlemeyi yerelde denemek isterseniz:

```bash
npm run preview
```

### 3.7 Demo makinesine götürme

`npm run build` **tek bir `dist/index.html` dosyası** üretir (~1,1 MB). Tüm
JavaScript, CSS, MIB, senaryolar, TLE, kıta çizgileri ve XAI görselleri bu
dosyanın içine gömülüdür.

- İnternetsiz bir dizüstünde `file://` ile doğrudan açılır.
- Basit bir statik sunucuyla da çalışır.
- **Sıfır çalışma zamanı ağ isteği.** Doğrulandı: sayfa yüklenirken yalnızca
  `index.html`'in kendisi istenir, başka hiçbir istek çıkmaz.
- Fontlar sistem fontlarıdır (Consolas / Segoe UI ve yedekleri); indirilen font
  yoktur.

Demo makinesine götürmek için **sadece `dist/index.html` dosyasını kopyalamak
yeterlidir.** Bir USB bellek yeter; `node_modules` gerekmez, Node kurulu olmasına
bile gerek yoktur.

> `dist/` klasörü `.gitignore` içindedir, yani depoda **derlenmiş dosya
> bulunmaz.** Demo dosyasını her makinede `npm run build` ile üretirsiniz.

### 3.8 Komutların tamamı

| Komut | Ne yapar |
|---|---|
| `npm install` | Bağımlılıkları kurar (bir kez) |
| `npm run dev` | Geliştirme sunucusu, sıcak yeniden yükleme ile |
| `npm test` | 50 birim testini koşar |
| `npm run build` | `dist/index.html` tek dosyasını üretir |
| `npm run preview` | Derlenmiş çıktıyı yerelde sunar |

---

## 4. Ekranda ne var

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ÜST ŞERİT  Görev · UTC · Uydu saati · Hız · Bağlantı · İstasyon · Geçiş  │
├───────────────────────┬──────────────────────────────────────────────────┤
│                       │  UYDUDAN GELEN ÖLÇÜMLER                          │
│   UYDUNUN ANLIK       │  ch_42 ch_44 ch_46 ch_74 ch_75                   │
│   KONUMU              │  ◆ Yapay zeka · alt sistem 3 / alt sistem 5      │
│   (WGS84 küre)        ├──────────────────────────────────────────────────┤
│                       │  AŞAĞI İNEN VERİ PAKETİ  (ham baytlar)           │
│                       ├──────────────────────────────────────────────────┤
│                       │  DURUM  Uçuş yazılımı: NOMİNAL │ Yapay zeka: ALARM│
│                       │         Yanlış alarm: 0                          │
├───────────────────────┼───────────────────────────┬──────────────────────┤
│  SENARYO KONSOLU      │  ALARM KUYRUĞU            │  MODEL NEDEN ALARM   │
│                       │                           │  VERDİ               │
└───────────────────────┴───────────────────────────┴──────────────────────┘
```

> **Dil tercihi.** Konsol kısa süreli, karma bir izleyiciye gösterilmek üzere
> tasarlandı. Bu yüzden ekranda **standart kısaltması bırakılmadı**: `ST[12]`,
> `TM[3,25]`, `APID`, `SLE RAF`, `OBT`, `AOS/LOS`, `Grad-CAM` gibi terimlerin
> tamamı düz Türkçeye çevrildi ya da kaldırıldı. Standart uyumu kaybolmadı —
> paketler hala gerçek CCSDS/PUS yapısıyla üretiliyor ve birim testleriyle
> doğrulanıyor (§8, §9); yalnızca **ekranda** gösterilmiyor.

**Üst şerit.** Görev adı, UTC, uydu saati (aralarında `-0,734 s` sabit ofset —
zaman korelasyonu izlenimi), hız çarpanı, uydu bağlantısı (`VERİ AKIYOR` /
`BEKLEMEDE`), yer istasyonu, sonraki geçişe kalan süre, anlık yükselti açısı ve
yörünge verisinin yaşı.

**Uydunun anlık konumu.** `satellite.js` ile gerçek SGP4 yayılımı, WGS84
elipsoidi üzerine çizilir (§8). Sürükleyerek döndürülür, tekerlekle
yakınlaştırılır. Uydunun izlediği yol, yer istasyonunun uyduyu görebildiği alan
ve görüş anında istasyon–uydu vektörü çizilir. Terminator, bulut katmanı,
atmosfer parıltısı **bilerek yoktur.**

**Uydudan gelen ölçümler.** Başlıkta *"ESA veri setindeki 76 kanaldan
çalışmamızda kullanılan 5'i"* yazar — izleyici gördüğünün bir alt küme olduğunu
bilir. Her satırda parametre adı, **sayaç değeri ve gerçek değer yan yana**,
limit bandı arka planda gölge olarak. `◆` işaretli satırlar yerde hesaplanan
yapay zeka skorlarıdır; uydudan inen ham karşılıkları olmadığı için sayaç
sütununda `—` görünür.

**Aşağı inen veri paketi.** Son üretilen paketin ham bayt dizisi, alt sistem
adı, sıra numarası, boyu ve bütünlük doğrulaması. Bit alanı ızgarası **ekrandan
kaldırıldı** — kısa sürede okunamıyordu ve jargonla doluydu. Alanların tamamı
arka planda üretilmeye ve test edilmeye devam ediyor.

**Duraklatma bandı.** Akış durduğunda ekranın ortasında, durum bandının hemen
üstünde büyük mor bir `AKIŞ DURAKLATILDI · devam etmek için tıklayın` bandı
belirir. Üst şeride konmadı: şerit dokuz alanla dolu ve böyle bir düğme onu
~60 px genişletiyordu (şeritte o sırada rozet de vardı).

**Durum bandı.** Solda uçuş yazılımının sabit limit kontrolü, sağda yapay zeka
tespiti. İkisi ayrıştığında sağ taraf morla vurgulanır ve `← KONTRAST` etiketi
belirir. Altında **yanlış alarm sayacı** vardır: hiçbir anomali enjekte
edilmemişken bir yapay zeka skorunun eşiği aşması sayılır — sabit değer değil,
ölçümdür. Yanında bildirinin dürüstlük notu yazılıdır (300 s alan bilgisi
kuralı).

**Senaryo konsolu.** Üç senaryo düğmesi, beş kademeli şiddet kaydırıcısı ve
nominal akışa dönüş. Düğmede yalnızca senaryonun adı yazar; **fare düğmenin
üzerine gelince açıklama yanda, büyük puntoyla bir kartta belirir**, fare
çekilince kaybolur. Açıklamalar düğmenin içindeyken dar sütuna sığmıyor ve
`...` ile kırpılıyordu.

Kart çizildikten sonra yüksekliği ölçülüp tasarım yüzeyinin içine kelepçelenir:
en alttaki düğmenin uzun açıklaması aksi halde yüzeyin altından taşıyordu
(ölçüldü: kolektif senaryoda 42 px).

**Alarm kuyruğu.** Şiddet sözcüğü, zaman damgası, sorumlu parametre, alt sistem,
model adı ve güven skoru. Sol kenar rengi kaynağı söyler: yeşil/amber/kırmızı =
uçuş yazılımının limit kontrolü, mor = yerde çalışan yapay zeka modeli.

**Model neden alarm verdi.** Üç adımlı sekme: *1 · Nerede saptı*, *2 · Hangi
kanal*, *3 · Isı haritası*. Senaryo yeni bir kanıt ürettiğinde panel
**kendiliğinden o adıma geçer**; sunucunun sekmeye tıklaması gerekmez. Elle
seçilen adım, yeni kanıt gelene kadar korunur.

Görseller **çalışma anında çizilir** ([`XaiFigure.tsx`](src/components/XaiFigure.tsx)),
çünkü senaryo hedef kanalı her koşuda havuzdan seçer: sabit dosyalarla görseldeki
kanal ile ekrandaki kanal birbirini tutmazdı. Çizilen şey senaryonun kendi
enjeksiyon tanımından türer, gerçek bir model çıktısı değildir.

Üç adım **bilerek üç farklı görsel dil** kullanır — 1) çizgi grafiği: modelin
beklediği seri, ölçülen seri ve aradaki fark, 2) çubuk: kanal başına pay,
3) ısı haritası: tüm kanallar × zaman. Aynı veriyi iki kez gösterirlerse panelin
üç adımı birbirinden ayırt edilemiyor.

**Görsele tıklayınca ekranın ortasında büyütülmüş hali açılır**; sağ üstteki
`✕`, `Esc` ya da dışarı tıklamak kapatır. Şekiller 2240×840 (2×) üretildiği
için büyütülmüş görünümde bile küçültülerek gösterilirler — yani yukarı
ölçeklenip bulanıklaşmazlar. Büyütme katmanı, ölçeklenen tasarım yüzeyinin
**dışında** çizilir; içinde olsaydı CSS `transform` görseli de ölçekler ve
netliği bozardı.

---

## 5. Demoyu sunma

### 5.1 Akış nasıl yönetilir

Konsol **elle sürülür.** Anomaliyi siz enjekte edersiniz, hızı siz seçersiniz,
ne zaman devam edileceğine siz karar verirsiniz.

Tek otomatik davranış şudur: **modelin gerekçesi tamamen ekrana geldikten
sonra akış kendiliğinden durur.** Üst şeritte mor bir `DURAKLATILDI` düğmesi
belirir; anlatmayı bitirdiğinizde ona ya da bir hız düğmesine tıklayarak akışı
sürdürürsünüz.

Senaryo üç kanıt adımı üretir — *nerede saptı → hangi kanal → ısı haritası*.
Duraklatma bunların **sonuncusu** düştüğü anda gerçekleşir. Böylece donan
karede açıklamanın tamamı hazır olur; sunucu üç adımı tek nefeste gezebilir.

Ara adımlarda durulmaz: her kanıtta durmak sunumu kesik kesik yapardı.
**Senaryo koşusu başına yalnızca bir kez** durulur.

| Davranış | Ayrıntı |
|---|---|
| Ne zaman durur | Üçüncü ve son XAI kanıtı (ısı haritası) ekrana geldiği anda |
| Kaç kez durur | Senaryo başına **bir** kez |
| Nasıl devam edilir | Ekranın ortasındaki `AKIŞ DURAKLATILDI` bandı **veya** herhangi bir hız düğmesi (`1×` / `60×` / `600×`) |
| Duraklamışken | Görev saati de durur — şeritler, paket akışı, küre, hepsi donar |

Ölçülen davranış — her üç senaryoda da tek duraklama, üç kanıt yüklü, panel
3. adımda:

| Senaryo | Duraklama | Yüklü kanıt | Panelin gösterdiği | Durum bandı |
|---|---|---|---|---|
| Nokta anomalisi | 1 | L1 + L2 + L3 | 3 · Isı haritası | NOMİNAL / NOMİNAL |
| Yavaş sürüklenme | 1 | L1 + L2 + L3 | 3 · Isı haritası | **NOMİNAL / ALARM ← KONTRAST** |
| Kolektif sapma | 1 | L1 + L2 + L3 | 3 · Isı haritası | **NOMİNAL / ALARM ← KONTRAST** |

> **Nokta anomalisi hakkında bir not.** Sıçrama anlıktır: üçüncü kanıt düştüğü
> ana kadar hem limit hem de yapay zeka skoru nominale dönmüş olur, bu yüzden
> donan karede durum bandı `NOMİNAL / NOMİNAL` görünür. Alarm kartları kuyrukta,
> ısı haritası panelde durur — ama kontrast karesi bu senaryoda donmuş halde
> yakalanmaz. Bu senaryonun işlevi zaten kontrastı kurmak değil, klasik limit
> kontrolünün **gerçekten çalıştığını** göstermektir; kontrast diğer iki
> senaryoda kurulur. Sıçrama anında donmasını isterseniz `src/store.ts`
> içindeki duraklatma koşulunu bu senaryo için kademe yükselişine bağlamak
> yeterli.

### 5.2 Senaryolar

Senaryo düğmesine basıldığında hız otomatik olarak `1×`'e düşer ve senaryo
**90 saniyede** tamamlanır. Üç senaryoyu bu sırayla oynatın — birlikte tek bir
argüman kurarlar.

### 1. Nokta anomalisi · Spectrogram-AE · ~35 s

`ch_44` kanalında kısa bir sıçrama. Sıçrama sert limiti aşar; `limitChecker`
gerçekten hesap yaptığı için uçuş yazılımı da alarm üretir ve alarm kuyruğuna
**yeşil/kırmızı kenarlı** bir limit kartı düşer.

> **Söylenecek:** "Klasik limit kontrolü bunu zaten yakalıyor. Burada bir
> sorunumuz yok."

Bu senaryonun işlevi, sonraki ikisinde limit kontrolünün sessiz kalmasının bir
hata değil **bulgu** olduğunu kanıtlamaktır.

### 2. Yavaş sürüklenme · TCN-AE · ~72 s — **demonun kritik anı**

`ch_75` kademeli olarak kayar ama limit bandının içinde kalır. Şerit gözle
görülür şekilde sürüklenirken durum bandının solu `NOMİNAL` kalır; sağdaki yapay
zeka skoru önce uyarı, sonra alarm eşiğini aşar ve üç mor kart sırayla düşer:
*izlemede* → *anomali adayı* → *yüksek şiddet*. Sağdaki panel üç kanıt adımını
kendiliğinden sırayla açar.

> **Söylenecek:** "Uçuş yazılımı hala hiçbir şey görmüyor — çünkü teknik olarak
> haklı, parametre limitin içinde. Model ise sapmayı 30 saniye önce yakaladı ve
> hangi kanaldan geldiğini söylüyor."

Durum bandındaki `NOMİNAL / ALARM` kontrastını gösterin. **Projenin tüm
gerekçesi bu tek karededir.**

### 3. Kolektif sapma · TCN-AE · ~62 s

`ch_75`, `ch_42` ve `ch_74` birbiriyle ilişkili biçimde kayar — ikisi alt
sistem 3'ten, biri alt sistem 5'ten. Hiçbiri tek başına limit aşmaz; anomali
yalnızca çok değişkenli yapıda görünür. XAI paneli `ch_75`'i baskın katkı
olarak işaretler ve **iki modelin atfını yan yana koyar:** Spectrogram-AE
sapmanın %52,4'ünü alt sistem 5'e, TCN-AE %62,3'ünü alt sistem 3'e veriyor —
bildirinin kendi bulgusu.

> **Söylenecek:** "Burada tek tek bakınca hiçbir kanal anormal değil. Anormal
> olan aralarındaki ilişki — ve model kaynağı da teşhis ediyor."

### İpuçları

- **Şiddet kaydırıcısı** enjeksiyon büyüklüğünü ölçekler (`×0.7`–`×1.3`).
  Sürüklenme ve kolektif senaryolarda **en yüksek kademede bile** limit
  aşılmaz; bu birim testiyle garanti altındadır.
- Aynı düğmeye tekrar basmak **birebir aynı** anomaliyi üretir. Üretim tohumlu
  ve senaryo başlangıcı örneklem ızgarasına oturtulmuştur.
- `600×` hız çarpanı küre içindir: İMECE'nin ~98 dakikalık yörüngesi ~10
  saniyede tamamlanır, geçiş dinamiği görünür hale gelir. Telemetriyi bu
  hızda izlemeye çalışmayın.
- **Yanlış alarm sayacı** durum bandının altındadır ve nominal akış boyunca
  `0` kalır. Sunumda buna işaret etmek hikayenin "üstelik yanlış alarm
  üretmeden" maddesini kapatır.
- Uygulama açılırken şeritler **10 dakikalık geçmişle dolu gelir**; boş grafikle
  açılmaz.

---

## 6. Mimari

```
src/
  data/                 saf veri — kod yok
    mib.json            görev veritabanı: parametreler, limitler, kalibrasyon
    apid_table.json     APID tahsis tablosu
    scenario_*.json     nominal / point / drift / collective
    tle.txt             gömülü TLE
    land_110m.json      Natural Earth 110m kıta çizgileri (kamu malı)
  engine/               saf TypeScript — React'ten bağımsız
    types.ts            ortak tipler
    mib.ts              MIB yükleme, kalibrasyon (raw ↔ mühendislik)
    packetBuilder.ts    CCSDS birincil + PUS-C ikincil başlık + PEC
    missionClock.ts     görev saati, hız çarpanı, zaman biçimleme
    rng.ts              tohumlu rastgelelik (mulberry32 + Box-Muller)
    telemetrySource.ts  nominal seri üretimi + enjeksiyon
    limitChecker.ts     ST[12] sabit limit kontrolü  ← gerçekten hesaplar
    scenarioRunner.ts   senaryo zaman çizelgesi, şiddet ölçeklemesi
    earth.ts            WGS84 elipsoidi, jeodezik→ECEF, görüş konisi halkası
    orbit.ts            SGP4 yayılımı, geçiş anları, görüş konisi
    simulation.ts       hepsini birleştiren düzenleyici
    xaiFigures.ts       kanıt görsellerinin verisi (tohumlu, saf fonksiyonlar)
    *.test.ts           limitChecker / earth / xaiFigures birim testleri
  components/           arayüz (her panel bir dosya)
    XaiFigure.tsx       kanıt görselini canvas'a çizer
  ui/colors.ts          durum renkleri
  store.ts              zustand — tek `Simulation` örneği + tazeleme sayacı
  store.test.ts         XAI seviye ilerlemesi testleri
  App.tsx               1920×1080 tasarım yüzeyi + pencereye ölçekleme
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

`AI_SCORE_SS3` ve `AI_SCORE_SS5`, `mib.json` içinde tanımlı, **limitleri olan**,
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
kalan yüksekliği paylaşır, düzen kendini ayarlar.

> **Dikkat — şerit yükseklik bütçesi.** Panelde şeritler kalan yüksekliği eşit
> böler ve etiket sütunu **iki satırlıktır** (kimlik / sayaç + değer + durum).
> Şu anki 7 şerit ~46 px'lik satırlara oturuyor ve etiket içeriği 38 px; pay
> dar. Şerit ekler ya da etiket sütununa üçüncü bir satır koyarsanız içerik
> satıra sığmaz ve panel kırpar — en alttaki yapay zeka şeritleri yarım
> görünür. Böyle bir değişiklikten sonra şunu ölçün: satır yüksekliklerinin
> toplamı, şeritleri saran kapsayıcının yüksekliğini aşmamalı.

```jsonc
{
  "pid": "ch_43",                     // ESA-ADB channels.csv'de gerçekten var
  "description": "ESA-ADB alt sistem 5 kanalı 43",
  "subsystem": "SS5",                 // channels.csv'deki Subsystem ile eşleşmeli
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

### Kanıt görselleri

Görseller dosya değildir; panel açıldığında canvas'a çizilir.

- **Veri**: [`src/engine/xaiFigures.ts`](src/engine/xaiFigures.ts) — tohumlu ve
  saf fonksiyonlar, senaryonun enjeksiyon tanımından türetir. Aynı senaryo +
  aynı kanal her zaman aynı seriyi verir.
- **Çizim**: [`src/components/XaiFigure.tsx`](src/components/XaiFigure.tsx) —
  1120×420 tasarım biriminde çizer, panelde 2×, büyütülmüş görünümde 3×
  çözünürlükte yeniden çizilir (ölçekleme yok, metinler keskin kalır).

Hedef kanal her koşuda değiştiği için görsel de değişir: vurgulanan kanal
etiketi, baskın çubuk ve ısı haritasındaki parlak satır hep o koşuda seçilen
kanaldır. Bunu birim test garanti eder.

Bunlar **gerçek model çıktısı değildir**. Bildiriden alınmış gerçek çıktılar
elinize geçerse `XaiFigure` yerine görüntü basan bir bileşen koyabilirsiniz.

Şu an yerleştirilmiş yedi görselin künyesi (hangi notebook, hangi hücre) o
klasördeki README'dedir. Kolektif senaryo, 1. ve 3. adımda sürüklenme
senaryosuyla **aynı görseli paylaşır**: notebook'larda altı gerçek XAI şekli
var, demoda dokuz yuva; iki senaryo da TCN-AE kullandığı için uydurma görsel
üretmek yerine paylaşım tercih edildi.

### Uyduyu veya yer istasyonunu değiştirmek

TLE için `src/data/tle.txt` dosyasını üç satırlık biçimde (ad + iki satır)
güncelleyin. NORAD numarası, epok ve yörünge periyodu satırlardan otomatik
okunur.

**Uyarı:** GEO uydusunda (örn. TÜRKSAT 6A) AOS/LOS geçişi olmaz, uydu sabit
görünür. Geçiş dinamiği istiyorsanız LEO bir uydu seçin. Şu an İMECE
(NORAD 56178) kullanılıyor.

Yer istasyonu `src/data/mib.json` içindeki `ground_station` bloğundadır:
enlem, boylam, yükseklik ve minimum yükselti açısı. Görüş konisi yarıçapı bu
açıdan ve uydunun anlık irtifasından hesaplanır.

### Görev saati ve pencere ayarları

`src/engine/missionClock.ts`:

| Sabit | Varsayılan | Anlamı |
|---|---|---|
| `SPEED_OPTIONS` | `1, 60, 600` | üst şeritteki hız düğmeleri |
| `PREFILL_S` | `600` | açılışta önceden doldurulan geçmiş (ve şerit penceresi) |
| `BASE_PERIOD_S` | `1` | temel telemetri örnekleme periyodu |

Görev epoğu ve OBT ofseti `mib.json` içindedir (`epoch`, `obt_offset_s`).

### Renkler ve tipografi

Palet, **LIFT UP sunum şablonunun kendi renklerinden** türetildi
(`2025-2026 LIFT UP SUNUM SABLONU.pptx`), böylece konsol ile slaytlar aynı
aileden görünür. Şablonun çalışan renkleri: lacivert zemin `#082549` / `#1A2433`,
LIFT UP kırmızısı `#C23735` / `#DD140D`, altın `#D6A361`, yeşil `#449E4A`,
açık griler `#D9DEE5` / `#ADB4C9` / `#4A5560`, mor `#3E2A56`.

Palet iki yerde tanımlıdır ve **senkron tutulmalıdır**:
`tailwind.config.js` (arayüz sınıfları) ve `src/ui/colors.ts` (canvas ve
three.js çizimleri).

| Rol | Renk | Kaynağı |
|---|---|---|
| Nominal | yeşil `#449E4A` | şablondan birebir |
| Uyarı | altın `#D6A361` | şablondan birebir |
| Limit aşımı | kırmızı `#C23735` | şablondan birebir |
| **Yapay zeka tespiti** | mor `#9B7ACF` | şablonun `#3E2A56` moru, koyu zeminde okunacak parlaklığa açıldı |
| Metin / soluk / silik | `#D9DEE5` `#ADB4C9` `#5C6B80` | şablondan |
| Zemin / panel | `#071A2E` `#0D2842` | şablonun laciverdinden koyultuldu |

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
| Kanal adları ve alt sistem ataması | ESA-ADB Mission 1 `channels.csv` |
| Önem derecesi 0–3 ↔ `TM[5,1..4]` | ESA-ADB ↔ ECSS eşlemesi |
| Kıta çizgileri | Natural Earth 110m, kamu malı |
| Dünya modeli — elipsoit, jeodezik→ECEF | WGS84 (NIMA TR8350.2) |

Yalnızca **ST[03], ST[05], ST[12]** kullanılır; başka servis numarası yoktur.

Paket sekans sayacı APID başına ayrı tutulur ve 16383'te sarar. Mesaj tipi
sayacı APID + servis + alt tip üçlüsü başına ayrıdır.

Ücretsiz erişim: CCSDS → `public.ccsds.org`, ECSS → `ecss.nl`

---

## 9. Testler

```bash
npm test
```

42 test, üç dosyada: `src/engine/limitChecker.test.ts`,
`src/engine/earth.test.ts` ve `src/store.test.ts`.

| Ne doğrulanıyor | Neden önemli |
|---|---|
| Sürüklenmede `ch_75` **beş şiddet kademesinin hepsinde** NOMİNAL kalır, `AI_SCORE_SS3` alarm eşiğini aşar | demonun ana iddiası |
| Kolektif sapmada üç kanal da tek tek NOMİNAL kalır | ikinci senaryonun iddiası |
| Nokta anomalisinde `ch_44` sert limiti aşar ve `TM[12,12]` üretilir | limit kontrolünün gerçekten çalıştığı |
| Aynı senaryo aynı seriyi üretir | tekrarlanabilirlik |
| Senaryo **kesirli** bir görev saatinde başlatılsa da aynı sonucu verir | canlı uygulamada düğmeye basma anı ondalıklıdır |
| Birincil başlık bit yerleşimi ve `Packet Data Length = uzunluk − 1` | CCSDS uyumu |
| PEC gerçekten CRC-16-CCITT | ECSS uyumu |
| Sekans sayacı APID başına artar, 16383'te sarar | kabul kriteri |
| Yalnızca ST[03]/ST[05]/ST[12] kullanılır | kabul kriteri |
| Senaryo dosyalarındaki `service` ↔ `severity` tutarlılığı | yanlış olay raporu etiketini önler |
| WGS84 yarıçapları, jeodezik↔jeosentrik enlem farkı, görüş konisi halkası | Dünya modelinin kusursuz küreye geri dönmesini engeller |
| XAI seviyeleri kanıt geldikçe sırayla açılır, elle seçim ezilmez | sunumda panelin 1. adımda kalmasını önler |
| Duraklama, son kanıt düştükten sonra oluyor | donan karede açıklamanın tamamı hazır olur |
| Duraklamış akış ilerlemiyor; tıklayınca sürüyor | sunucunun anlatırken ekranın kaçmaması |
| Aynı kademede ikinci kez duraklamaz | ST[12] arka arkaya geçiş üretir; her birinde durmak sunumu keserdi |

---

## 10. Kabul kriterleri

| Kriter | Durum |
|---|---|
| İnternetsiz makinede açılıyor, ağ isteği yok | ✅ tek dosya çıktı, sistem fontları, doğrulandı |
| Parametreler `mib.json`'dan geliyor, bileşende sabit değer yok | ✅ |
| Sekans sayacı APID başına artıyor, 16383'te sarıyor | ✅ birim test |
| Üretilen paketlerde sadece ST[03], ST[05], ST[12] | ✅ birim test |
| Önem derecesi ↔ `TM[5,x]` eşlemesi | ✅ birim test |
| Sürüklenmede limit NOMİNAL, AI alarmda | ✅ birim test, 5 şiddet kademesi |
| Aynı düğmeye basınca aynı anomali | ✅ birim test, kesirli başlangıç dahil |
| XAI görselleri panelin üç adımıyla ve senaryoyla tutarlı | ✅ birim test: seçilen kanal enjeksiyon, alarm metni ve üç görselin tamamında aynı |
| Hedef kanal her koşuda havuzdan seçilir | ✅ birim test: havuzun her seçeneğinde limit garantisi korunuyor |
| Ekranda açıklanmamış jargon yok | ✅ ölçüldü: 28 terimden 0'a |
| Son kanıt (ısı haritası) çıktıktan sonra akış duruyor | ✅ birim test: üç senaryoda da duraklama anında 3/3 kanıt yüklü, panel 3. adımda |
| Senaryo başına yalnızca bir duraklama | ✅ birim test |
| Duraklamış akış ilerlemiyor, tıklayınca sürüyor | ✅ birim test (görev saati donuyor, hız düğmesi de devam ettiriyor) |
| Palet LIFT UP sunum şablonuyla aynı aileden | ✅ şablonun tema renklerinden türetildi, iki kaynak senkron |
| Yanlış alarm sayacı gerçek ölçüm | ✅ nominal akışta 0, enjeksiyon sırasında saymaz |
| Kanal listesi ESA-ADB `channels.csv` ile hizalı | ✅ 5 kanalın tamamı gerçek ve `Target=YES` |
| Dünya modeli WGS84 | ✅ birim test (`earth.test.ts`) |
| Sayaç ve gerçek değer yan yana | ✅ |
| Yedi şeridin tamamı kırpılmadan görünüyor | ✅ ölçüldü: satır toplamı 322 px ≤ kapsayıcı 325 px |
| Yapay zeka şeritleri nominal akışta da çiziliyor | ✅ ölçüldü: yedi şeritte de eşit yoğunlukta (~%3,1 yeşil piksel) |
| Duraklatma bandı üst şeridi taşırmıyor | ✅ ölçüldü: duraklıyken de yatay taşma 0 |
| Büyütülmüş XAI görseli net | ✅ 2240 px kaynak, ekranda 1178 px — küçültülerek gösteriliyor |
| Senaryo açıklamaları kırpılmıyor | ✅ düğmeden çıkarıldı; kart yüzeye kelepçeli, üç senaryoda da taşma yok |
| Üst şerit etiketleri hiç sarmaz | ✅ AOS/LOS geçişinde bile alan genişlikleri sabit |
| 1920×1080'de kaydırma çubuğu yok | ✅ ölçüldü: 1920×1080 tam |
| Her çözünürlükte panel taşması / üst üste binme yok | ✅ 1366×768, 1919×872, 1920×1080, 2560×1440 ölçüldü |
| Senaryo 90 saniyede tamamlanıyor | ✅ 1× hızda (bkz. sapma 1) |

### Belgelenen sapmalar

**1. Senaryo süresi ve hız çarpanı.** Yönerge "90 saniyede tamamlanıyor (600×
hızda)" diyor. 600× hızda 90 saniye 15 görev saatine denk gelir; bir anomali bu
ölçekte izlenemez. Senaryolar 90 **görev saniyesi** uzunluğunda tasarlandı ve
senaryo başlatıldığında hız otomatik olarak 1×'e alınıyor — böylece senaryo
gerçekten 90 saniyede, izlenebilir hızda tamamlanıyor. 600× çarpanı küre
içindir.

**2. Sürüklenme büyüklüğü.** Yönergedeki örnek `magnitude: 4.5` değeri `ch_75`
yumuşak limitini (±3.0) aşardı ve §6.3'ün "limit NOMİNAL kalmalı" kısıtını
bozardı. §6.3 kısıtı kazandı: taban büyüklük 1.3, enjeksiyona ayrıca
`max_abs_eng` kelepçesi kondu, birim testi tüm şiddet kademelerinde doğruluyor.

**3. Kanal adları — çözüldü.** İlk sürümde konsolu doldurmak için `ch_11`,
`ch_12`, `ch_58` uydurulmuştu ve `ch_42` yanlış alt sisteme atanmıştı. Kanal
listesi artık ESA-ADB'nin resmî `channels.csv` tablosuyla birebir hizalı:

| Kanal | Alt sistem | ESA-ADB `Target` |
|---|---|---|
| `ch_42`, `ch_44`, `ch_46` | subsystem_5 | YES |
| `ch_74`, `ch_75` | subsystem_3 | YES |

Gösterilen beş kanalın tamamı gerçek ve hepsi `Target=YES`, yani ESA-ADB'nin
değerlendirmeye aldığı kanallar. Alt sistem adları da veri setindeki gibi
anonim bırakıldı (`Alt sistem 3` / `Alt sistem 5`); ESA-ADB alt sistem işlevini
açıklamadığı için "Güç / Yönelim Kontrolü / Termal" gibi uydurma adlar
kullanılmıyor.

---

## 11. Sorun giderme

### Kurulum sırasında

**`npm install` hata veriyor.** Önce Node sürümünü kontrol edin (`node -v`);
20'nin altındaysa yükseltin. Sorun sürerse önbelleği ve klasörü temizleyip
yeniden deneyin:

```bash
npm cache clean --force
```

```bash
rm -rf node_modules package-lock.json && npm install
```

> Windows PowerShell'de silme komutu farklıdır:
> `Remove-Item -Recurse -Force node_modules, package-lock.json`

**`npm test` başarısız.** Kurulum eksik ya da yarım kalmış olabilir; `npm
install`'ı tekrar çalıştırın. Testler hala kırmızıysa çıktıdaki dosya adına
bakın: `limitChecker` senaryoların limit davranışını, `earth` Dünya modelini,
`store` XAI seviye ilerlemesini doğrular.

**`npm run dev` "port 5173 is in use" diyor.** Başka bir Vite süreci açık.
Kapatın ya da farklı port verin:

```bash
npm run dev -- --port 5174
```

**Sayfa boş, konsolda `does not provide an export named 'default'` yazıyor.**
Vite bir dosyayı yazılırken yakalayıp boş halde önbelleğe almış olabilir.
Dosyayı kaydedip sunucuyu yeniden başlatmak yeterlidir.

**`npm run build` çalıştı ama `dist/` yok.** `.gitignore` içinde olduğu için
depoda görünmez ama derleme sonrası diskte oluşur; `ls dist` ile bakın.

### Çalışma sırasında

**Ekran donmuş görünüyor / saat ilerlemiyor.** Sekme arka planda ya da pencere
gizli. Tarayıcılar bu durumda `requestAnimationFrame`'i durdurur. Pencereyi öne
getirin.

**Senaryo düğmesine bastım, bir şey olmadı.** Senaryo 90 saniyeye yayılır; ilk
AI kilometre taşı 18–30. saniyededir. Durum bandındaki skor değerini izleyin.

**Geliştirme sırasında senaryo yarıda kesiliyor.** Herhangi bir dosyayı
kaydetmek Vite'ın sayfayı yeniden yüklemesine ve simülasyonun sıfırlanmasına yol
açar. Senaryoyu test ederken dosya kaydetmeyin, ya da `dist` derlemesini
kullanın.

**XAI panelinde görsel çizilmiyor.** Kanıt yalnızca senaryo o adıma geldiğinde
oluşur; panelin sağ üstündeki sayaç kaç kanıtın hazır olduğunu söyler.

**Farklı bir çözünürlükte açtım.** Sorun değil. Konsol **1600×900'lük** sabit
bir tasarım yüzeyine çizilir ve bu yüzey pencereye sığacak şekilde tek parça
olarak ölçeklenir; en-boy oranı korunur, artan yer siyah bantla kapanır. Küçük
ekranda her şey orantılı olarak küçülür, büyük ekranda büyür — düzen bozulmaz,
panel sıkışmaz. Tarayıcı yakınlaştırmasıyla oynamanız gerekmez.

Yüzey bilerek küçük tutuldu (1920×1080 değil): **yüzey küçüldükçe aynı ekranda
her öğe büyür.** Sahnede arka sıralardan okunabilirlik için en etkili tek ayar
budur; her bileşenin puntosunu tek tek büyütmeye gerek kalmaz. Daha da
büyütmek isterseniz `src/App.tsx` içindeki `STAGE_W` / `STAGE_H` değerlerini
küçültün — ama alt satırın (`h-[252px]`) senaryo konsolunu kırpmadığını
kontrol edin.

**Küre siyah.** WebGL kapalı ya da GPU hızlandırma yok. Tarayıcıda
`chrome://gpu` ile kontrol edin. Küre olmadan da demo ayakta durur.

---

## 12. Kapsam dışı

Aşağıdakiler bilinçli olarak yapılmadı; her biri demonun ana mesajını sulandırır:

gerçek ML modeli ve çıkarım · backend, veritabanı, WebSocket, kullanıcı hesabı ·
transfer frame kodlaması, Reed-Solomon, RF katmanı · playback/geri sarma modu ·
çoklu operatör, alarm atama, yorum yazma · çalışmayan katman aç/kapa düğmeleri ·
terminator çizgisi, bulut dokusu, atmosfer efekti · ikinci bir uydu misyonu ya
da ikinci ekran · karanlık/aydınlık tema geçişi

---

**Son hatırlatma:** Şüphede kaldığında az yap, doğru yap. Bu demoda eksik bir
özellik affedilir; yanlış bir standart etiketi affedilmez.
