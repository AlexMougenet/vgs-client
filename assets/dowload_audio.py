import json
import re
import os
import urllib.request

JSON_PATH = r"F:\Projects\VGS\vgs-app\client\vgs\VGS_sound.json"
OUTPUT_DIR = r"F:\Projects\VGS\vgs-app\client\assets\sounds\default"


def extract_filename(url):
    """Extract filename from OGG URL, e.g. 'VOX_VGS_Attack_2' from the full URL."""
    match = re.search(r'/([^/]+\.ogg)/', url)
    if match:
        return os.path.splitext(match.group(1))[0]  # strip .ogg extension
    return None


def collect_sounds(obj, collected=None):
    """Recursively walk the JSON and collect all non-null sound URLs."""
    if collected is None:
        collected = {}
    if isinstance(obj, dict):
        if "sound" in obj and obj["sound"] is not None:
            url = obj["sound"]
            filename = extract_filename(url)
            if filename:
                collected[filename] = url
        for v in obj.values():
            collect_sounds(v, collected)
    return collected


def download_sounds(sounds, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    total = len(sounds)
    success = 0
    failed = []

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for i, (filename, url) in enumerate(sounds.items(), 1):
        dest = os.path.join(output_dir, filename + ".ogg")

        if os.path.exists(dest):
            print(f"[{i}/{total}] Skipping (already exists): {filename}.ogg")
            success += 1
            continue

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                data = response.read()
            with open(dest, "wb") as f:
                f.write(data)
            print(f"[{i}/{total}] Downloaded: {filename}.ogg")
            success += 1
        except Exception as e:
            print(f"[{i}/{total}] FAILED: {filename}.ogg — {e}")
            failed.append((filename, url, str(e)))

    print(f"\n{'='*50}")
    print(f"Done. {success}/{total} files downloaded successfully.")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for filename, url, err in failed:
            print(f"  {filename}.ogg — {err}")


if __name__ == "__main__":
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    sounds = collect_sounds(data)
    print(f"Found {len(sounds)} audio files to download.\n")

    download_sounds(sounds, OUTPUT_DIR)