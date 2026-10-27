"""Build the final Nightlife mockups.

Usage: python3 -I build.py            (from any directory)

Reads screens/<name>.html, expands the macros below, inlines img/* as data URIs
and writes ../build/<name>.html (dark) and ../build/<name>-light.html (light). The photos in
src/img/ are placeholders that are not in the repo (see ../README.md); the build folder is ignored. Fails on copy
or system rule breaks so every screen stays consistent.

Macros (each on its own, as an HTML comment):
  <!-- @head -->                fonts, Phosphor icons and base.css
  <!-- @status 9:41 -->          status bar, ink on the page background
  <!-- @status-photo 9:41 -->    status bar, light ink on a photo
  <!-- @gesture -->              home indicator
  <!-- @tabbar shows|plans|you [badge] -->  bottom tabs; badge puts a dot on Plans
"""
import base64, pathlib, re, sys

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent / "build"
OUT.mkdir(exist_ok=True)
BASE = (SRC / "base.css").read_text()

HEAD = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css">
<style>
""" + BASE + "</style>"

SYS = ('<span class="sys"><svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1"/>'
       '<rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>'
       '<svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 2.2c2.2 0 4.2.8 5.7 2.2l1.1-1.1A9.6 9.6 0 0 0 7.5.6 9.6 9.6 0 0 0 .7 3.3l1.1 1.1a8.1 8.1 0 0 1 5.7-2.2Zm0 3.2c1.3 0 2.5.5 3.4 1.3l1.1-1.1a6.4 6.4 0 0 0-9 0l1.1 1.1c.9-.8 2.1-1.3 3.4-1.3Zm0 3.2c.5 0 .9.2 1.2.5L7.5 10.3 6.3 9.1c.3-.3.7-.5 1.2-.5Z"/></svg>'
       '<svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="currentColor" opacity=".45"/>'
       '<rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor"/><rect x="23" y="4" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".45"/></svg></span>')

TABS = [("shows", "Shows", "ticket"), ("plans", "Plans", "calendar-check"), ("you", "You", "user-circle")]


def status(time, photo=False):
    cls = "status on-photo" if photo else "status"
    return f'<div class="{cls}" aria-hidden="true"><span class="tnum">{time}</span>{SYS}</div>'


def tabbar(args):
    cur = args[0]
    badge = "badge" in args[1:]
    out = ['<nav class="tabbar" aria-label="Tabs">']
    for key, label, icon in TABS:
        on = key == cur
        weight = "ph-fill" if on else "ph"
        attr = ' aria-current="page"' if on else ""
        dot = '<span class="badge" aria-hidden="true"></span>' if (badge and key == "plans") else ""
        extra = ", new update" if dot else ""
        out.append(f'<a href="#" class="tab" data-component-id="tab-{key}" aria-label="{label}{extra}"{attr}>'
                   f'<i class="{weight} ph-{icon}" aria-hidden="true"></i>{label}{dot}</a>')
    out.append("</nav>")
    return "".join(out)


def macro(m):
    name, *args = m.group(1).split()
    if name == "head":
        return HEAD
    if name == "status":
        return status(args[0])
    if name == "status-photo":
        return status(args[0], photo=True)
    if name == "gesture":
        return '<div class="gesture" aria-hidden="true"><i></i></div>'
    if name == "tabbar":
        return tabbar(args)
    raise SystemExit(f"unknown macro {name}")


_cache = {}


def inline(m):
    rel = m.group(1)
    if rel not in _cache:
        data = (SRC / rel).read_bytes()
        _cache[rel] = "data:image/jpeg;base64," + base64.b64encode(data).decode()
    return _cache[rel]


BANNED = [
    (re.compile(r"verified|ID[- ]check|KYC", re.I), "banned trust copy"),
    (re.compile("\u2014"), "em dash"),
    (re.compile(r"ph-arrow-left\b"), "back must be ph-caret-left"),
    (re.compile(r"themebtn|data-theme-toggle"), "no theme toggle"),
    (re.compile(r">\s*PHOTO\s*<|>Photo<"), "no PHOTO labels"),
    (re.compile(r"backdrop-filter"), "no blur on bars"),
    (re.compile(r"class=\"eyebrow"), "no eyebrows"),
]


def lint(name, html):
    errs = []
    body = html.split("</style>")[-1]
    for rx, why in BANNED:
        if rx.search(body):
            errs.append(why)
    for line in body.splitlines():
        if "·" in line and "marquee" not in line and 'class="when' not in line:
            errs.append("middle dot outside the marquee: " + line.strip()[:80])
    if errs:
        raise SystemExit(f"{name}: " + "; ".join(errs))


def main():
    names = sys.argv[1:] or sorted(p.stem for p in (SRC / "screens").glob("*.html"))
    for name in names:
        src = (SRC / "screens" / f"{name}.html").read_text()
        html = re.sub(r"<!--\s*@(\S[^>]*?)\s*-->", macro, src)
        lint(name, html)  # before inlining, so base64 image data is never linted as copy
        html = re.sub(r"(?<![\w/])(img/[\w.-]+\.jpg)", inline, html)
        if 'data-theme="dark"' not in html:
            raise SystemExit(f"{name}: <html> needs data-theme=\"dark\"")
        (OUT / f"{name}.html").write_text(html)
        (OUT / f"{name}-light.html").write_text(html.replace('data-theme="dark"', 'data-theme="light"', 1))
        print("built", name)


if __name__ == "__main__":
    main()
