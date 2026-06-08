import json
import os
import pathlib
from typing import Any, Dict, List


SYNC_SERVICES = ("plex", "spotify", "youtube")


def get_config_file() -> pathlib.Path:
    return pathlib.Path(os.getenv("CONFIG_DIR", "/config")) / "config.json"


def load_app_config() -> Dict[str, Any]:
    config_file = get_config_file()
    if not config_file.exists():
        return {}

    with open(config_file, "r") as file_handle:
        return json.load(file_handle)


def save_app_config(config: Dict[str, Any]) -> None:
    config_file = get_config_file()
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, "w") as file_handle:
        json.dump(config, file_handle)


def get_music_paths() -> List[str]:
    return load_app_config().get("music_paths", [])


def set_music_paths(paths: List[str]) -> None:
    config = load_app_config()
    config["music_paths"] = paths
    save_app_config(config)


def get_playlist_sync_defaults() -> Dict[str, Any]:
    raw_defaults = load_app_config().get("playlist_sync_defaults", {})
    raw_services = raw_defaults.get("services", {}) if isinstance(raw_defaults, dict) else {}

    return {
        "enabled": bool(raw_defaults.get("enabled", False)) if isinstance(raw_defaults, dict) else False,
        "services": {
            service: bool(raw_services.get(service, False))
            for service in SYNC_SERVICES
        },
    }


def set_playlist_sync_defaults(defaults: Dict[str, Any]) -> Dict[str, Any]:
    normalized_defaults = {
        "enabled": bool(defaults.get("enabled", False)),
        "services": {
            service: bool(defaults.get("services", {}).get(service, False))
            for service in SYNC_SERVICES
        },
    }

    config = load_app_config()
    config["playlist_sync_defaults"] = normalized_defaults
    save_app_config(config)
    return normalized_defaults