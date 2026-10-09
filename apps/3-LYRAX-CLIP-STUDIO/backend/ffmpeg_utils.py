import os
import shutil


def get_ffmpeg_exe():
    """Use Termux's native FFmpeg build on Android; otherwise use imageio-ffmpeg."""
    configured = os.environ.get("IMAGEIO_FFMPEG_EXE")
    if configured:
        return configured

    prefix = os.environ.get("PREFIX", "")
    is_termux = prefix.startswith("/data/data/com.termux/") or bool(os.environ.get("TERMUX_VERSION"))
    if is_termux:
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg:
            return system_ffmpeg

    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise RuntimeError(
            "imageio-ffmpeg is required outside Termux; install the app requirements or set IMAGEIO_FFMPEG_EXE."
        ) from exc
    return imageio_ffmpeg.get_ffmpeg_exe()
