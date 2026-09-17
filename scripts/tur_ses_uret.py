"""Tanitim turu seslendirmelerini uretir (cevrimdisi, Piper TTS).

Kurulum (bir kez):
  pip install sherpa-onnx soundfile numpy
  # Ses modeli (Piper "fettah", Turkce, CC0 lisans):
  #   https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-tr_TR-fettah-medium.tar.bz2
  # indirip acin; klasoru --model ile verin.
  # MP3 icin PATH'te ffmpeg olmali.

Kullanim:
  python scripts/tur_ses_uret.py --model yol/vits-piper-tr_TR-fettah-medium
  python scripts/tur_ses_uret.py --model ... --only durum oz-durum   # yalnizca bazi adimlar

Metinler: src/tour/audio/metin.json. Ciktilar: src/tour/audio/<id>.mp3
"""
import argparse, json, os, subprocess, sys, tempfile

import numpy as np
import sherpa_onnx
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'src', 'tour', 'audio')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True, help='vits-piper-tr_TR-... klasoru')
    ap.add_argument('--speed', type=float, default=0.95, help='1 = normal, kucuk = yavas')
    ap.add_argument('--only', nargs='*', help='yalnizca bu adimlar')
    a = ap.parse_args()

    name = os.path.basename(os.path.normpath(a.model)).replace('vits-piper-', '')
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=os.path.join(a.model, name + '.onnx'),
                tokens=os.path.join(a.model, 'tokens.txt'),
                data_dir=os.path.join(a.model, 'espeak-ng-data'),
            ),
            num_threads=2,
        )
    ))

    texts = json.load(open(os.path.join(AUDIO, 'metin.json'), encoding='utf-8'))
    for sid, text in texts.items():
        if sid.startswith('_') or (a.only and sid not in a.only):
            continue
        g = tts.generate(text, sid=0, speed=a.speed)
        y = np.asarray(g.samples, dtype=np.float32)
        # Basta 0,3 s, sonda 0,6 s sessizlik: panel gecisleriyle nefes payi.
        sr = g.sample_rate
        y = np.concatenate([np.zeros(int(0.3 * sr), np.float32), y, np.zeros(int(0.6 * sr), np.float32)])
        y = y / max(1e-6, float(np.abs(y).max())) * 0.89
        with tempfile.TemporaryDirectory() as d:
            wav = os.path.join(d, 'a.wav')
            sf.write(wav, y, sr)
            out = os.path.join(AUDIO, sid + '.mp3')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '22050',
                            '-codec:a', 'libmp3lame', '-b:a', '48k', out], check=True)
        print(f'{sid:16s} {len(y) / sr:5.1f} s')


if __name__ == '__main__':
    sys.exit(main())
