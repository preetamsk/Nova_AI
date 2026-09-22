from settings import get_settings


def test_local_ollama_defaults_are_private_and_low_memory():
    settings = get_settings()
    assert settings.ollama_base_url.startswith("http://127.0.0.1")
    assert settings.ollama_text_model == "qwen2.5:1.5b"
    assert settings.ollama_num_ctx <= 2048
    assert settings.ollama_num_predict <= 384
