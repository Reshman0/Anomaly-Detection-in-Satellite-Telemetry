# Tanıtım turu seslendirmeleri

Bu klasöre konan `<adım-id>.mp3` dosyaları derlemeye gömülür (tek dosya build, internet gerekmez).
Dosya yoksa adım `tourScript.ts` içindeki `durationMs` kadar sürer; altyazı her durumda ekranda.

Her iki tur da `giris.mp3` ile başlar, `kapanis.mp3` ile biter (ortak kapak adımları).

Tam görünüm turu (`G` tam ekranda, ya da `?tur`) dosya adları, sırasıyla:

- `giris.mp3`
- `ust-serit.mp3`
- `dunya.mp3`
- `senaryo.mp3`
- `gecis.mp3`
- `paket.mp3`
- `telemetri.mp3`
- `alarm.mp3`
- `durum.mp3`
- `xai.mp3`
- `bilgi.mp3`
- `bildirim.mp3` *(ses bekleniyor)*
- `erisim.mp3` *(ses bekleniyor)*
- `kapanis.mp3`

Özet görünüm turu (`G` Özet modunda, ya da `?tur=ozet`) dosya adları, sırasıyla:

- `giris.mp3`
- `oz-durum.mp3`
- `oz-senaryo.mp3`
- `oz-parametre.mp3`
- `oz-filo.mp3`
- `oz-telemetri.mp3`
- `oz-durum-alarm.mp3`
- `oz-dunya.mp3`
- `oz-xai.mp3`
- `oz-oneri.mp3`
- `kapanis.mp3`

Sesler 1,10 kat hızlandırıldı (ffmpeg `rubberband=tempo=1.10`, perde korunur; `atempo` 1,2'de bazı kelimeleri yutuyordu). 1x kopyalar `ses-ham/hiz-1x/`'te.

Ses, adım süresini belirler: dosya bitince tur bir sonraki panele geçer. Her ses ~12 saniyeyi
geçmemeli; turlar "Yavaş sürüklenme" senaryosunun zamanlamasına bağlı (durum/kontrast adımında
NOMİNAL / ALARM görünmesi için).

## Mevcut sesler

Konuşma metinleri `metin.json` dosyasında (ekrandaki altyazıdan farklı: kısaltmalar açık yazılır).
Sesler Google AI Studio'da Gemini TTS ile iki parça hâlinde seslendirildi (tam tur ve Özet tur,
paragraflar arasında ~1–3 sn sessizlik). Parçalar sessizliklerden bölündü, baş/son sessizliği
kırpıldı, ses düzeyi -16 LUFS'a eşitlendi; başa 0,3 sn, sona 0,6 sn sessizlik eklendi;
mp3 64 kbps mono. Süreler 7,5–12,4 sn. Çalışma zamanı ağ gerektirmez.

Ham kayıtlar (`ses-ham/parca1.wav`, `ses-ham/parca2.wav`) ve önceki çevrimdışı Piper sesleri
(`ses-ham/piper-yedek/`) depoya eklenmez.

Metni değiştirirseniz: ilgili paragrafı AI Studio'da aynı sesle yeniden seslendirip aynı adla
mp3 olarak koyun. `scripts/tur_ses_uret.py` çevrimdışı Piper sesiyle üretir ve buradaki
dosyaların üzerine yazar.

Ses dosyalarinin basindaki ve sonundaki sessizlik kirpildi (kayipsiz kesim): adim,
anlatici son kelimeyi bitirdigi anda sonrakine geciyor. Yeni bir ses eklerken ayni
sekilde kirpin, yoksa adimlar arasinda olu zaman olusur.
