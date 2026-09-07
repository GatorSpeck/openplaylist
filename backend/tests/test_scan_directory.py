import os
from datetime import datetime, timedelta

import pytest

import main
from models import LocalFileDB
from response_models import MusicFile


def _make_existing_files(test_db, tmp_path, present_count, absent_count):
    """Create `present_count` real files on disk plus matching LocalFileDB rows,
    and `absent_count` LocalFileDB rows whose files don't exist on disk."""
    stale_time = datetime.now() - timedelta(days=1)

    for i in range(present_count):
        name = f"present_{i}.mp3"
        (tmp_path / name).write_bytes(b"not really audio")
        test_db.add(LocalFileDB(
            path=str(tmp_path / name),
            missing=False,
            first_scanned=stale_time,
            last_scanned=stale_time,
        ))

    for i in range(absent_count):
        name = f"absent_{i}.mp3"
        test_db.add(LocalFileDB(
            path=str(tmp_path / name),
            missing=False,
            first_scanned=stale_time,
            last_scanned=stale_time,
        ))

    test_db.commit()


@pytest.fixture(autouse=True)
def _isolate_config_file(monkeypatch, tmp_path):
    # scan_directory prefers music_paths from CONFIG_FILE over its `directory`
    # argument. Point it somewhere that doesn't exist so tests actually scan
    # the tmp_path they pass in.
    monkeypatch.setattr(main, "CONFIG_FILE", tmp_path / "unused_config.json")

    # The test fixture files aren't real audio, so stub out tag extraction
    # rather than exercising mutagen against garbage bytes.
    def fake_extract_metadata(file_path, extractor):
        return MusicFile(path=file_path, title=os.path.basename(file_path), artist="Test Artist")

    monkeypatch.setattr(main, "extract_metadata", fake_extract_metadata)

    yield
    main.scan_results.in_progress = False


def test_full_scan_sweeps_files_not_found_on_disk(test_db, tmp_path):
    _make_existing_files(test_db, tmp_path, present_count=3, absent_count=1)

    main.scan_directory(str(tmp_path), full=True)

    rows = {row.path: row.missing for row in test_db.query(LocalFileDB).all()}
    assert rows[str(tmp_path / "present_0.mp3")] is False
    assert rows[str(tmp_path / "absent_0.mp3")] is True


def test_full_scan_aborts_without_sweeping_when_coverage_is_too_low(test_db, tmp_path):
    # Only 2 of 10 previously known files are found on disk (20% coverage),
    # which is well below MIN_SCAN_COVERAGE_RATIO.
    _make_existing_files(test_db, tmp_path, present_count=2, absent_count=8)

    with pytest.raises(RuntimeError):
        main.scan_directory(str(tmp_path), full=True)

    rows = test_db.query(LocalFileDB).all()
    assert all(row.missing is False for row in rows)


def test_incremental_scan_never_marks_files_missing(test_db, tmp_path):
    # Same low-coverage setup as the fail-fast test, but an incremental scan
    # should skip the sweep entirely rather than raising or marking anything.
    _make_existing_files(test_db, tmp_path, present_count=2, absent_count=8)

    main.scan_directory(str(tmp_path), full=False)

    rows = test_db.query(LocalFileDB).all()
    assert all(row.missing is False for row in rows)
