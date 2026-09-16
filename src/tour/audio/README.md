# Tanıtım turu seslendirmeleri

Bu klasöre konan `<adım-id>.mp3` dosyaları derlemeye gömülür (tek dosya build, internet gerekmez).
Dosya yoksa adım `tourScript.ts` içindeki `durationMs` kadar sürer; altyazı her durumda ekranda.

Dosya adları (tourScript.ts sırasıyla):

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

Metin olarak her adımın `caption` ve `look` alanları kullanılabilir. Ses, adım süresini belirler:
dosya bitince tur bir sonraki panele geçer. Dosyaları kısa tutun (tek dosya build boyutu büyür).
