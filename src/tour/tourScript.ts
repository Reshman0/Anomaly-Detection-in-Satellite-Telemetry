import { useConsole } from '../store';
import { SCENARIOS } from '../engine/scenarioRunner';

/**
 * Tanitim turu senaryosu (stant / kiosk).
 *
 * Her adim bir paneli one cikarir. Hedef, panelin kok elemanindaki
 * `data-tour="<id>"` niteligidir.
 *
 * Zamanlama: suruklenme senaryosu "senaryo" adiminda baslar (90 s surer).
 * Sonraki adimlar oyle siralandi ki telemetri adiminda AI skoru yukselmis,
 * alarm / durum / XAI adimlarinda alarm ve kanit olusmus olur. Adim
 * suresi = gecis animasyonu (~3.5 s) + `durationMs` (veya ses suresi).
 * Sirayi ya da sureleri degistirirken durum adiminin hala
 * "NOMINAL / ALARM" gosterdigini kontrol edin.
 *
 * Seslendirme: `src/tour/audio/<id>.mp3` dosyasi varsa derlemeye gomulur ve
 * adim ses bitince ilerler. Yoksa `durationMs` kadar beklenir; altyazi her
 * durumda ekrandadir.
 */
export interface TourStep {
  id: string;
  /** Ilerleme seridi ve hedef etiketi icin kisa ad. */
  short: string;
  title: string;
  caption: string;
  /** "Buraya bakin" ipucu: panelde gozun arayacagi tek sey. */
  look: string;
  /** Ses dosyasi yoksa (veya tarayici otomatik oynatmayi engellerse) adim suresi. */
  durationMs: number;
  /** Adima girerken calisir (ornegin senaryo baslatmak). */
  onEnter?: () => void;
}

const AUDIO = import.meta.glob('./audio/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function audioFor(id: string): string | undefined {
  return AUDIO[`./audio/${id}.mp3`];
}

function startDrift() {
  const st = useConsole.getState();
  const drift = SCENARIOS.find((s) => s.id === 'drift');
  st.setSpeed(1);
  if (drift) st.runScenario(drift);
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'ust-serit',
    short: 'Üst şerit',
    title: 'Üst şerit',
    caption:
      'Görev adı, yer saati (UTC) ile uydu saati (OBT), yer istasyonu bağlantısı ve seçili uydu. Operatör “şu an uyduya erişebiliyor muyum?” sorusunun cevabını buradan okur.',
    look: 'AOS / LOS geri sayımı: uyduyla bağlantı penceresinin açılmasına ya da kapanmasına kalan süre.',
    durationMs: 10000,
  },
  {
    id: 'dunya',
    short: 'Dünya',
    title: 'Dünya görünümü',
    caption:
      'Türk uydularının gerçek yörünge verisiyle (TLE + SGP4) hesaplanan anlık konumları, yer izleri ve Kahramankazan istasyonunun görüş alanı. 3B küre ile 2B harita arasında geçilebilir.',
    look: 'Soldaki liste katalogdaki Türk uyduları; küre üzerinde her birinin şu anki konumu.',
    durationMs: 11000,
  },
  {
    id: 'senaryo',
    short: 'Senaryo',
    title: 'Senaryo konsolu',
    caption:
      'Gösterim için anomali senaryoları: ani sıçrama, yavaş sürüklenme ve çok kanallı bozulma. Senaryolar gösterim amaçlı kurgulanmıştır; model başarımı ayrıca gerçek uçuş verisiyle ölçülmüştür.',
    look: 'Şu an “Yavaş sürüklenme” çalışıyor: düğmenin altındaki çubuk senaryonun ilerleyişi.',
    durationMs: 9000,
    onEnter: startDrift,
  },
  {
    id: 'gecis',
    short: 'Geçiş',
    title: 'Geçiş planı',
    caption:
      'Uydunun istasyonun üzerinden sıradaki geçişleri: ne zaman görünür olacağı, ne kadar kalacağı ve ne kadar yükseğe çıkacağı.',
    look: 'Soldaki daire gökyüzü: antenin geçiş boyunca izleyeceği yol.',
    durationMs: 9000,
  },
  {
    id: 'paket',
    short: 'Paket',
    title: 'Paket denetleyici',
    caption:
      'Telemetrinin ham hâli: uzay standartlarına (CCSDS / ECSS) uygun paket, çerçeve ve hata düzeltme katmanları. Tıklanınca katman katman açılır.',
    look: '“PEC OK”: paketin hata denetimi (CRC) tuttu, veri bozulmadan geldi.',
    durationMs: 9000,
  },
  {
    id: 'telemetri',
    short: 'Telemetri',
    title: 'Telemetri şeritleri',
    caption:
      'Uydunun düzenli gönderdiği sağlık verisi. Her kanalda ölçülen değer ve uyarı / kritik limitleri; ◆ işaretli şeritler ise yerde hesaplanan yapay zekâ anomali skoru.',
    look: 'En alttaki ◆ AI_SCORE şeritleri: kanal değerleri limit içindeyken skor yükseliyor.',
    durationMs: 11000,
  },
  {
    id: 'alarm',
    short: 'Alarm',
    title: 'Alarm kuyruğu',
    caption:
      'Oluşan alarmlar şiddetine göre sıralanır. Bir karta tıklanınca standart (ECSS) alanlar, limit bilgisi ve operatörün izleyeceği prosedür açılır.',
    look: '“◆ AI türetilmiş” kartlar: sabit limit değil, anomali skoru tetikledi.',
    durationMs: 10000,
  },
  {
    id: 'durum',
    short: 'Durum',
    title: 'Sabit limit ve yapay zekâ yan yana',
    caption:
      'Solda uydunun kendi limit kontrolü, sağda anomali skoru. Yavaş sürüklenmede limit hâlâ NOMİNAL derken skor alarma geçer: sorun, limit aşılmadan önce görünür.',
    look: 'Solda NOMİNAL, sağda ALARM: projenin ana fikri bu farkta.',
    durationMs: 11000,
  },
  {
    id: 'xai',
    short: 'XAI',
    title: 'Model neden alarm verdi?',
    caption:
      'Açıklanabilirlik paneli üç seviyede cevap verir: hangi anda, hangi kanalda ve hangi frekans yapısında sapma var. Operatör yalnızca alarmı değil, gerekçesini görür.',
    look: 'Üç sekme: nerede sapmış, hangi kanal, ısı haritası. Sağda sorumlu kanal ve model.',
    durationMs: 12000,
  },
  {
    id: 'bilgi',
    short: 'Bilgi',
    title: 'Operatör bilgi paneli',
    caption:
      'Senaryo boyunca operatöre bağlam veren notlar ve bildirimler: tespit, geçmişte benzer olaylar, yapısal kırılma ve önerilen eylem.',
    look: '“Öneri” satırı: operatöre önerilen bir sonraki adım.',
    durationMs: 9000,
  },
];
