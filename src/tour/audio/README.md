# Tanıtım turu seslendirmeleri

Bu klasöre konan `<adım-id>.mp3` dosyaları derlemeye gömülür (tek dosya build, internet gerekmez).
Dosya yoksa adım `tourScript.ts` içindeki `durationMs` kadar sürer; altyazı her durumda ekranda.

Tam görünüm turu (`G` tam ekranda, ya da `?tur`) dosya adları, sırasıyla:

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

Özet görünüm turu (`G` Özet modunda, ya da `?tur=ozet`) dosya adları, sırasıyla:

- `oz-durum.mp3`
- `oz-senaryo.mp3`
- `oz-parametre.mp3`
- `oz-filo.mp3`
- `oz-telemetri.mp3`
- `oz-durum-alarm.mp3`
- `oz-dunya.mp3`
- `oz-xai.mp3`
- `oz-oneri.mp3`

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
