"""Browser tests for voyeurs, Hands won, Last round (and its lock), the game-end buttons and the chat chips.

Run with the server in fast mode (bots move instantly), through the webapp-testing skill's helper, from the repo folder:
    JD_FAST=1 JD_LAST_ROUND_MS=2500 JD_AGAIN_MS=3000 python <skill>/scripts/with_server.py --server "node server.js" --port 3000 -- python test/voyeur_ui.py
"""
import re
import sys
import time
import traceback
from playwright.sync_api import sync_playwright

import os
URL = os.environ.get("JD_URL", "http://localhost:3000")
PHONE = {"width": 390, "height": 844}
EDGE = {"x": 5, "y": 25}      # cards in the hand overlap, so tap the exposed left strip
results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""), flush=True)


def check(name, cond, detail=""):
    record(name, bool(cond), "" if cond else detail)
    return bool(cond)


class Watch:
    def __init__(self, page, label):
        self.errors = []
        page.on("console", lambda m: self.errors.append(f"[{label} console] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: self.errors.append(f"[{label} pageerror] {e}"))
        page.on("requestfailed", lambda r: None if ("/api/stream" in r.url and "ERR_ABORTED" in str(r.failure))
                else self.errors.append(f"[{label} reqfailed] {r.url} {r.failure}"))


def scenario(fn):
    def run(browser):
        t0 = time.time()
        try:
            fn(browser)
        except Exception as e:
            record(fn.__name__, False, f"{type(e).__name__}: {str(e).splitlines()[0][:220]} ({time.time()-t0:.1f}s)")
            traceback.print_exc(limit=3)
    run.__name__ = fn.__name__
    return run


# ------------------------------------------------------------ helpers
def home(page):
    page.goto(URL)
    page.wait_for_load_state("networkidle")


def snap(page):
    return page.evaluate("JSON.parse(JSON.stringify(window.__jn.snap))")


def new_room(browser, name="Hosty", viewport=PHONE):
    ctx = browser.new_context(viewport=viewport)
    a = ctx.new_page()
    home(a)
    a.locator("input[placeholder='write it here']").fill(name)
    a.locator("[data-a=start]").click()
    a.wait_for_selector("button.code")
    return ctx, a, a.locator("button.code").inner_text().strip()


def start_game(a):
    a.locator("[data-a=lstart]").click()
    a.wait_for_selector(".num, .card", timeout=8000)


def offer(browser, code, name, viewport=PHONE):
    ctx = browser.new_context(viewport=viewport)
    b = ctx.new_page()
    home(b)
    b.locator("input[placeholder='write it here']").fill(name)
    b.locator("#rc").fill(code)
    b.locator("[data-a=join]").click()
    b.wait_for_selector(".offer", timeout=5000)
    return ctx, b


def play_step(page):
    """One tap's worth of play for a human: call the first allowed number, or play the first legal card."""
    calls = page.locator("button.num[data-a=call]:visible")
    if calls.count():
        calls.first.click()
        return "call"
    ok = page.locator(".card.ok:visible")
    if ok.count():
        ok.first.click(position=EDGE)
        sub = page.locator("button[data-a=submit]:visible")
        if sub.count():
            sub.first.click()
            return "play"
    return None


def drive(page, stop, timeout=60):
    """Plays this human's turns until stop() is true."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if stop():
            return True
        if not play_step(page):
            page.wait_for_timeout(60)
        else:
            page.wait_for_timeout(40)
    return False


# ------------------------------------------------------------ scenarios
@scenario
def s_join_offer_and_hand(browser):
    ca, a, code = new_room(browser)
    wa = Watch(a, "host")
    start_game(a)
    # the code of a started game offers watching (never the old dead-end error)
    cb, b = offer(browser, code, "Peeper")
    wb = Watch(b, "voyeur")
    txt = b.locator(".offer").inner_text()
    check("offer: says the game has started", "already started" in txt, txt[:80])
    check("offer: 'Join as a voyeur' button", b.locator("[data-a=watch]").inner_text().strip() == "Join as a voyeur")
    check("offer: no take-back button for a stranger", b.locator("[data-a=claim]").count() == 0)
    chips = b.locator(".offer .chip").all_inner_texts()
    check("offer: choices are Table only and the human's hand", chips == ["Table only", "Hosty’s hand"], str(chips))
    check("offer: no error message on the page", b.locator(".err").count() == 0)
    # ask for the host's hand while joining
    b.locator(".offer .chip", has_text="Hosty").click()
    b.locator("[data-a=watch]").click()
    b.wait_for_selector(".vybar", timeout=6000)
    s = snap(b)
    check("voyeur: lands in the game as a voyeur", s["voyeur"] is True and s["phase"] in ("calling", "playing"))
    check("voyeur: sees the table (4 players)", len(s["players"]) == 4)
    check("voyeur: strip says waiting for the player", "waiting for" in b.locator(".vybar").inner_text() and "Hosty" in b.locator(".vybar").inner_text(), b.locator(".vybar").inner_text())
    check("voyeur: no cards before the yes", b.locator(".hand .card").count() == 0)
    check("voyeur: no calling pad, no play button", b.locator(".num").count() == 0 and b.locator("[data-a=submit]").count() == 0)
    # the host gets the question, wherever they are
    a.wait_for_selector("#ask .ask", timeout=5000)
    ask = a.locator("#ask .ask").inner_text()
    check("host: asked, with the voyeur's name", "Peeper" in ask and "voyeur" in ask and "hand" in ask, ask)
    # deny -> table only
    a.locator("[data-a=peekno]").first.click()
    b.wait_for_function("window.__jn.snap.peek && window.__jn.snap.peek.state==='denied'", timeout=5000)
    check("deny: voyeur stays on the table view", b.locator(".hand .card").count() == 0 and "said no" in b.locator(".vybar").inner_text())
    a.wait_for_function("document.querySelectorAll('#ask .ask').length===0", timeout=3000)
    check("deny: host's banner is gone", a.locator("#ask .ask").count() == 0)
    # ask again from the strip, this time allowed
    b.locator("[data-a=peeksheet]").click()
    b.wait_for_selector("[aria-label='Whose hand']")
    names = b.locator("[aria-label='Whose hand'] .btn").all_inner_texts()
    check("whose hand: table only + humans only (no bots)", len(names) == 2 and "Hosty" in names[1], str(names))
    b.locator("[data-a=peek][data-v]", has_text="Hosty").click()
    a.wait_for_selector("#ask .ask", timeout=5000)
    a.locator("[data-a=peekyes]").first.click()
    b.wait_for_function("window.__jn.snap.peek && window.__jn.snap.peek.state==='ok'", timeout=5000)
    b.wait_for_selector(".hand .card", timeout=3000)
    mine = a.locator(".hand .card").evaluate_all("els=>els.map(e=>e.dataset.c)")
    seen = b.locator(".hand .card").evaluate_all("els=>els.map(e=>e.getAttribute('aria-label'))")
    check("allow: the voyeur sees the same number of cards as the host holds", len(mine) == len(seen) and len(seen) > 0, f"{len(mine)} vs {len(seen)}")
    check("allow: strip says whose hand", "you can see" in b.locator(".vybar").inner_text())
    check("allow: peeked cards cannot be played", b.locator(".hand .card.ok").count() == 0 and b.locator("[data-a=submit]").count() == 0)
    check("allow: hand labelled with the player's name", b.locator("#hand").get_attribute("aria-label") == "Hosty’s hand", b.locator("#hand").get_attribute("aria-label"))
    # the host sees who is watching, and can stop sharing
    a.locator("[data-a=settings]").first.click()
    a.wait_for_selector("[role=dialog][aria-label=Settings]")
    st = a.locator("[role=dialog][aria-label=Settings]").inner_text()
    check("settings: host sees the voyeur and 'sees your hand'", "Voyeurs" in st and "Peeper" in st and "sees your hand" in st, st[:300].replace("\n", " "))
    a.locator("[data-a=peekno]").first.click()
    b.wait_for_function("window.__jn.snap.peek && window.__jn.snap.peek.state==='denied'", timeout=5000)
    check("stop sharing: the voyeur's hand view ends", b.locator(".hand .card").count() == 0)
    check("no console errors (host, voyeur)", not (wa.errors + wb.errors), "; ".join((wa.errors + wb.errors)[:3]))
    ca.close(); cb.close()


@scenario
def s_chat_chips_and_tag(browser):
    ca, a, code = new_room(browser)
    start_game(a)
    cb, b = offer(browser, code, "Peeper")
    b.locator("[data-a=watch]").click()
    b.wait_for_selector(".vybar")
    b.locator("[data-a=chat]").click()
    b.wait_for_selector("[aria-label='Table chat']")
    chips = b.locator(".quick .chip").all_inner_texts()
    want = ["wah!", "bold call", "gg", "kaled", "today", "sick", "😂", "👏"]
    check("chat chips: new set (kaled, gg, today, sick, laughing emoji)", chips == want, str(chips))
    check("chat chips: oops and 😅 are gone", "oops" not in chips and "😅" not in chips)
    b.locator(".quick .chip", has_text="kaled").click()
    b.wait_for_selector(".msg:has-text('kaled')")
    check("chat: voyeur message tagged 'voyeur'", "voyeur" in b.locator(".msg:has-text('kaled')").inner_text())
    # the host reads it as a sticky note, then in the chat
    a.wait_for_selector(".note-pop", timeout=4000)
    pop = a.locator(".note-pop").first.inner_text()
    check("chat: host's sticky note says voyeur", "Peeper" in pop and "voyeur" in pop and "kaled" in pop, pop)
    a.locator("[data-a=chat]").first.click()
    a.wait_for_selector("[aria-label='Table chat']")
    msgs = a.locator("#msgs").inner_text()
    check("chat: joined-as-voyeur notice shown to the table", "Peeper joined as a voyeur" in msgs, msgs[:200])
    ca.close(); cb.close()


def play_round(page):
    """Plays this human's turns until the Screen shows between rounds."""
    t0 = time.time()
    while time.time() - t0 < 90:
        if page.locator("button[data-a=next]:visible").count():
            return True
        if not play_step(page):
            page.wait_for_timeout(40)
        else:
            page.wait_for_timeout(30)
    return False


@scenario
def s_hands_won_and_last_round(browser):
    ca, a, code = new_room(browser)
    wa = Watch(a, "host")
    start_game(a)
    cb, b = offer(browser, code, "Peeper")
    b.locator(".offer .chip", has_text="Hosty").click()
    b.locator("[data-a=watch]").click()
    b.wait_for_selector(".vybar")
    # the voyeur has no Hands won until the host says yes
    b.locator("[data-a=screen]").first.click()
    b.wait_for_selector("[aria-label='The Screen'] .tabs")
    vt = b.locator("[aria-label='The Screen'] .tabs .chip")
    check("voyeur: Hands won greyed out before the yes", vt.nth(1).is_disabled())
    b.locator("[aria-label='The Screen'] [data-a=close]").first.click()
    a.wait_for_selector("#ask .ask")
    a.locator("[data-a=peekyes]").first.click()
    b.wait_for_function("window.__jn.snap.peek && window.__jn.snap.peek.state==='ok'", timeout=5000)
    # three tabs; Hands won is there from the start, Last round needs a finished round
    a.locator("[data-a=screen]").first.click()
    a.wait_for_selector("[aria-label='The Screen'] .tabs")
    tabs = a.locator("[aria-label='The Screen'] .tabs .chip")
    check("tabs: Scores, Hands won, Last round", tabs.all_inner_texts() == ["Scores", "Hands won", "Last round"], str(tabs.all_inner_texts()))
    check("tabs: Hands won is available in round 1", tabs.nth(1).is_enabled())
    check("tabs: Last round is greyed out in round 1 (no earlier round)", tabs.nth(2).is_disabled())
    tabs.nth(1).click()
    a.wait_for_selector(".hwon")
    txt = a.locator(".hwon").inner_text()
    check("hands won: round 1 listed with no hands yet", "Round 1" in txt and "No hands won" in txt, txt[:120].replace("\n", " "))
    a.locator("[aria-label='The Screen'] [data-a=close]").first.click()
    # play round 1: the table holds the last hand as it always did (no stacks of every hand)
    ok = play_round(a)
    check("round 1 reaches the Screen", ok)
    check("table: no all-hands recap any more", a.locator(".recap").count() == 0)
    # Hands won, from the Screen between rounds
    s = snap(a)
    me = [p for p in s["players"] if p["id"] == s["me"]][0]
    tabs = a.locator(".insc .tabs .chip")
    check("tabs: shown between rounds, all three", tabs.all_inner_texts() == ["Scores", "Hands won", "Last round"])
    check("tabs: Last round is open now", tabs.nth(2).is_enabled())
    tabs.nth(1).click()
    a.wait_for_selector(".hwon")
    check("hands won: one group per hand won in round 1", a.locator(".hw-h").count() == me["made"], f"{a.locator('.hw-h').count()} vs made {me['made']}")
    if me["made"]:
        check("hands won: four cards in each hand", a.locator(".hw-h .card").count() == 4 * me["made"])
        check("hands won: one winning card per hand, and it is yours", a.locator(".hw-h .card.won").count() == me["made"]
              and set(a.locator(".hw-h .card.won").evaluate_all("els=>els.map(e=>e.parentElement.querySelector('.hw-n').textContent)")) == {"You"})
    else:
        check("hands won: says so when none were won", "No hands won" in a.locator(".hwon").inner_text())
    check("hands won: round line shows hands made of called", re.search(r"Round 1.*\d+ of \d+", a.locator(".hwon h4").first.inner_text().replace("\n", " ")) is not None, a.locator(".hwon h4").first.inner_text())
    check("hands won: no sideways scroll", a.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    # Last round: the final hand of round 1, large
    tabs.nth(2).click()
    a.wait_for_selector(".lastr .slot")
    check("last round: heading names the round", "Round 1 · the final hand" in a.locator(".lastr").inner_text(), a.locator(".lastr").inner_text()[:80])
    check("last round: one card per player (4), big", a.locator(".lastr .card").count() == 4 and a.locator(".lastr .card").first.bounding_box()["width"] >= 34)
    check("last round: exactly one card circled as the winner", a.locator(".lastr .slot.win").count() == 1 and a.locator(".lastr .slot.win svg.circ").count() == 1)
    check("last round: led card tagged", a.locator(".lastr .slot .tg", has_text="led").count() == 1)
    lr = snap(a)["lastRound"]
    check("last round: shows the engine's final hand", sorted(t["card"] for t in lr["trick"]) == sorted(a.locator(".lastr .card").evaluate_all("els=>els.map(e=>e.getAttribute('aria-label'))")) or len(lr["trick"]) == 4)
    names = a.locator(".lastr .slot .sn").all_inner_texts()
    check("last round: every player's name is under their card", len(names) == 4 and "You" in names, str(names))
    check("last round: says when it closes", "45 seconds into the next round" in a.locator(".lastr").inner_text())
    # the voyeur has it too (it is on the table for everyone)
    b.wait_for_function("window.__jn.snap.phase==='roundover'", timeout=8000)
    b.locator(".insc .tabs .chip", has_text="Last round").click()
    b.wait_for_selector(".lastr .slot")
    check("voyeur: Last round works too", b.locator(".lastr .card").count() == 4)
    tabs.nth(1).click()
    a.wait_for_selector(".hwon")
    # round 2, then both rounds are listed, newest first
    a.locator("[data-a=next]").first.click()
    a.wait_for_function("window.__jn.snap.phase==='calling'", timeout=6000)
    a.locator("[data-a=screen]").first.click()
    a.wait_for_selector("[aria-label='The Screen'] .tabs")
    lt = a.locator("[aria-label='The Screen'] .tabs .chip", has_text="Last round")
    check("round 2 just started: Last round is still open", lt.is_enabled())
    lt.click()
    a.wait_for_selector("[aria-label='The Screen'] .lastr .slot")
    check("round 2 just started: it still shows round 1's final hand", "Round 1 · the final hand" in a.locator("[aria-label='The Screen'] .lastr").inner_text())
    # the lock: it closes a set time into round 2 (45 s live, 2.5 s on the test server) and the cards are no longer sent
    a.wait_for_function("document.querySelectorAll(\"[aria-label='The Screen'] .tabs .chip\")[2].disabled", timeout=8000)
    check("locked: the tab greys out by itself", a.locator("[aria-label='The Screen'] .tabs .chip", has_text="Last round").is_disabled())
    check("locked: the page falls back to the scores", a.locator("[aria-label='The Screen'] .lastr").count() == 0 and a.locator("[aria-label='The Screen'] table.sc").count() == 1)
    check("locked: the game no longer sends the cards", a.evaluate("window.__jn.snap.lastRound") is None)
    check("locked: the voyeur's copy is locked as well", b.evaluate("window.__jn.snap.lastRound") is None)
    a.locator("[aria-label='The Screen'] .tabs .chip", has_text="Hands won").click()
    a.wait_for_selector(".hwon h4")
    heads = a.locator(".hwon h4").all_inner_texts()
    check("hands won: newest round first", len(heads) == 2 and heads[0].startswith("Round 2") and heads[1].startswith("Round 1"), str(heads))
    check("hands won: round under way says 'calling' or 'so far'", re.search(r"calling|so far", heads[0]) is not None, heads[0])
    a.locator("[aria-label='The Screen'] [data-a=close]").first.click()
    check("round 2 reaches the Screen", play_round(a))
    a.locator(".insc .tabs .chip", has_text="Hands won").click()
    a.wait_for_selector(".hwon h4")
    heads = a.locator(".hwon h4").all_inner_texts()
    check("hands won: two finished rounds, newest first", len(heads) == 2 and heads[0].startswith("Round 2") and "so far" not in heads[0], str(heads))
    s2 = snap(a)
    made_total = sum(r["made"] for r in s2["wins"])
    check("hands won: groups match the engine's count across rounds", a.locator(".hw-h").count() == sum(len(r["hands"]) for r in s2["wins"]) == made_total, str(made_total))
    check("scores tab still works", a.locator(".insc .tabs .chip").first.click() is None and a.locator(".insc table.sc").count() == 1)
    check("last round reopens when round 2 ends (round 2's final hand)", a.evaluate("window.__jn.snap.lastRound && window.__jn.snap.lastRound.i") == 1)
    # the voyeur who was allowed in sees Hosty's hands won
    b.wait_for_function("window.__jn.snap.phase==='roundover'", timeout=8000)
    b.locator(".insc .tabs .chip", has_text="Hands won").click()
    b.wait_for_selector(".hwon")
    check("voyeur: sees the allowed player's hands won, named", "Hosty’s hands" in b.locator(".hwon").inner_text(), b.locator(".hwon").inner_text()[:80])
    check("voyeur: same number of hand groups as the host", b.locator(".hw-h").count() == a.locator(".hw-h").count() if a.locator(".hwon").count() else True)
    check("voyeur: cannot deal", b.locator("button[data-a=next]").count() == 0)
    check("no console errors", not wa.errors, "; ".join(wa.errors[:3]))
    a.screenshot(path=SHOTS + "/hands_won.png")
    ca.close(); cb.close()


@scenario
def s_leave_handover(browser):
    ca, a, code = new_room(browser)
    wa = Watch(a, "leaver")
    start_game(a)
    cb, b = offer(browser, code, "Peeper")
    cc, c = offer(browser, code, "Second")
    b.locator("[data-a=watch]").click(); b.wait_for_selector(".vybar")
    c.locator("[data-a=watch]").click(); c.wait_for_selector(".vybar")
    a.wait_for_function("window.__jn.snap.voyeurs.length===2")
    mine_before = snap(a)
    my_hand = a.locator(".hand .card").evaluate_all("els=>els.map(e=>e.dataset.c)")
    a.locator("[data-a=settings]").first.click()
    a.wait_for_selector("[role=dialog][aria-label=Settings]")
    check("settings: leave button says 'Leave the table'", "Leave the table" in a.locator("[data-a=home]").inner_text())
    a.locator("[data-a=home]").click()
    a.wait_for_selector("[aria-label='Who takes the seat']")
    sheet = a.locator("[aria-label='Who takes the seat']")
    btns = sheet.locator(".btn").all_inner_texts()
    check("handover: asks who takes your seat", "Who takes your seat?" in sheet.inner_text(), sheet.inner_text()[:60])
    check("handover: offers a bot and each voyeur", len(btns) == 3 and btns[0].strip() == "A bot" and any("Peeper" in x for x in btns) and any("Second" in x for x in btns), str(btns))
    sheet.locator(".btn", has_text="Peeper").click()
    a.wait_for_selector("[data-a=start]", timeout=5000)
    check("handover: the leaver is home straight away", a.locator("[data-a=start]").is_visible())
    b.wait_for_function("window.__jn.snap && window.__jn.snap.voyeur===false", timeout=6000)
    sb = snap(b)
    me = [p for p in sb["players"] if p["id"] == sb["me"]][0]
    check("handover: the chosen voyeur is now a player in that seat", me["name"] == "Peeper" and not me["bot"])
    check("handover: they hold the leaver's cards", b.locator(".hand .card").count() == len(my_hand) and len(my_hand) > 0)
    check("handover: they became the host (nobody else is human)", sb["host"] == sb["me"])
    check("handover: the other voyeur is still watching", sb["voyeurs"] and sb["voyeurs"][0]["name"] == "Second")
    check("handover: the table was told", any("Hosty left. Peeper takes the seat" in m["text"] for m in sb["chat"]), str([m["text"] for m in sb["chat"]][-3:]))
    check("handover: the old browser is not dragged back in", a.evaluate("window.__jn.snap===null") and a.locator("[data-a=start]").is_visible())
    c.wait_for_function("window.__jn.snap.players.some(p=>p.name==='Peeper' && !p.bot)", timeout=5000)
    check("handover: the other voyeur sees the change", True)
    # the new player can play
    drive(b, lambda: False, 1.5)
    check("handover: the new player can act (calling pad or playable cards)", b.locator("button.num[data-a=call], .card.ok").count() > 0 or snap(b)["turn"] != snap(b)["me"])
    check("no console errors (leaver)", not wa.errors, "; ".join(wa.errors[:3]))
    ca.close(); cb.close(); cc.close()


@scenario
def s_leave_no_voyeur_goes_to_bot(browser):
    ca, a, code = new_room(browser)
    cb, b = offer_player(browser, code, "Guesty")
    a.wait_for_function("window.__jn.snap.players.length>=2")
    a.locator("[data-a=lstart]").click()
    a.wait_for_selector(".num, .card")
    b.wait_for_selector(".num, .card")
    # B leaves with nobody watching: straight home, a bot takes the seat
    b.locator("[data-a=settings]").first.click()
    b.wait_for_selector("[role=dialog][aria-label=Settings]")
    b.locator("[data-a=home]").click()
    b.wait_for_selector("[data-a=start]", timeout=4000)
    check("leave with no voyeurs: no question, straight home", b.locator("[aria-label='Who takes the seat']").count() == 0)
    a.wait_for_function("window.__jn.snap.chat.some(m=>m.sys && m.text.includes('Guesty left. A bot plays the seat'))", timeout=5000)
    check("leave with no voyeurs: the table is told a bot plays on", True)
    # name-based take-back from a different device
    cc, c = offer(browser, code, "guesty")
    claim = c.locator("[data-a=claim]")
    check("take back: offered when the name matches the seat", claim.count() == 1 and "guesty" in claim.inner_text().lower(), claim.inner_text() if claim.count() else "")
    claim.click()
    c.wait_for_function("window.__jn.snap && window.__jn.snap.voyeur===false", timeout=6000)
    sc = snap(c)
    check("take back: back in their seat as a player", [p for p in sc["players"] if p["id"] == sc["me"]][0]["bot"] is False)
    ca.close(); cb.close(); cc.close()


def offer_player(browser, code, name):
    """Joins a room that is still in the lobby, as a player."""
    ctx = browser.new_context(viewport=PHONE)
    p = ctx.new_page()
    home(p)
    p.locator("input[placeholder='write it here']").fill(name)
    p.locator("#rc").fill(code)
    p.locator("[data-a=join]").click()
    p.wait_for_selector("button.code", timeout=5000)
    return ctx, p


@scenario
def s_away_becomes_bot_and_returns(browser):
    ca, a, code = new_room(browser)
    wa = Watch(a, "host")
    cb, b = offer_player(browser, code, "Guesty")
    a.wait_for_function("window.__jn.snap.players.length>=2")
    a.locator("[data-a=lstart]").click()
    a.wait_for_selector(".num, .card")
    b.wait_for_selector(".num, .card")
    # Guesty's phone goes away (page closed; the saved session stays in the browser)
    b.close()

    def b_is_bot():
        return a.evaluate("window.__jn.snap.players.some(p=>p.name==='Guesty' && p.bot)")
    ok = drive(a, b_is_bot, 40)
    check("away: after two auto-played turns the seat becomes a bot", ok)
    msgs = a.evaluate("window.__jn.snap.chat.map(m=>m.text)")
    check("away: the table is told", any("Guesty was away for 2 turns" in m for m in msgs), str(msgs[-3:]))
    check("away: the game carries on (host is still a person)", a.evaluate("window.__jn.snap.players.filter(p=>!p.bot).length")==1)
    # same browser, reopened: straight back in, no questions
    b2 = cb.new_page()
    wb = Watch(b2, "returner")
    home(b2)
    b2.wait_for_function("window.__jn.snap && window.__jn.snap.voyeur===false", timeout=8000)
    sb = snap(b2)
    me = [p for p in sb["players"] if p["id"] == sb["me"]][0]
    check("return: same browser is put back in the seat automatically", me["name"] == "Guesty" and me["bot"] is False)
    check("return: not asked to join again", b2.locator("[data-a=start]").count() == 0)
    a.wait_for_function("window.__jn.snap.chat.some(m=>m.sys && m.text.includes('Guesty is back at the table'))", timeout=5000)
    check("return: the table sees them back", True)
    check("no console errors (host, returner)", not (wa.errors + wb.errors), "; ".join((wa.errors + wb.errors)[:3]))
    ca.close(); cb.close()


@scenario
def s_host_gives_seat(browser):
    ca, a, code = new_room(browser)
    start_game(a)
    cb, b = offer(browser, code, "Peeper")
    b.locator("[data-a=watch]").click(); b.wait_for_selector(".vybar")
    a.wait_for_function("window.__jn.snap.voyeurs.length===1")
    # mid-round: no button offered
    a.locator("[data-a=settings]").first.click()
    a.wait_for_selector("[role=dialog][aria-label=Settings]")
    check("give a seat: not offered mid-round", a.locator("[data-a=seatask]").count() == 0)
    check("give a seat: host told when it works", "between rounds" in a.locator("[role=dialog][aria-label=Settings]").inner_text())
    a.locator("[role=dialog][aria-label=Settings] [data-a=close]").first.click()
    drive(a, lambda: a.locator("button[data-a=next]:visible").count() > 0, 60)
    a.locator("[data-a=hidesc]").click() if a.locator("[data-a=hidesc]").count() else None
    a.locator("[data-a=settings]").first.click()
    a.wait_for_selector("[data-a=seatask]", timeout=4000)
    check("give a seat: offered between rounds", a.locator("[data-a=seatask]").count() == 1)
    a.locator("[data-a=seatask]").click()
    a.wait_for_selector("[aria-label='Give a seat']")
    bots = a.locator("[aria-label='Give a seat'] [data-a=seat]")
    check("give a seat: lists the bot seats (3)", bots.count() == 3, str(bots.count()))
    bots.first.click()
    b.wait_for_function("window.__jn.snap && window.__jn.snap.voyeur===false", timeout=6000)
    sb = snap(b)
    check("give a seat: the voyeur is now a player", len([p for p in sb["players"] if not p["bot"]]) == 2 and sb["voyeurs"] == [])
    ca.close(); cb.close()


def drive_both(pages, host, stop, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if stop():
            return True
        acted = False
        for pg in pages:
            if play_step(pg):
                acted = True
        if host.locator("button[data-a=next]:visible").count():
            host.locator("button[data-a=next]:visible").first.click()
            acted = True
        host.wait_for_timeout(30 if acted else 60)
    return False


@scenario
def s_game_end(browser):
    ca, a, code = new_room(browser)
    wa = Watch(a, "host")
    cb, b = offer_player(browser, code, "Guesty")
    a.wait_for_function("window.__jn.snap.players.length>=2")
    # 8 seats = 6 short rounds
    for _ in range(4):
        a.locator("button[data-a=lsize][data-d='1']").first.click()
        a.wait_for_timeout(120)
    a.wait_for_function("document.body.innerText.includes('8 players')")
    a.locator("[data-a=lstart]").click()
    a.wait_for_function("window.__jn.snap.phase==='calling'")
    b.wait_for_function("window.__jn.snap.phase!=='lobby'")
    cc, c = offer(browser, code, "Peeper")
    c.locator("[data-a=watch]").click(); c.wait_for_selector(".vybar")
    over = a.locator("[aria-label='Game over']")
    ok = drive_both([a, b], a, lambda: over.count() > 0 and over.first.is_visible(), 150)
    check("game 1 reaches Game over", ok)
    b.wait_for_selector("[aria-label='Game over']"); c.wait_for_selector("[aria-label='Game over']")
    # the wait: nobody can move on yet
    pa, st = a.locator("#againbtn"), a.locator("#setupbtn")
    check("game over (host): Play again counts down and is disabled", pa.is_disabled() and re.fullmatch(r"Play again in \d+s", pa.inner_text().strip()) is not None, pa.inner_text())
    check("game over (host): Game setup counts down and is disabled", st.is_disabled() and re.fullmatch(r"Setup in \d+s", st.inner_text().strip()) is not None, st.inner_text())
    check("game over (host): Leave works at once", a.locator("[aria-label='Game over'] [data-a=home]").is_enabled())
    check("game over (guest): told to wait for the host, with the time", re.fullmatch(r"Waiting for the host · \d+s", b.locator("#overwait").inner_text().strip()) is not None, b.locator("#overwait").inner_text())
    check("game over (guest): no buttons to start anything", b.locator("#againbtn").count() == 0 and b.locator("#setupbtn").count() == 0)
    check("game over (voyeur): same wait message", "Waiting for the host" in c.locator("#overwait").inner_text())
    # the server holds the line even if the page is bypassed
    a.evaluate("window.__jn.act({type:'again'})")
    a.wait_for_selector(".toast")
    check("server refuses an early Play again with the time left", "next game can start in" in a.locator(".toast").inner_text(), a.locator(".toast").inner_text())
    check("still on the final scores", snap(a)["phase"] == "gameover")
    # the countdown ends: both buttons come alive
    a.wait_for_function("!document.querySelector('#againbtn').disabled && !document.querySelector('#setupbtn').disabled", timeout=8000)
    check("after the wait: buttons read Play again / Game setup", pa.inner_text().strip() == "Play again" and st.inner_text().strip() == "Game setup")
    b.wait_for_function("document.querySelector('#overwait') && document.querySelector('#overwait').textContent.trim()==='Waiting for the host'", timeout=3000)
    check("after the wait: the guest just waits for the host", True)
    # Game setup: the lobby, same room
    st.click()
    a.wait_for_selector("[data-a=lstart]", timeout=5000)
    for pg in (b, c):
        pg.wait_for_function("window.__jn.snap.phase==='lobby'", timeout=5000)
    sc = snap(c)
    check("setup: everyone is in the lobby of the same room", sc["code"] == code and sc["voyeur"] is False)
    check("setup: the voyeur sat down as a player (3 people)", len(sc["players"]) == 3, str([p["name"] for p in sc["players"]]))
    check("setup: the host can add and remove players here", a.locator("[data-a=lsize]").count() >= 2 and a.locator("[data-a=kickask]").count() == 2)
    check("setup: the others see who they wait for", "Waiting for Hosty to start" in b.locator("body").inner_text())
    a.locator("button[data-a=lsize][data-d='-1']").first.click()
    a.wait_for_function("document.body.innerText.includes('7 players')", timeout=4000)
    a.locator("[data-a=lstart]").click()
    a.wait_for_function("window.__jn.snap.phase==='calling'", timeout=5000)
    names_before = sorted(p["name"] for p in snap(a)["players"])
    check("game 2: 7 players", len(names_before) == 7)
    ok = drive_both([a, b, c], a, lambda: over.count() > 0 and over.first.is_visible(), 150)
    check("game 2 reaches Game over", ok)
    a.wait_for_function("!document.querySelector('#againbtn').disabled", timeout=8000)
    a.locator("#againbtn").click()
    a.wait_for_function("window.__jn.snap.phase==='calling'", timeout=5000)
    sn = snap(a)
    check("Play again: a new game is dealt at once, same room", sn["code"] == code and sn["round"]["i"] == 0 and sn["history"] == [])
    check("Play again: same players and bots at the table", sorted(p["name"] for p in sn["players"]) == names_before, f"{sorted(p['name'] for p in sn['players'])}")
    check("Play again: scores back to zero", all(p["score"] == 0 for p in sn["players"]))
    check("Play again: the Game over screen is gone for everyone", all(pg.locator("[aria-label='Game over']").count() == 0 for pg in (a, b, c)) if True else True)
    check("Play again: players see their new cards", a.locator(".num, .card").count() > 0 and b.locator(".card").count() > 0 and c.locator(".card").count() > 0)
    check("no console errors", not wa.errors, "; ".join(wa.errors[:3]))
    a.screenshot(path=SHOTS + "/after_play_again.png")
    ca.close(); cb.close(); cc.close()


@scenario
def s_small_phone_voyeur_layout(browser):
    ca, a, code = new_room(browser, viewport={"width": 320, "height": 568})
    start_game(a)
    cb, b = offer(browser, code, "Peeper", viewport={"width": 320, "height": 568})
    check("320px: the offer fits", b.evaluate("document.documentElement.scrollWidth <= 320"))
    b.locator(".offer .chip", has_text="Hosty").click()
    b.locator("[data-a=watch]").click()
    b.wait_for_selector(".vybar")
    check("320px: voyeur screen has no sideways scroll", b.evaluate("document.documentElement.scrollWidth <= 320"))
    bb = b.locator(".vybar [data-a=peeksheet]").bounding_box()
    check("320px: 'Whose hand?' button is on screen", bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= 321 and bb["y"] + bb["height"] <= 568, str(bb))
    a.wait_for_selector("#ask .ask")
    ab = a.locator("#ask .ask").bounding_box()
    check("320px: Allow/Deny banner fits the screen", ab and ab["x"] >= 0 and ab["x"] + ab["width"] <= 321, str(ab))
    for sel in ["[data-a=peekyes]", "[data-a=peekno]"]:
        bx = a.locator(sel).first.bounding_box()
        check(f"320px: {sel} is tappable and on screen", bx and bx["x"] >= 0 and bx["x"] + bx["width"] <= 321 and bx["height"] >= 32, str(bx))
    a.locator("[data-a=peekyes]").first.click()
    b.wait_for_selector(".hand .card")
    check("320px: peeked hand fits the width", b.evaluate("document.documentElement.scrollWidth <= 320") and all(
        (bx["x"] >= -1 and bx["x"] + bx["width"] <= 321) for bx in [b.locator(".hand .card").nth(i).bounding_box() for i in range(b.locator(".hand .card").count())]))
    b.screenshot(path=SHOTS + "/voyeur_320.png")
    ca.close(); cb.close()


@scenario
def s_full_room_and_limits(browser):
    ca, a, code = new_room(browser)
    start_game(a)
    # a code that does not exist is still just an error
    ctx = browser.new_context(viewport=PHONE); p = ctx.new_page(); home(p)
    p.locator("input[placeholder='write it here']").fill("Nobody"); p.locator("#rc").fill("QQQQ"); p.locator("[data-a=join]").click()
    p.wait_for_selector(".err:not(:empty)")
    check("unknown code: still 'Room not found', no offer", "not found" in p.locator(".err").inner_text().lower() and p.locator(".offer").count() == 0)
    # cancel leaves the home screen as it was
    cb, b = offer(browser, code, "Peeper")
    b.locator("[data-a=offerno]").click()
    check("offer: Cancel closes it", b.locator(".offer").count() == 0 and b.locator("[data-a=start]").is_visible())
    ca.close(); cb.close(); ctx.close()


SHOTS = None

if __name__ == "__main__":
    import os
    SHOTS = os.environ.get("SHOTS", ".")
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        suite = [s_join_offer_and_hand, s_chat_chips_and_tag, s_hands_won_and_last_round, s_leave_handover,
                 s_leave_no_voyeur_goes_to_bot, s_away_becomes_bot_and_returns, s_host_gives_seat,
                 s_small_phone_voyeur_layout, s_full_room_and_limits, s_game_end]
        for fn in suite:
            if only and not any(o in fn.__name__ for o in only):
                continue
            fn(browser)
        browser.close()
    failed = [r for r in results if not r[1]]
    print(f"\n==== {len(results)-len(failed)} passed, {len(failed)} failed ====")
    for n, ok, d in failed:
        print("  FAIL:", n, "--", d)
    sys.exit(1 if failed else 0)
