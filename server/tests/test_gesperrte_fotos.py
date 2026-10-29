"""S-043 (29.10.2026): ein gesperrtes Foto ist auch ueber seine /media-URL nicht mehr abrufbar,
Entsperren holt es zurueck, Loeschen entfernt es auch aus der gesperrten Ablage."""
import secrets


def test_sperren_verschiebt_und_entsperren_holt_zurueck(tmp_path, monkeypatch):
    from app import media
    monkeypatch.setattr(media.settings, "media_dir", tmp_path / "media")
    monkeypatch.setattr(media.settings, "data_dir", tmp_path / "data")
    name = secrets.token_hex(4)
    (tmp_path / "media" / "photos").mkdir(parents=True)
    for n in (f"{name}.webp", f"{name}.t.webp"):
        (tmp_path / "media" / "photos" / n).write_bytes(b"x")
    url = f"/media/photos/{name}.webp"
    media.gesperrt_verschieben(url, True)
    assert not (tmp_path / "media" / "photos" / f"{name}.webp").exists()
    assert not (tmp_path / "media" / "photos" / f"{name}.t.webp").exists()
    assert (tmp_path / "data" / "gesperrte-medien" / "photos" / f"{name}.webp").exists()
    media.gesperrt_verschieben(url, False)
    assert (tmp_path / "media" / "photos" / f"{name}.webp").exists()
    assert (tmp_path / "media" / "photos" / f"{name}.t.webp").exists()
    media.gesperrt_verschieben(url, True)
    media.delete_media(url)
    assert not any((tmp_path / "data" / "gesperrte-medien").rglob("*.webp"))


def test_pfad_mit_punkten_wird_nicht_verschoben(tmp_path, monkeypatch):
    from app import media
    monkeypatch.setattr(media.settings, "media_dir", tmp_path / "media")
    monkeypatch.setattr(media.settings, "data_dir", tmp_path / "data")
    (tmp_path / "geheim.webp").write_bytes(b"x")
    media.gesperrt_verschieben("/media/../geheim.webp", True)
    assert (tmp_path / "geheim.webp").exists()
