from src.jobs.sync import _derive_progress


def test_derive_progress_uses_file_counters_for_summary_phase():
    done, total = _derive_progress(
        {
            "phase": "embedding_summaries",
            "files_total": 12,
            "files_embedded": 5,
        }
    )
    assert (done, total) == (5, 12)


def test_derive_progress_uses_chunk_counters_for_chunk_phase():
    done, total = _derive_progress(
        {
            "phase": "embedding_chunks",
            "files_total": 12,
            "chunks_total": 48,
            "chunks_embedded": 17,
        }
    )
    assert (done, total) == (17, 48)


def test_derive_progress_marks_done_phase_complete():
    done, total = _derive_progress(
        {
            "phase": "done",
            "files_total": 12,
            "chunks_total": 48,
        }
    )
    assert (done, total) == (48, 48)
