import json
import os

def check():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, "voice_packs.json")

    if not os.path.exists(json_path):
        print(f"Error: Could not find {json_path}")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    missing_vel = []
    for vp in data:
        sounds = vp.get("sounds", {}) or {}
        # Check if any key starts with "VEL"
        if not any(k.startswith("VEL") for k in sounds.keys()):
            missing_vel.append(vp)

    print(f"Found {len(missing_vel)} voice packs with no VEL commands out of {len(data)} total.")
    if missing_vel:
        print("\nList of voice packs with no VEL:")
        for vp in missing_vel:
            print(f"- {vp.get('name', 'Unknown')} ({vp.get('id', 'N/A')})")

if __name__ == "__main__":
    check()
