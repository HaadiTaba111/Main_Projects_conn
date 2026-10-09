"""Shared audio analysis helpers for audio-reactive effects."""
from __future__ import annotations

import subprocess
from typing import Iterable

import numpy as np

from backend.ffmpeg_utils import get_ffmpeg_exe

BANDS_HZ = {
    "bass": (20.0, 250.0),
    "mid": (250.0, 4000.0),
    "treble": (4000.0, 11025.0),
}


def detect_beat_events(
    samples: Iterable[float],
    sample_rate: int = 22050,
    sensitivity: float = 1.35,
    min_gap_sec: float = 0.22,
    min_energy: float = 5.0,
    window_size: int = 512,
) -> list[dict]:
    """Find transient energy rises and classify each by frequency band.

    The baseline uses preceding windows only (not the current sample), avoiding
    the old first-transient blind spot. Each band has its own refractory window,
    so a strong bass transient does not suppress a simultaneous treble transient.
    """
    try:
        sample_rate = max(1, int(sample_rate))
        window_size = max(32, int(window_size))
        hop_size = window_size
        signal = np.asarray(samples, dtype=np.float64).reshape(-1)
        if signal.size < window_size:
            return []
        num_windows = 1 + (signal.size - window_size) // hop_size
        num_bins = window_size // 2 + 1
        nyquist = sample_rate / 2.0
        upper_hz = min(nyquist, 11025.0)
        band_bins = {}
        for band, (low_hz, high_hz) in BANDS_HZ.items():
            lo = max(1, int(low_hz / nyquist * num_bins))
            hi = min(num_bins, int(min(high_hz, upper_hz) / nyquist * num_bins))
            if hi <= lo:
                hi = min(num_bins, lo + 1)
            band_bins[band] = (lo, hi)

        histories = {band: [] for band in BANDS_HZ}
        last_times = {band: -1e9 for band in BANDS_HZ}
        history_max = 40
        beats = []
        sensitivity = max(1.01, float(sensitivity))
        min_gap_sec = max(0.0, float(min_gap_sec))
        min_energy = max(0.0, float(min_energy))

        for window_index in range(num_windows):
            start = window_index * hop_size
            chunk = signal[start:start + window_size]
            if chunk.size != window_size:
                break
            magnitude = np.abs(np.fft.rfft(chunk))
            current_time = (start + window_size / 2.0) / sample_rate
            for band, (lo, hi) in band_bins.items():
                values = magnitude[lo:hi]
                energy = float(np.mean(values)) if values.size else 0.0
                history = histories[band]
                baseline = float(np.mean(history)) if history else 0.0
                threshold = max(min_energy, baseline * sensitivity, baseline * 0.05 + min_energy)
                if (
                    energy > threshold
                    and current_time - last_times[band] >= min_gap_sec
                ):
                    energy_ratio = energy / baseline if baseline > 1.0 else max(1.0, energy / max(min_energy, 1.0))
                    tier = 3 if energy_ratio >= sensitivity * 1.55 else 2 if energy_ratio >= sensitivity * 1.15 else 1
                    beats.append({
                        "t": round(current_time, 3),
                        "tier": tier,
                        "energy_factor": round(max(0.7, min(1.8, energy_ratio)), 4),
                        "freq_band": band,
                    })
                    last_times[band] = current_time
                history.append(energy)
                if len(history) > history_max:
                    del history[0]

        beats.sort(key=lambda event: (event["t"], event["freq_band"]))
        return beats
    except (TypeError, ValueError, FloatingPointError):
        return []


def detect_beat_times(
    audio_file_path: str,
    sensitivity: float = 1.35,
    min_gap_sec: float = 0.22,
    sample_rate: int = 22050,
) -> list[dict]:
    """Decode an audio file to mono PCM and return audio-reactive event records."""
    try:
        ffmpeg_exe = get_ffmpeg_exe()
        command = [
            ffmpeg_exe,
            "-v", "error",
            "-i", str(audio_file_path),
            "-f", "s16le",
            "-acodec", "pcm_s16le",
            "-ac", "1",
            "-ar", str(int(sample_rate)),
            "pipe:1",
        ]
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if result.returncode != 0 or not result.stdout:
            return []
        pcm = np.frombuffer(result.stdout, dtype=np.int16).astype(np.float64)
        return detect_beat_events(pcm, sample_rate, sensitivity, min_gap_sec)
    except Exception as exc:  # A missing/invalid optional audio input must not abort rendering.
        print(f"Beat detection error (non-fatal): {exc}")
        return []
