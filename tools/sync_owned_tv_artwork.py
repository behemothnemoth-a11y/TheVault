"""Cache validated TVMaze posters for owned Vault series and create local title-card fallbacks."""

from difflib import SequenceMatcher
from html import escape
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RECOVERY = ROOT / "recovery" / "vault-reconstruction-stage-0-repaired-2026-07-29.json"
ART_DIR = ROOT / "assets" / "artwork" / "library"
MANIFEST = ROOT / "js" / "systems" / "generatedTvArtwork.js"
REPORT = ART_DIR / "owned-tv-artwork-report.json"
ALIASES = {
    "Anthony Bourdain Parts Unknown": "Anthony Bourdain: Parts Unknown",
    "Batman The Animated Series": "Batman: The Animated Series",
    "Good Eats + Good Eats Reloaded": "Good Eats",
    "Halo The Fall of Reach + Forward Unto Dawn": "Halo 4: Forward Unto Dawn",
    "Monty Python's Flying Circus": "Monty Pythons Flying Circus",
    "Mystery Science Theater 3000": "Mystery Science Theater 3000",
    "Star Trek TNG": "Star Trek: The Next Generation",
    "Star Wars The Clone Wars": "Star Wars: The Clone Wars",
    "The Office US": "The Office",
}


def normalized(value):
    value = str(value or "").replace("\u25b8", " ").replace("&", " and ")
    value = re.sub(r"\([^)]*\)", " ", value).lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def match_score(query, candidate):
    left, right = normalized(query), normalized(candidate)
    if left == right:
        return 100
    left_tokens, right_tokens = set(left.split()), set(right.split())
    token_score = 100 * len(left_tokens & right_tokens) / max(1, len(left_tokens | right_tokens))
    return round(max(SequenceMatcher(None, left, right).ratio() * 100, token_score), 2)


def fetch_json(url):
    request = Request(url, headers={"User-Agent": "The-Vault-Personal-Archive/1.0"})
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def download(url, target):
    request = Request(url, headers={"User-Agent": "The-Vault-Personal-Archive/1.0"})
    with urlopen(request, timeout=30) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024 or not (data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG") or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")):
        raise ValueError("invalid image")
    target.write_bytes(data)


def title_card(item_id, title):
    hue = sum(ord(character) for character in title) % 360
    words = title.replace("\u25b8", "").strip().split()
    lines, current = [], []
    for word in words:
        if len(" ".join(current + [word])) > 18 and current:
            lines.append(" ".join(current)); current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    lines = lines[:5]
    start = 390 - (len(lines) - 1) * 34
    text = "".join(f'<text x="200" y="{start + index * 68}" text-anchor="middle">{escape(line.upper())}</text>' for index, line in enumerate(lines))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl({hue} 32% 34%)"/><stop offset="1" stop-color="#10150f"/></linearGradient><pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#fff" stroke-opacity=".035"/></pattern></defs><rect width="400" height="600" fill="#121710"/><rect x="18" y="18" width="364" height="564" rx="10" fill="url(#g)" stroke="#c39a49" stroke-width="4"/><rect x="28" y="28" width="344" height="544" fill="url(#p)"/><circle cx="200" cy="150" r="84" fill="#11190f" stroke="#c39a49" stroke-width="5"/><text x="200" y="180" text-anchor="middle" font-family="Georgia,serif" font-size="92" fill="#d9c27d">V</text><g font-family="Arial,sans-serif" font-weight="700" font-size="34" fill="#f0e3b7">{text}</g><text x="200" y="535" text-anchor="middle" font-family="monospace" font-size="15" letter-spacing="4" fill="#d1a953">OWNED ARCHIVE</text></svg>'''
    target = ART_DIR / f"{item_id}.svg"
    target.write_text(svg, encoding="utf-8")
    return target


def main():
    ART_DIR.mkdir(parents=True, exist_ok=True)
    with RECOVERY.open(encoding="utf-8-sig") as handle:
        state = json.load(handle)
    owned = [(item_id, item) for item_id, item in state.get("items", {}).items() if item.get("wing") == "tv" and item.get("owned") and not item_id.startswith("tv_drive_")]
    entries, report = {}, {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "owned": len(owned), "tvmaze": [], "fallback": [], "preserved": []}
    for index, (item_id, item) in enumerate(sorted(owned, key=lambda row: row[1].get("title", ""))):
        title = str(item.get("title") or item_id).replace("\u25b8", "").strip()
        existing = next((path for path in ART_DIR.glob(item_id + ".*") if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}), None)
        if existing:
            report["preserved"].append(item_id)
            continue
        query = ALIASES.get(title, title)
        try:
            results = fetch_json("https://api.tvmaze.com/search/shows?" + urlencode({"q": query}))
            ranked = sorted(((match_score(query, row.get("show", {}).get("name")), row.get("show", {})) for row in results), reverse=True, key=lambda pair: pair[0])
            score, show = ranked[0] if ranked else (0, {})
            image_url = (show.get("image") or {}).get("original") or (show.get("image") or {}).get("medium")
            if score >= 74 and image_url:
                suffix = ".png" if ".png" in image_url.lower() else ".webp" if ".webp" in image_url.lower() else ".jpg"
                target = ART_DIR / f"{item_id}{suffix}"
                download(image_url, target)
                entries[item_id] = {"localPath": f"./assets/artwork/library/{target.name}", "source": "tvmaze", "sourceId": show.get("id"), "sourcePage": show.get("url"), "sourceUrl": image_url, "matchScore": score}
                report["tvmaze"].append({"id": item_id, "title": title, "matched": show.get("name"), "score": score})
            else:
                raise ValueError("no confident poster match")
        except Exception as error:
            target = title_card(item_id, title)
            entries[item_id] = {"localPath": f"./assets/artwork/library/{target.name}", "source": "vault_title_card"}
            report["fallback"].append({"id": item_id, "title": title, "reason": type(error).__name__})
        if index % 10 == 0:
            print(f"artwork {index + 1}/{len(owned)}")
        time.sleep(0.12)
    lines = ["// Generated by tools/sync_owned_tv_artwork.py. Existing hand-curated art overrides these entries.", "export const generatedTvArtwork = {"]
    for item_id, value in sorted(entries.items()):
        lines.append(f"  {json.dumps(item_id)}: {json.dumps(value, ensure_ascii=False)},")
    lines.append("};\n")
    MANIFEST.write_text("\n".join(lines), encoding="utf-8")
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"owned={len(owned)} preserved={len(report['preserved'])} tvmaze={len(report['tvmaze'])} fallback={len(report['fallback'])}")


if __name__ == "__main__":
    main()
