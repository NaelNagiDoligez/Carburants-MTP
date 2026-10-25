from pathlib import Path

import pytest

AppTest = pytest.importorskip("streamlit.testing.v1").AppTest

APP = Path(__file__).resolve().parents[1] / "app" / "streamlit_app.py"


def test_app_runs_without_exception_on_real_data():
    at = AppTest.from_file(str(APP), default_timeout=60).run()
    assert not at.exception
