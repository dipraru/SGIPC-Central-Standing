#!/usr/bin/env python3
"""
fetch_gym_problems.py
Scrapes the problem table from https://codeforces.com/gym/{contest_id}
using curl_cffi with chrome impersonation to bypass Cloudflare challenges.
Returns JSON output to stdout.
"""

import sys
import json
import re

def scrape_gym_problems(contest_id):
    try:
        from curl_cffi import requests
        from bs4 import BeautifulSoup
    except ImportError as e:
        return {"status": "ERROR", "message": f"Missing dependency: {e}", "problems": []}

    url = f"https://codeforces.com/gym/{contest_id}"
    try:
        r = requests.get(url, impersonate="chrome124", timeout=15)
        if r.status_code != 200:
            return {"status": "ERROR", "code": r.status_code, "problems": []}

        soup = BeautifulSoup(r.text, "html.parser")
        table = soup.find("table", class_="problems")
        if not table:
            # Fallback: look for problem links
            matches = re.findall(rf'href="/gym/{contest_id}/problem/([A-Za-z0-9]+)"[^>]*>\s*([^<\n]+)\s*</a>', r.text)
            unique_probs = {}
            for idx, raw_name in matches:
                p_idx = idx.strip().toUpperCase() if hasattr(idx, 'toUpperCase') else idx.strip().upper()
                if p_idx not in unique_probs:
                    unique_probs[p_idx] = {
                        "problemIndex": p_idx,
                        "name": raw_name.strip() if raw_name.strip() != p_idx else f"Problem {p_idx}",
                        "allTimeSolves": 0
                    }
            return {"status": "OK", "problems": list(unique_probs.values())}

        problems = []
        for tr in table.find_all("tr")[1:]:
            tds = tr.find_all("td")
            if len(tds) >= 2:
                idx = tds[0].text.strip().upper()
                name_div = tds[1].find("div", style=lambda s: s and "float: left" in s) or tds[1]
                p_name = name_div.find("a").text.strip() if name_div.find("a") else tds[1].text.strip()
                
                solves = 0
                if len(tds) > 3:
                    s_text = tds[3].text.strip().replace("x", "").replace("&nbsp;", "").strip()
                    if s_text.isdigit():
                        solves = int(s_text)

                problems.append({
                    "problemIndex": idx,
                    "name": p_name or f"Problem {idx}",
                    "allTimeSolves": solves
                })

        return {"status": "OK", "problems": problems}
    except Exception as e:
        return {"status": "ERROR", "message": str(e), "problems": []}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "ERROR", "message": "Usage: fetch_gym_problems.py <contest_id>"}))
        sys.exit(1)

    cid = sys.argv[1]
    result = scrape_gym_problems(cid)
    print(json.dumps(result, ensure_ascii=False))
