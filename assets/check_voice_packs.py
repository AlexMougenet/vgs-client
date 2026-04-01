import json
import os

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    vp_file = os.path.join(script_dir, "voice_packs.json")
    
    if not os.path.exists(vp_file):
        print(f"Error: {vp_file} not found.")
        return

    with open(vp_file, "r", encoding="utf-8") as f:
        voice_packs = json.load(f)

    for vp in voice_packs:
        sounds_count = len(vp.get("sounds", {}))
        if sounds_count < 140:
            vp["disabled"] = True
        else:
            vp["disabled"] = False
            
    with open(vp_file, "w", encoding="utf-8") as f:
        json.dump(voice_packs, f, indent=4)
        
    print(f"Processed {len(voice_packs)} voice packs. Updated disabled status.")

if __name__ == "__main__":
    main()
