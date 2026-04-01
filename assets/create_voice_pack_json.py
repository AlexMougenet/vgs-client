import os
import json
import time
import urllib.request
import urllib.parse
import re
import sys
from bs4 import BeautifulSoup

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    links_file = os.path.join(script_dir, "links.txt")

    if not os.path.exists(links_file):
        print(f"Error: Could not find {links_file}")
        return

    with open(links_file, "r", encoding="utf-8") as f:
        paths = [line.strip() for line in f if line.strip()]

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    # Load VGS_sound.json to build sound mapping
    vgs_sound_mapping = {}
    vgs_sound_file = os.path.normpath(os.path.join(script_dir, "..", "vgs", "VGS_sound.json"))
    if os.path.exists(vgs_sound_file):
        with open(vgs_sound_file, "r", encoding="utf-8") as f:
            vgs_data = json.load(f)
            
            def extract_vgs_sounds(data):
                if isinstance(data, dict):
                    if "completeVGS" in data and "sound" in data:
                        if data["sound"]:
                            vgs_sound_mapping[data["completeVGS"]] = data["sound"]
                    else:
                        for v in data.values():
                            extract_vgs_sounds(v)
                elif isinstance(data, list):
                    for item in data:
                        extract_vgs_sounds(item)
            
            extract_vgs_sounds(vgs_data)
        print(f"Loaded {len(vgs_sound_mapping)} VGS sound mappings from VGS_sound.json", file=sys.stderr)

    output_file = os.path.join(script_dir, "voice_packs.json")
    voice_packs_existing = []
    if os.path.exists(output_file):
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                voice_packs_existing = json.load(f)
            print(f"Loaded {len(voice_packs_existing)} existing voice packs from {output_file}", file=sys.stderr)
        except Exception as e:
            print(f"Warning: Could not load existing voice_packs.json ({e}). Starting fresh.", file=sys.stderr)

    # Map by ID for quick check/update
    vp_map = {vp["id"]: vp for vp in voice_packs_existing}
    
    # Filter paths to only those that are missing or have empty sounds
    paths_to_process = []
    for p in paths:
        # Replicate ID logic to check status
        b_name = urllib.parse.unquote(p.split("/")[-1])
        b_name = re.sub(r'(?i)_voicelines', '', b_name)
        i_val = "_".join(b_name.split()) if " " in b_name else b_name
        i_val = re.sub(r'(?i)_voicelines', '', i_val)
        i_val = i_val.replace("_", "")
        
        if i_val not in vp_map or not vp_map[i_val].get("sounds"):
            paths_to_process.append(p)

    print(f"Total paths: {len(paths)}. Paths to process/retry: {len(paths_to_process)}", file=sys.stderr)
    print("Beginning Fandom processing...\n", file=sys.stderr)
    
    for i, path in enumerate(paths_to_process, 1):
        # Example path: /wiki/Candy_Shop_Achilles_voicelines
        # Get Fandom page title to parse
        page_name = re.sub(r'(?i)^/wiki/', '', path)
        
        # ID: keep the part after the last / and join('_')
        base_name = urllib.parse.unquote(path.split("/")[-1])
        base_name = re.sub(r'(?i)_voicelines', '', base_name)
        id_val = "_".join(base_name.split()) if " " in base_name else base_name
        id_val = re.sub(r'(?i)_voicelines', '', id_val)
        id_val = id_val.replace("_", "")

        print(f"[{i}/{len(paths_to_process)}] Working on {base_name}... remaining {(len(paths_to_process) - i) * 1}s")
        
        # Name: part after last / and replace('_', ' ')
        name_val = base_name.replace("_", " ")

        api_url = f"https://smite.fandom.com/api.php?action=parse&page={page_name}&format=json"
        
        time.sleep(1) # Fandom API politeness delay
        
        description = ""
        artwork = ""
        sounds_dict = {}
        
        try:
            req = urllib.request.Request(api_url, headers=headers)
            with urllib.request.urlopen(req) as response:
                json_data = json.loads(response.read().decode("utf-8"))
            
            if "error" in json_data:
                print(f"API Error for {page_name}: {json_data['error']}", file=sys.stderr)
                continue
            
            print(f"  Successfully fetched HTML for {page_name}", file=sys.stderr)

            html_content = json_data["parse"]["text"]["*"]
            soup = BeautifulSoup(html_content, "html.parser")
            
            # DESCRIPTION extraction
            audio_tags = soup.find_all("audio")
            for audio in audio_tags:
                # Select the direct <a> child
                a_tag = audio.find("a", recursive=False)
                # Make sure the <a> has '_select.ogg' in href
                if a_tag and a_tag.has_attr("href") and "_select.ogg" in a_tag["href"].lower():
                    # Select the first <li> parent
                    li_parent = a_tag.find_parent("li")
                    if li_parent:
                        text_content = li_parent.get_text(separator=" ", strip=True)
                        # Only keep the text content that is between quotes
                        # Fandom often uses straight or angled/curly quotes
                        match = re.search(r'["“”](.*?)["“”]', text_content)
                        if match:
                            description = match.group(1).strip()
                        else:
                            # Fallback if no quotes strictly exist
                            description = text_content
                        
                        break # Only the first one matching the criteria
            
            # ARTWORK extraction
            # Select the first <img> that has '_card.png' in the src attribute
            img_tags = soup.find_all("img")
            for img in img_tags:
                src = img.get("src", "")
                
                # Fandom heavily uses data-src for full-sized unloaded imagery 
                if "_card.png" in src.lower():
                    artwork = re.split(r'(?i)/revision', src)[0]
                    break

            # SOUNDS extraction
            all_a_tags = soup.find_all("a", href=True)
            ogg_hrefs = [a["href"] for a in all_a_tags if ".ogg" in a["href"].lower()]
            print(f"  Found {len(all_a_tags)} <a> tags, {len(ogg_hrefs)} of which are .ogg", file=sys.stderr)
            
            for vgs_key, sound_filename in vgs_sound_mapping.items():
                # Strip the common Smite VOX prefix since it's inconsistently used on Fandom
                vox_stripped = re.sub(r'(?i)^vox_vgs_', '', sound_filename).lower()
                match_found = False
                # Try primary pattern (stripped VOX prefix)
                for href in ogg_hrefs:
                    href_lower = href.lower()
                    if vox_stripped in href_lower:
                        sounds_dict[vgs_key] = re.split(r'(?i)\.ogg', href)[0] + ".ogg"
                        match_found = True
                        break
                
                if not match_found:
                    # Fallback for Pattern B: _{completeVGS}.ogg (e.g. _VVVX.ogg)
                    vgs_suffix = f"_{vgs_key.lower()}.ogg"
                    for href in ogg_hrefs:
                        if vgs_suffix in href.lower():
                            sounds_dict[vgs_key] = re.split(r'(?i)\.ogg', href)[0] + ".ogg"
                            match_found = True
                            break
                
                if not match_found:
                    print(f"    [FAIL] No match for '{sound_filename}' (even stripped to '{vox_stripped}' and pattern '_{vgs_key}.ogg')", file=sys.stderr)

            print(f"  Captured {len(sounds_dict)} sound links out of {len(vgs_sound_mapping)} requested", file=sys.stderr)

        except Exception as e:
            print(f"  Error processing {page_name}: {e}", file=sys.stderr)
            pass

        voice_pack_obj = {
            "id": id_val,
            "name": name_val,
            "description": description,
            "artwork": artwork,
            "sounds": sounds_dict
        }
        
        # Update in map
        vp_map[id_val] = voice_pack_obj
        
        # Save progress after each entry (to ensure we don't lose work)
        updated_list = sorted(vp_map.values(), key=lambda x: x["id"])
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(updated_list, f, indent=4)

        sys.stdout.flush()

    print("Done!", file=sys.stderr)

if __name__ == "__main__":
    main()
