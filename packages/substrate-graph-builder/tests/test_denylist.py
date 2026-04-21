import pytest
from substrate_graph_builder.denylist import is_denied


@pytest.mark.parametrize("path", [
    "path/to/logo.png", "LOGO.PNG", "a/b/c.JPG", "x.webp", "vector.svg",
    "archive.zip", "bundle.tar.gz", "thing.7z", "sub/pkg.jar",
    "binary.exe", "lib.so", "obj.o", "foo.wasm", "mod.class", "x.pyc",
    "song.mp3", "movie.mp4", "cap.webm", "font.woff2", "cursive.ttf",
    "data.sqlite", "sheet.xlsx", "doc.pdf", "presentation.pptx",
])
def test_denied(path):
    assert is_denied(path), f"expected denied: {path}"


@pytest.mark.parametrize("path", [
    "src/main.py", "lib/foo.ts", "README.md", "Dockerfile",
    "Makefile", "LICENSE", "bundle.min.js", "plain.txt",
    "config.yaml", "notes.json", "schema.sql", "app.rs",
])
def test_allowed(path):
    assert not is_denied(path), f"expected allowed: {path}"


def test_multi_dot_final_extension_wins():
    assert is_denied("archive.tar.gz")
    assert not is_denied("bundle.min.js")


def test_case_insensitive():
    for ext in [".PNG", ".png", ".Png"]:
        assert is_denied(f"file{ext}")
