"""File-extension deny-list applied before graph node creation.

Motivation: binary/image/archive/media/font/office files produce no
meaningful symbol graph. Excluding them here avoids wasted parse work
and keeps the graph focused on code+config artefacts.
"""
from __future__ import annotations

import os

DENIED_EXTENSIONS: frozenset[str] = frozenset({
    # Raster images
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".ico",
    ".heic", ".heif", ".raw", ".cr2", ".nef", ".arw", ".orf", ".rw2", ".dng",
    # Vector images
    ".svg",
    # Archives
    ".zip", ".tar", ".gz", ".tgz", ".bz2", ".tbz2", ".7z", ".rar",
    ".xz", ".lz", ".lzma", ".cab", ".jar", ".war", ".ear", ".iso", ".dmg",
    # Executables / object / intermediate
    ".exe", ".dll", ".so", ".dylib", ".a", ".o", ".obj", ".lib", ".bin",
    ".com", ".pdb", ".ilk", ".exp", ".class", ".pyc", ".pyo", ".wasm",
    # Media — video
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv",
    ".mpg", ".mpeg", ".m4v",
    # Media — audio
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".opus",
    # Fonts
    ".ttf", ".otf", ".woff", ".woff2", ".eot", ".fon",
    # Databases
    ".sqlite", ".sqlite3", ".db", ".mdb", ".accdb",
    # Binary / proprietary documents
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".pdf", ".rtf", ".odt", ".ods", ".odp",
})


def is_denied(path: str) -> bool:
    """Return True if the path's file extension is in the deny-list.

    Case-insensitive. Files without an extension (Dockerfile, Makefile,
    LICENSE, README) are never denied — they remain eligible for plugin lookup.
    Multi-dot paths use the final extension: ``archive.tar.gz`` → ``.gz`` (denied).
    """
    _, ext = os.path.splitext(path)
    if not ext:
        return False
    return ext.lower() in DENIED_EXTENSIONS
