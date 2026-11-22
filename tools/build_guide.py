"""Assemble docs/guide/*.md into one web page (docs/guide/guide_web.html).

Usage : python tools/build_guide.py   (nécessite le paquet « markdown » : pip install markdown)
"""
import html
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import markdown

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "docs" / "guide" / "guide_web.html"
GUIDE = ROOT / "docs" / "guide"
REPO = "https://github.com/Tomota113/Pilotage_autonome/blob/main/"
FILES = sorted(GUIDE.glob("0*.md"))
CHAPTER_OF = {f.name: f"ch{f.name[:2]}" for f in FILES}

MATH = re.compile(r"\$\$(.+?)\$\$|\$([^$\n]+?)\$", re.S)


def render(text: str) -> tuple[str, str]:
    title_line, _, body = text.partition("\n")
    title = re.sub(r"^#\s*(\d+\s*[—-]\s*)?", "", title_line).strip()
    store = []

    def protect(m):
        tex = m.group(1) if m.group(1) is not None else m.group(2)
        display = m.group(1) is not None
        store.append((display, tex))
        return f"@@MATH{len(store) - 1}@@"

    body = MATH.sub(protect, body)
    out = markdown.markdown(body, extensions=["tables", "fenced_code", "sane_lists"])

    def restore(m):
        display, tex = store[int(m.group(1))]
        tex = html.escape(tex, quote=False)
        return f'<span class="math display">\\[{tex}\\]</span>' if display else f'<span class="math">\\({tex}\\)</span>'

    out = re.sub(r"@@MATH(\d+)@@", restore, out)

    def link(m):
        href = html.unescape(m.group(1))
        if href.startswith(("http://", "https://", "#")):
            target = href if not href.startswith("#") else REPO + "docs/guide/"
        else:
            path, _, frag = href.partition("#")
            name = Path(path).name
            if name in CHAPTER_OF and "/" not in path.strip("./"):
                return f'href="#{CHAPTER_OF[name]}"'
            resolved = urlparse(urljoin("https://x/docs/guide/", path)).path.lstrip("/")
            target = REPO + resolved + (f"#{frag}" if frag else "")
        return f'href="{html.escape(target)}" target="_blank" rel="noopener"'

    out = re.sub(r'href="([^"]*)"', link, out)
    out = out.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    return title, out


chapters = [(CHAPTER_OF[f.name], f.name[:2], *render(f.read_text(encoding="utf-8"))) for f in FILES]
nav = "\n".join(
    f'<li><a href="#{cid}"><span class="pos">{num}</span><span class="name">{html.escape(title)}</span></a></li>'
    for cid, num, title, _ in chapters
)
sections = "\n".join(
    f'<section class="chapter" id="{cid}" aria-labelledby="{cid}-t">'
    f'<p class="eyebrow">Chapitre {num}</p><h2 id="{cid}-t">{html.escape(title)}</h2>{body}</section>'
    for cid, num, title, body in chapters
)
template = (GUIDE / "guide_template.html").read_text(encoding="utf-8")
OUT.write_text(template.replace("{{NAV}}", nav).replace("{{SECTIONS}}", sections), encoding="utf-8")
print(OUT, OUT.stat().st_size, "octets,", len(chapters), "chapitres")
