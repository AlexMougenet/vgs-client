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

    voice_packs = []

    print("Beginning Fandom processing... Note that reading all paths will take some time.\n", file=sys.stderr)
    for path in paths:
        # Example path: /wiki/Candy_Shop_Achilles_voicelines
        # Get Fandom page title to parse
        page_name = re.sub(r'(?i)^/wiki/', '', path)
        
        # ID: keep the part after the last / and join('_')
        base_name = urllib.parse.unquote(path.split("/")[-1])
        base_name = re.sub(r'(?i)_voicelines', '', base_name)
        id_val = "_".join(base_name.split()) if " " in base_name else base_name
        id_val = re.sub(r'(?i)_voicelines', '', id_val)
        id_val = id_val.replace("_", "")

        print(f"Working on {base_name}...")
        
        # Name: part after last / and replace('_', ' ')
        name_val = base_name.replace("_", " ")

        api_url = f"https://smite.fandom.com/api.php?action=parse&page={page_name}&format=json"
        
        time.sleep(0.1) # Fandom API politeness delay
        
        description = ""
        artwork = ""
        sounds_dict = {}
        
        try:
            req = urllib.request.Request(api_url, headers=headers)
            with urllib.request.urlopen(req) as response:
                json_data = json.loads(response.read().decode("utf-8"))
            
            if "error" in json_data:
                continue

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
            for vgs_key, sound_filename in vgs_sound_mapping.items():
                sound_lower = sound_filename.lower()
                for a_tag in all_a_tags:
                    if sound_lower in a_tag["href"].lower():
                        href = a_tag["href"]
                        if ".ogg" in href.lower():
                            sounds_dict[vgs_key] = re.split(r'(?i)\.ogg', href)[0] + ".ogg"
                        else:
                            sounds_dict[vgs_key] = href
                        break

        except Exception as e:
            pass

        voice_pack_obj = {
            "id": id_val,
            "name": name_val,
            "description": description,
            "artwork": artwork,
            "sounds": sounds_dict
        }
        
        voice_packs.append(voice_pack_obj)

        # Print object natively to standard output so user sees it in console
        # print(json.dumps(voice_pack_obj, indent=2))
        sys.stdout.flush()

    # Write the full JSON array to voice_packs.json
    output_file = os.path.join(script_dir, "voice_packs.json")
    print(f"\nWriting {len(voice_packs)} voice packs to {output_file}...", file=sys.stderr)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(voice_packs, f, indent=4)
    print("Done!", file=sys.stderr)

if __name__ == "__main__":
    main()
